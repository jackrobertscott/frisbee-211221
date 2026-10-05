import type { HTMLAttributes } from 'react';
import { cx } from '../utils';
import './Kbd.css';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  size?: 'sm' | 'md';
}

/** Keyboard key hint. */
export function Kbd({ size = 'md', className, ...rest }: KbdProps) {
  return <kbd className={cx('ui-kbd', className)} data-size={size} {...rest} />;
}
