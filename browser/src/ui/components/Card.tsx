import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../utils';
import './Card.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** outline = bordered surface; elevated = shadow; subtle = tinted well; ghost = no chrome. */
  variant?: 'outline' | 'elevated' | 'subtle' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover affordance for clickable cards. */
  interactive?: boolean;
  selected?: boolean;
}

/** Surface container. Compose with CardHeader / CardBody / CardFooter, or use padding. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'outline', padding = 'none', interactive, selected, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('ui-card', className)}
      data-variant={variant}
      data-padding={padding}
      data-interactive={interactive || undefined}
      data-selected={selected || undefined}
      {...rest}
    />
  );
});

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions. */
  actions?: ReactNode;
  icon?: ReactNode;
  divider?: boolean;
}

export function CardHeader({ title, description, actions, icon, divider, className, children, ...rest }: CardHeaderProps) {
  return (
    <div className={cx('ui-card__header', divider && 'ui-card__header--divider', className)} {...rest}>
      {icon && <span className="ui-icon-tile">{icon}</span>}
      <div className="ui-card__titles">
        {title && <h3 className="ui-card__title">{title}</h3>}
        {description && <p className="ui-card__desc">{description}</p>}
        {children}
      </div>
      {actions && <div className="ui-card__actions">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-card__body', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-card__footer', className)} {...rest} />;
}

/** The small bordered icon square used throughout the reference design. */
export function IconTile({ children, size = 'md', className }: { children: ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cx('ui-icon-tile', className)} data-size={size}>
      {children}
    </span>
  );
}
