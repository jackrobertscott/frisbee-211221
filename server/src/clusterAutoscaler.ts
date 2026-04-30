import cluster, {Worker} from 'cluster'
import http from 'http'
import os from 'os'
import {performance} from 'perf_hooks'

type WorkerMetricsMessage = {
  type: 'cluster:metrics'
  activeRequests: number
  requestsPerSecond: number
  cpuUtilization: number
  eventLoopUtilization: number
  rssBytes: number
}

type ShutdownWorkerMessage = {
  type: 'cluster:shutdown'
}

type ClusterMessage = WorkerMetricsMessage | ShutdownWorkerMessage

type WorkerSnapshot = WorkerMetricsMessage & {
  receivedAt: number
}

const CPU_COUNT = Math.max(1, os.cpus().length)
const HTTP_CLUSTER_MIN_WORKERS = 1
const HTTP_CLUSTER_MAX_WORKERS = Math.min(5, CPU_COUNT)
const HTTP_CLUSTER_METRICS_INTERVAL_MS = 2000
const HTTP_CLUSTER_SCALE_INTERVAL_MS = 5000
const HTTP_CLUSTER_SCALE_COOLDOWN_MS = 15000
const HTTP_CLUSTER_TARGET_RPS_PER_WORKER = 25
const HTTP_CLUSTER_TARGET_ACTIVE_REQUESTS_PER_WORKER = 16
const HTTP_CLUSTER_TARGET_CPU_UTILIZATION = 0.65
const HTTP_CLUSTER_TARGET_EVENT_LOOP_UTILIZATION = 0.7
const HTTP_CLUSTER_MAX_MEMORY_UTILIZATION = 0.8
const HTTP_CLUSTER_DRAIN_TIMEOUT_MS = 30000

const constrainedMemoryBytes =
  typeof process.constrainedMemory === 'function'
    ? process.constrainedMemory()
    : 0
const totalMemoryBytes =
  constrainedMemoryBytes > 0
    ? Math.min(os.totalmem(), constrainedMemoryBytes)
    : os.totalmem()

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function isWorkerMetricsMessage(
  message: unknown
): message is WorkerMetricsMessage {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'cluster:metrics'
  )
}

function isShutdownWorkerMessage(
  message: unknown
): message is ShutdownWorkerMessage {
  return Boolean(
    message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'cluster:shutdown'
  )
}

function getClusterWorkers() {
  return Object.values(cluster.workers ?? {}).filter(
    (worker): worker is Worker => Boolean(worker)
  )
}

export function startPrimaryCluster() {
  cluster.schedulingPolicy = cluster.SCHED_RR

  const workerSnapshots = new Map<number, WorkerSnapshot>()
  const drainingWorkerIds = new Set<number>()
  let desiredWorkers = HTTP_CLUSTER_MIN_WORKERS
  let lastScaleAt = 0

  function log(message: string) {
    console.log(`[cluster] ${message}`)
  }

  function getServingWorkers() {
    return getClusterWorkers().filter(
      (worker) =>
        !worker.isDead() &&
        worker.isConnected() &&
        !drainingWorkerIds.has(worker.id)
    )
  }

  function syncToDesiredCount(reason: string) {
    while (getServingWorkers().length < desiredWorkers) {
      const worker = cluster.fork()
      log(`forked worker ${worker.id} (${reason})`)
    }
  }

  function scaleUp(reason: string) {
    const currentWorkers = getServingWorkers().length
    if (currentWorkers >= HTTP_CLUSTER_MAX_WORKERS) return
    desiredWorkers = clamp(
      desiredWorkers + 1,
      HTTP_CLUSTER_MIN_WORKERS,
      HTTP_CLUSTER_MAX_WORKERS
    )
    lastScaleAt = Date.now()
    syncToDesiredCount(reason)
    log(`scaled up to ${desiredWorkers} workers (${reason})`)
  }

  function pickWorkerToDrain() {
    return getServingWorkers()
      .map((worker) => ({
        worker,
        snapshot: workerSnapshots.get(worker.id),
      }))
      .sort((left, right) => {
        const leftActive = left.snapshot?.activeRequests ?? Number.MAX_SAFE_INTEGER
        const rightActive =
          right.snapshot?.activeRequests ?? Number.MAX_SAFE_INTEGER
        if (leftActive !== rightActive) return leftActive - rightActive
        const leftRps = left.snapshot?.requestsPerSecond ?? Number.MAX_SAFE_INTEGER
        const rightRps =
          right.snapshot?.requestsPerSecond ?? Number.MAX_SAFE_INTEGER
        return leftRps - rightRps
      })[0]?.worker
  }

  function scaleDown(reason: string) {
    const currentWorkers = getServingWorkers().length
    if (currentWorkers <= HTTP_CLUSTER_MIN_WORKERS) return

    desiredWorkers = clamp(
      desiredWorkers - 1,
      HTTP_CLUSTER_MIN_WORKERS,
      HTTP_CLUSTER_MAX_WORKERS
    )
    const worker = pickWorkerToDrain()
    if (!worker) {
      desiredWorkers = currentWorkers
      return
    }

    drainingWorkerIds.add(worker.id)
    lastScaleAt = Date.now()
    const shutdownMessage: ShutdownWorkerMessage = {type: 'cluster:shutdown'}
    worker.send(shutdownMessage)
    log(`scaling down to ${desiredWorkers} workers (${reason})`)
  }

  function evaluateScaling() {
    const now = Date.now()
    const currentWorkers = getServingWorkers().length

    if (currentWorkers < HTTP_CLUSTER_MIN_WORKERS) {
      desiredWorkers = HTTP_CLUSTER_MIN_WORKERS
      syncToDesiredCount('restore-minimum')
      return
    }

    if (now - lastScaleAt < HTTP_CLUSTER_SCALE_COOLDOWN_MS) return

    const freshnessCutoff =
      now - HTTP_CLUSTER_SCALE_INTERVAL_MS - HTTP_CLUSTER_METRICS_INTERVAL_MS
    const freshSnapshots = getServingWorkers()
      .map((worker) => workerSnapshots.get(worker.id))
      .filter((snapshot): snapshot is WorkerSnapshot =>
        Boolean(snapshot && snapshot.receivedAt >= freshnessCutoff)
      )

    if (!freshSnapshots.length) return

    const totals = freshSnapshots.reduce(
      (acc, snapshot) => {
        acc.activeRequests += snapshot.activeRequests
        acc.requestsPerSecond += snapshot.requestsPerSecond
        acc.cpuUtilization += snapshot.cpuUtilization
        acc.eventLoopUtilization += snapshot.eventLoopUtilization
        acc.rssBytes += snapshot.rssBytes
        return acc
      },
      {
        activeRequests: 0,
        requestsPerSecond: 0,
        cpuUtilization: 0,
        eventLoopUtilization: 0,
        rssBytes: 0,
      }
    )

    const activeWorkerCount = freshSnapshots.length
    const avgCpuUtilization = totals.cpuUtilization / activeWorkerCount
    const avgEventLoopUtilization =
      totals.eventLoopUtilization / activeWorkerCount
    const memoryUtilization =
      totalMemoryBytes > 0 ? totals.rssBytes / totalMemoryBytes : 0

    const desiredByRequests = Math.ceil(
      totals.requestsPerSecond / HTTP_CLUSTER_TARGET_RPS_PER_WORKER
    )
    const desiredByConcurrency = Math.ceil(
      totals.activeRequests / HTTP_CLUSTER_TARGET_ACTIVE_REQUESTS_PER_WORKER
    )
    const desiredByCpu = Math.ceil(
      (avgCpuUtilization * currentWorkers) / HTTP_CLUSTER_TARGET_CPU_UTILIZATION
    )
    const desiredByEventLoop = Math.ceil(
      (avgEventLoopUtilization * currentWorkers) /
        HTTP_CLUSTER_TARGET_EVENT_LOOP_UTILIZATION
    )

    const desiredFromLoad = clamp(
      Math.max(
        HTTP_CLUSTER_MIN_WORKERS,
        desiredByRequests,
        desiredByConcurrency,
        desiredByCpu,
        desiredByEventLoop
      ),
      HTTP_CLUSTER_MIN_WORKERS,
      HTTP_CLUSTER_MAX_WORKERS
    )

    if (
      desiredFromLoad > currentWorkers &&
      memoryUtilization < HTTP_CLUSTER_MAX_MEMORY_UTILIZATION
    ) {
      scaleUp(
        `load rps=${totals.requestsPerSecond.toFixed(1)} active=${totals.activeRequests} cpu=${avgCpuUtilization.toFixed(2)} elu=${avgEventLoopUtilization.toFixed(2)}`
      )
      return
    }

    if (desiredFromLoad < currentWorkers) {
      scaleDown(
        `load rps=${totals.requestsPerSecond.toFixed(1)} active=${totals.activeRequests} cpu=${avgCpuUtilization.toFixed(2)} elu=${avgEventLoopUtilization.toFixed(2)} mem=${memoryUtilization.toFixed(2)}`
      )
    }
  }

  cluster.on('message', (worker, message) => {
    if (!isWorkerMetricsMessage(message)) return

    workerSnapshots.set(worker.id, {
      ...message,
      receivedAt: Date.now(),
    })
  })

  cluster.on('exit', (worker, code, signal) => {
    workerSnapshots.delete(worker.id)
    drainingWorkerIds.delete(worker.id)

    const exitReason =
      signal ? `signal ${signal}` : code === 0 ? 'exit 0' : `exit ${code}`
    log(`worker ${worker.id} stopped (${exitReason})`)

    if (getServingWorkers().length < desiredWorkers) {
      syncToDesiredCount('worker-exit')
    }
  })

  syncToDesiredCount('startup')

  const scaleTimer = setInterval(evaluateScaling, HTTP_CLUSTER_SCALE_INTERVAL_MS)
  scaleTimer.unref()
}

export function attachWorkerClusterLifecycle(server: http.Server) {
  if (!cluster.isWorker) return

  let activeRequests = 0
  let completedRequests = 0
  let isDraining = false
  let lastReportAt = performance.now()
  let lastCpuUsage = process.cpuUsage()
  let lastEventLoopUtilization = performance.eventLoopUtilization()

  function maybeDecrementActiveRequests() {
    activeRequests = Math.max(0, activeRequests - 1)
  }

  server.on('request', (_req, res) => {
    activeRequests += 1
    if (isDraining) res.setHeader('Connection', 'close')

    let finished = false
    const onComplete = () => {
      if (finished) return
      finished = true
      completedRequests += 1
      maybeDecrementActiveRequests()
    }

    res.once('finish', onComplete)
    res.once('close', onComplete)
  })

  function sendWorkerMetrics() {
    if (!process.send) return

    const now = performance.now()
    const elapsedMs = Math.max(1, now - lastReportAt)
    const currentCpuUsage = process.cpuUsage()
    const cpuUsageMicros =
      currentCpuUsage.user -
      lastCpuUsage.user +
      (currentCpuUsage.system - lastCpuUsage.system)
    const currentEventLoopUtilization = performance.eventLoopUtilization()
    const eventLoopDelta = performance.eventLoopUtilization(
      lastEventLoopUtilization
    )
    const requestsPerSecond = completedRequests / (elapsedMs / 1000)
    const metricsMessage: WorkerMetricsMessage = {
      type: 'cluster:metrics',
      activeRequests,
      requestsPerSecond,
      cpuUtilization: clamp(cpuUsageMicros / (elapsedMs * 1000), 0, 1),
      eventLoopUtilization: clamp(eventLoopDelta.utilization, 0, 1),
      rssBytes: process.memoryUsage().rss,
    }

    process.send(metricsMessage)

    completedRequests = 0
    lastReportAt = now
    lastCpuUsage = currentCpuUsage
    lastEventLoopUtilization = currentEventLoopUtilization
  }

  function beginShutdown() {
    if (isDraining) return

    isDraining = true
    server.closeIdleConnections?.()
    server.close(() => {
      process.exit(0)
    })

    const forceExitTimer = setTimeout(() => {
      process.exit(0)
    }, HTTP_CLUSTER_DRAIN_TIMEOUT_MS)
    forceExitTimer.unref()
  }

  process.on('message', (message: ClusterMessage) => {
    if (isShutdownWorkerMessage(message)) beginShutdown()
  })
  process.on('disconnect', beginShutdown)

  const metricsTimer = setInterval(
    sendWorkerMetrics,
    HTTP_CLUSTER_METRICS_INTERVAL_MS
  )
  metricsTimer.unref()
}
