export const initials = (data?: string) =>
  data
    ? data
        .split(' ')
        .map((i) => (Number.isNaN(parseInt(i)) ? i.charAt(0) : i))
        .join('')
    : '[?]'
