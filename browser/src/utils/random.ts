export const random = {
  /**
   *
   */
  alphanumerics:
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''),
  /**
   *
   */
  randomString(length: number = 10) {
    let value = ''
    const max = this.alphanumerics.length
    for (let i = 0; i < length; i++) {
      let q = Math.floor(Math.random() * max)
      value += this.alphanumerics[q]
    }
    return value
  },
}
