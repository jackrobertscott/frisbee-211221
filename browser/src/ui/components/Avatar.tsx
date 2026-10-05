import { Children, isValidElement, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../utils';
import './Avatar.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  src?: string;
  name?: string;
  size?: AvatarSize;
  shape?: 'circle' | 'square';
  status?: 'online' | 'away' | 'busy' | 'offline';
  /** Custom fallback content (icon). */
  fallback?: ReactNode;
}

function initials(name?: string) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Image avatar that falls back to initials (as in the reference design). */
export function Avatar({ src, name, size = 'md', shape = 'circle', status, fallback, className, ...rest }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <span className={cx('ui-avatar', className)} data-size={size} data-shape={shape} role="img" aria-label={name} {...rest}>
      {showImg ? (
        <img src={src} alt="" onError={() => setFailed(true)} draggable={false} />
      ) : (
        <span className="ui-avatar__fallback" aria-hidden>
          {fallback ?? initials(name)}
        </span>
      )}
      {status && <span className="ui-avatar__status" data-status={status} />}
    </span>
  );
}

export interface AvatarGroupProps {
  children: ReactNode;
  /** Show at most this many, then "+N". */
  max?: number;
  size?: AvatarSize;
}

export function AvatarGroup({ children, max = 4, size = 'md' }: AvatarGroupProps) {
  const all = Children.toArray(children).filter(isValidElement);
  const shown = all.slice(0, max);
  const extra = all.length - shown.length;
  return (
    <span className="ui-avatar-group" data-size={size}>
      {shown}
      {extra > 0 && (
        <span className="ui-avatar ui-avatar--more" data-size={size} data-shape="circle">
          <span className="ui-avatar__fallback">+{extra}</span>
        </span>
      )}
    </span>
  );
}
