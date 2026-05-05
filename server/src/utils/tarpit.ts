import {ServerResponse} from 'http'

export interface ITarpitPlan {
  body: string
  dripIntervalMs: number
  holdMs: number
  statusCode: number
}

const MAX_CONCURRENT_TARPITS = 24

let activeTarpits = 0

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

export default {
  async respond(res: ServerResponse, plan: ITarpitPlan) {
    if (res.writableEnded) return
    if (activeTarpits >= MAX_CONCURRENT_TARPITS) {
      res.statusCode = plan.statusCode
      res.setHeader('Cache-Control', 'no-store, max-age=0')
      res.setHeader('Connection', 'close')
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(plan.body)
      return
    }

    let closed = false
    const onClose = () => {
      closed = true
    }

    activeTarpits += 1
    res.once('close', onClose)
    res.statusCode = plan.statusCode
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.setHeader('Connection', 'close')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.flushHeaders()

    try {
      const startedAt = Date.now()
      res.write(' ')

      while (!closed) {
        const elapsedMs = Date.now() - startedAt
        const remainingMs = plan.holdMs - elapsedMs
        if (remainingMs <= 0) break

        const waitMs = Math.min(plan.dripIntervalMs, remainingMs)
        await wait(waitMs)

        if (closed || res.writableEnded) return
        if (waitMs === plan.dripIntervalMs) res.write(' ')
      }

      if (!closed && !res.writableEnded) res.end(plan.body)
    } finally {
      activeTarpits = Math.max(0, activeTarpits - 1)
      res.off('close', onClose)
    }
  },
}
