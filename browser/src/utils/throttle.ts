export const throttle = {
  /**
   * Execute callback then set status to waiting for the given timeout
   * time period. All attempts to execute the callback while the status
   * is waiting will wait until the waiting period is over before
   * executing. Consecutive callback executions during the timeout period
   * will replace their prior.
   */
  drip: (timeout: number, cb: (...args: any[]) => void) => {
    let last: number | undefined
    let next: undefined | (() => void)
    return (...args: any[]) => {
      next = () => {
        cb(...args)
        last = Date.now()
        setTimeout(() => {
          if (next) next()
          next = undefined
        }, timeout)
      }
      if (!last || Date.now() - last > timeout) {
        next()
      }
    }
  },
  /**
   * Fire a callback at least the "timeout" specified time since
   * the last time the callback was fired or set.
   */
  sling: (timeout: number, cb: (...args: any[]) => void) => {
    let last: undefined | number
    let next: undefined | (() => void)
    let time: any
    return (...args: any[]) => {
      last = Date.now()
      next = () => cb(...args)
      const delay = () => {
        if (last && Date.now() - timeout >= last) {
          if (!next) return
          next()
          next = undefined
        } else {
          if (time) clearTimeout(time)
          time = setTimeout(delay, timeout)
        }
      }
      delay()
    }
  },
  /**
   * Execute a number of callbacks (with an upper limit of max) then set
   * status to waiting for the given timeout time period. All attempts to
   * execute the callback while the status is waiting will be added to the
   * callback queue and will wait until the queue has executed all other
   * callbacks given the same maximum upper limit.
   */
  dribble: <T>(
    max: number,
    timeout: number,
    cb: (...args: any[]) => Promise<T>
  ) => {
    if (max < 1) throw new Error('Dribble max can not be less than 1')
    let waiting = false
    let queue: Array<() => void> = []
    return (...args: any[]): Promise<T> => {
      const go = () => {
        if (waiting) return
        waiting = true
        const tasks = queue.slice(0, max)
        queue = queue.slice(max, queue.length)
        for (const task of tasks) task()
        setTimeout(() => {
          waiting = false
          if (queue.length) go()
        }, timeout)
      }
      return new Promise<T>((resolve, reject) => {
        queue.push(() => resolve(cb(...args)))
        try {
          go()
        } catch (error) {
          reject(error)
        }
      })
    }
  },
  /**
   * Execute callback then set status to unavailable for the allocated
   * timeout time period. All attempts to execute the callback while the
   * status is unavailable will be ignored.
   */
  halter: (timeout: number, cb: (...args: any[]) => void) => {
    let available = true
    return (...args: any[]) => {
      if (available) {
        cb(...args)
        available = false
        setTimeout(() => {
          available = true
        }, timeout)
      }
    }
  },
}
