import createDOMPurify from 'dompurify'
import {JSDOM} from 'jsdom'
/**
 *
 */
export const purify = createDOMPurify(new JSDOM().window as any)
