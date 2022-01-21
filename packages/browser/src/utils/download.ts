/**
 *
 */
export const download = {
  /**
   *
   */
  blob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.target = '_blank'
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  },
}
