export const html = {
  escape(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  },

  /** Escape plain text and keep its line breaks. */
  fromText(value: string) {
    return html.escape(value).replace(/\r?\n/g, '<br/>')
  },
}
