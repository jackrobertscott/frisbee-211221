export const initials = (data?: string) =>
  data
    ? data
        .split(' ')
        .map((i) => i.charAt(0))
        .join('')
    : '[?]'
