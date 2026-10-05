import type { AnchorHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { cx } from '../utils';
import './Typography.css';

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4;
  /** Visual size, independent of the semantic level. */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

const levelSize = { 1: '2xl', 2: 'xl', 3: 'lg', 4: 'md' } as const;

export function Heading({ level = 2, size, className, ...rest }: HeadingProps) {
  const Tag = `h${level}` as ElementType;
  return <Tag className={cx('ui-heading', className)} data-size={size ?? levelSize[level]} {...rest} />;
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  tone?: 'default' | 'secondary' | 'tertiary' | 'danger' | 'success';
  weight?: 'regular' | 'medium' | 'semibold';
  mono?: boolean;
  truncate?: boolean;
}

export function Text({ as: Tag = 'p', size = 'md', tone = 'default', weight, mono, truncate, className, ...rest }: TextProps) {
  return (
    <Tag
      className={cx('ui-text', mono && 'ui-text--mono', truncate && 'ui-text--truncate', className)}
      data-size={size}
      data-tone={tone}
      data-weight={weight}
      {...rest}
    />
  );
}

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  external?: boolean;
  subtle?: boolean;
  children: ReactNode;
}

export function Link({ external, subtle, className, children, ...rest }: LinkProps) {
  return (
    <a
      className={cx('ui-link', subtle && 'ui-link--subtle', className)}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer noopener' : undefined}
      {...rest}
    >
      {children}
      {external && <ExternalLink className="ui-link__ext" aria-hidden />}
    </a>
  );
}

/** Inline code. */
export function Code({ children }: { children: ReactNode }) {
  return <code className="ui-code">{children}</code>;
}
