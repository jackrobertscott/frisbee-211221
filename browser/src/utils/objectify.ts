export const objectify = {
  /**
   *
   */
  pick<X extends Record<string, any>, Y extends keyof X>(
    obj: X,
    keys: Y[]
  ): Pick<X, Y> {
    return Object.keys(obj).reduce((all: any, key: any) => {
      if (keys.includes(key)) all[key] = obj[key]
      return all
    }, {})
  },
  /**
   *
   */
  omit<X extends Record<string, any>, Y extends keyof X>(
    obj: X,
    keys: Y[]
  ): Omit<X, Y> {
    return Object.keys(obj).reduce((all: any, key: any) => {
      if (!keys.includes(key)) all[key] = obj[key]
      return all
    }, {})
  },
  /**
   *
   */
  sortKeys(obj: object) {
    return Object.entries(obj)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, _value]) => {
        const value: any =
          typeof _value === 'object' ? this.sortKeys(_value) : _value
        return [key, value]
      })
      .reduce((all: any, next) => {
        all[next[0]] = next[1]
        return all
      }, {})
  },
  /**
   *
   */
  compare: (a: object, b: object) => {
    const _a = objectify.sortKeys(a)
    const _b = objectify.sortKeys(b)
    return JSON.stringify(_a) === JSON.stringify(_b)
  },
  /**
   *
   */
  compareKeys<A extends Record<string, any>, B extends A, K extends keyof A>(
    a: A,
    b: B,
    keys: K[]
  ) {
    const _a = this.sortKeys(this.pick(a, keys))
    const _b = this.sortKeys(this.pick(b, keys))
    return JSON.stringify(_a) === JSON.stringify(_b)
  },
  /**
   *
   */
  clone<T extends object>(a: T): T {
    return JSON.parse(JSON.stringify(a))
  },
}
