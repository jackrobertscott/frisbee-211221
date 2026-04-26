import {randomInt} from 'crypto'

export const random = {

  alphanumerics:
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''),

  randomString(length: number = 10) {
    let value = ''
    const max = this.alphanumerics.length
    for (let i = 0; i < length; i++) {
      value += this.alphanumerics[randomInt(0, max)]
    }
    return value
  },

  generateId() {
    return this.randomString(24)
  },
}
