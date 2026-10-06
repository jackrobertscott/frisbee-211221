import {EventEmitter} from 'node:events'
import http from 'node:http'
import {performance} from 'node:perf_hooks'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {attachWorkerClusterLifecycle, startPrimaryCluster} from './cluster'

type TMessageHandler = (worker: FakeWorker, message: unknown) => void
type TExitHandler = (worker: FakeWorker, code: number, signal: string | null) => void

class FakeWorker {
  dead = false
  connected = true
  messages: unknown[] = []
  constructor(public id: number) {}
  isDead() {
    return this.dead
  }
  isConnected() {
    return this.connected
  }
  send(message: unknown) {
    this.messages.push(message)
    return true
  }
}

const fake = vi.hoisted(() => {
  const state = {
    nextId: 1,
    workers: {} as Record<number, FakeWorker>,
    messageHandlers: [] as TMessageHandler[],
    exitHandlers: [] as TExitHandler[],
    createWorker: (_id: number): FakeWorker => {
      throw new Error('not ready')
    },
  }
  const cluster = {
    SCHED_RR: 2,
    schedulingPolicy: 0,
    isWorker: false,
    get workers() {
      return state.workers
    },
    fork: () => {
      const worker = state.createWorker(state.nextId)
      state.nextId += 1
      state.workers[worker.id] = worker
      return worker
    },
    on: (event: string, handler: TMessageHandler | TExitHandler) => {
      if (event === 'message') state.messageHandlers.push(handler as TMessageHandler)
      if (event === 'exit') state.exitHandlers.push(handler as TExitHandler)
    },
  }
  return {state, cluster}
})

vi.mock('cluster', () => ({default: fake.cluster}))
vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>()
  const cpus = os.cpus()
  return {
    default: {
      ...os,
      cpus: () => Array.from({length: 4}, () => cpus[0]),
      totalmem: () => 8 * 1024 ** 3,
    },
  }
})

const metrics = (overrides: Record<string, number> = {}) => ({
  type: 'cluster:metrics',
  activeRequests: 0,
  requestsPerSecond: 0,
  cpuUtilization: 0,
  eventLoopUtilization: 0,
  rssBytes: 1000,
  ...overrides,
})

const report = (worker: FakeWorker, overrides: Record<string, number> = {}) => {
  for (const handler of fake.state.messageHandlers) handler(worker, metrics(overrides))
}

const exit = (worker: FakeWorker, code: number, signal: string | null = null) => {
  worker.dead = true
  delete fake.state.workers[worker.id]
  for (const handler of fake.state.exitHandlers) handler(worker, code, signal)
}

const serving = () =>
  Object.values(fake.state.workers).filter((worker) => !worker.dead)

const logLines = () => vi.mocked(console.log).mock.calls.map((call) => String(call[0]))

/** Moves to the next scaling check, reporting fresh metrics from every worker first. */
const nextCheck = async (overrides: Record<string, number> = {}) => {
  for (const worker of serving()) report(worker, overrides)
  await vi.advanceTimersByTimeAsync(5_000)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  fake.state.nextId = 1
  fake.state.workers = {}
  fake.state.messageHandlers = []
  fake.state.exitHandlers = []
  fake.state.createWorker = (id) => new FakeWorker(id)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('startPrimaryCluster', () => {
  it('starts one worker with round-robin scheduling', () => {
    startPrimaryCluster()
    expect(fake.cluster.schedulingPolicy).toBe(fake.cluster.SCHED_RR)
    expect(serving().map((worker) => worker.id)).toEqual([1])
    expect(logLines()).toEqual(['[cluster] forked worker 1 (startup)'])
  })

  it('scales up one worker per cooldown while load stays high, up to the CPU cap', async () => {
    startPrimaryCluster()
    // 100 rps needs four workers at 25 rps each
    await nextCheck({requestsPerSecond: 100})
    expect(serving()).toHaveLength(2)
    expect(logLines().at(-1)).toBe(
      '[cluster] scaled up to 2 workers (load rps=100.0 active=0 cpu=0.00 elu=0.00)',
    )

    // still inside the 15 second cooldown
    await nextCheck({requestsPerSecond: 50})
    await nextCheck({requestsPerSecond: 50})
    expect(serving()).toHaveLength(2)

    for (let index = 0; index < 12; index += 1) {
      await nextCheck({requestsPerSecond: 100, activeRequests: 100})
    }
    // four CPUs cap the cluster at four workers
    expect(serving()).toHaveLength(4)
  })

  it.each([
    ['active requests', {activeRequests: 20}],
    ['CPU', {cpuUtilization: 0.9}],
    ['event loop', {eventLoopUtilization: 0.9}],
  ])('scales up on %s', async (_label, overrides) => {
    startPrimaryCluster()
    await nextCheck(overrides)
    expect(serving()).toHaveLength(2)
  })

  it('does not scale up when memory is nearly exhausted', async () => {
    startPrimaryCluster()
    await nextCheck({requestsPerSecond: 100, rssBytes: 7 * 1024 ** 3})
    expect(serving()).toHaveLength(1)
  })

  it('ignores stale metrics and other messages', async () => {
    startPrimaryCluster()
    const [worker] = serving()
    for (const handler of fake.state.messageHandlers) handler(worker, {type: 'other'})
    await vi.advanceTimersByTimeAsync(5_000)
    expect(serving()).toHaveLength(1)

    report(worker, {requestsPerSecond: 100})
    await vi.advanceTimersByTimeAsync(5_000)
    expect(serving()).toHaveLength(2)
    // without fresh reports the old high load is not acted on again
    await vi.advanceTimersByTimeAsync(60_000)
    expect(serving()).toHaveLength(2)
  })

  it('drains the least busy worker when load drops and replaces only lost capacity', async () => {
    startPrimaryCluster()
    await nextCheck({requestsPerSecond: 40})
    expect(serving()).toHaveLength(2)
    const [first, second] = serving()

    await vi.advanceTimersByTimeAsync(15_000)
    report(first, {activeRequests: 3, requestsPerSecond: 1})
    report(second, {activeRequests: 1, requestsPerSecond: 1})
    await vi.advanceTimersByTimeAsync(5_000)

    expect(second.messages).toEqual([{type: 'cluster:shutdown'}])
    expect(first.messages).toEqual([])
    expect(logLines().at(-1)).toMatch(/^\[cluster\] scaling down to 1 workers \(load /)

    // the drained worker exits without being replaced
    exit(second, 0)
    expect(serving()).toEqual([first])
    expect(logLines().at(-1)).toBe('[cluster] worker 2 stopped (exit 0)')

    // a crashed worker is replaced straight away
    exit(first, 1)
    expect(serving().map((worker) => worker.id)).toEqual([3])
    expect(logLines().slice(-2)).toEqual([
      '[cluster] worker 1 stopped (exit 1)',
      '[cluster] forked worker 3 (worker-exit)',
    ])
  })

  it('reports signals and restores the minimum when no worker is serving', async () => {
    startPrimaryCluster()
    const [worker] = serving()
    worker.connected = false
    await vi.advanceTimersByTimeAsync(5_000)
    expect(logLines().at(-1)).toBe('[cluster] forked worker 2 (restore-minimum)')

    exit(worker, 0, 'SIGKILL')
    expect(logLines()).toContain('[cluster] worker 1 stopped (signal SIGKILL)')
  })

  it('never drains the last worker', async () => {
    startPrimaryCluster()
    await nextCheck()
    await nextCheck()
    expect(serving()[0].messages).toEqual([])
  })
})

describe('attachWorkerClusterLifecycle', () => {
  const processListeners = () => ({
    message: process.listeners('message'),
    disconnect: process.listeners('disconnect'),
  })

  let before: ReturnType<typeof processListeners>
  let sent: unknown[]
  const originalSend = Object.getOwnPropertyDescriptor(process, 'send')

  beforeEach(() => {
    before = processListeners()
    sent = []
    Object.defineProperty(process, 'send', {
      configurable: true,
      writable: true,
      value: (message: unknown) => {
        sent.push(message)
        return true
      },
    })
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    fake.cluster.isWorker = false
    const after = processListeners()
    for (const listener of after.message) {
      if (!before.message.includes(listener)) process.off('message', listener)
    }
    for (const listener of after.disconnect) {
      if (!before.disconnect.includes(listener)) process.off('disconnect', listener)
    }
    if (originalSend) Object.defineProperty(process, 'send', originalSend)
    else Reflect.deleteProperty(process, 'send')
  })

  const fakeResponse = () => Object.assign(new EventEmitter(), {setHeader: vi.fn()})

  it('does nothing outside a worker', () => {
    const server = new http.Server()
    attachWorkerClusterLifecycle(server)
    expect(server.listenerCount('request')).toBe(0)
  })

  it('reports request metrics to the primary', async () => {
    fake.cluster.isWorker = true
    let nowMs = 0
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
    const server = new http.Server()
    attachWorkerClusterLifecycle(server)

    const done = fakeResponse()
    const open = fakeResponse()
    server.emit('request', {}, done)
    server.emit('request', {}, open)
    done.emit('finish')
    // finish and close for one response only count once
    done.emit('close')

    nowMs = 2_000
    await vi.advanceTimersByTimeAsync(2_000)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({type: 'cluster:metrics', activeRequests: 1})
    expect(sent[0]).toMatchObject({requestsPerSecond: 0.5})
    expect(sent[0]).toHaveProperty('cpuUtilization', expect.any(Number))

    open.emit('close')
    nowMs = 4_000
    await vi.advanceTimersByTimeAsync(2_000)
    expect(sent[1]).toMatchObject({activeRequests: 0, requestsPerSecond: 0.5})
  })

  it('drains on a shutdown message and exits once closed or after a timeout', async () => {
    fake.cluster.isWorker = true
    const server = new http.Server()
    const close = vi.spyOn(server, 'close')
    attachWorkerClusterLifecycle(server)

    process.emit('message', {type: 'something-else'}, undefined)
    expect(close).not.toHaveBeenCalled()

    process.emit('message', {type: 'cluster:shutdown'}, undefined)
    expect(close).toHaveBeenCalledTimes(1)
    // a second shutdown signal does not close again
    process.emit('disconnect')
    expect(close).toHaveBeenCalledTimes(1)

    const response = fakeResponse()
    server.emit('request', {}, response)
    expect(response.setHeader).toHaveBeenCalledWith('Connection', 'close')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(process.exit).toHaveBeenCalledWith(0)
  })
})
