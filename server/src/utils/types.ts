export type Simplify<A> = A extends (infer X)[]
  ? Simplify<X>[]
  : A extends object
    ? {[K in keyof A]: Simplify<A[K]>}
    : A
