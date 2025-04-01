export const contextNoop = (key: string) => (): any =>
  console.warn(`Context function "${key}()" is not correctly setup.`)
