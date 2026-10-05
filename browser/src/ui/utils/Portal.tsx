import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** Renders children into document.body (outside clipping/overflow contexts). */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
