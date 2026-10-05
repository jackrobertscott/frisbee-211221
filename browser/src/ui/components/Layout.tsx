import { createContext, forwardRef, useContext, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronRight, PanelLeft } from 'lucide-react';
import { cx } from '../utils';
import { Tooltip } from './Tooltip';
import './Layout.css';

/* ------------------------------------------------------------------------ */
/* Stack                                                                     */
/* ------------------------------------------------------------------------ */

type Space = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column';
  /** Gap in spacing units (multiples of --ui-space). */
  gap?: Space;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  wrap?: boolean;
  /** Take remaining space in a parent flex container. */
  grow?: boolean;
}

/** Flexbox layout primitive spaced with the design-system scale. */
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { direction = 'column', gap = 3, align, justify, wrap, grow, style, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('ui-stack', className)}
      style={{
        flexDirection: direction,
        gap: `calc(var(--ui-space) * ${gap})`,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : undefined,
        flex: grow ? 1 : undefined,
        ...style,
      }}
      {...rest}
    />
  );
});

export const HStack = forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(function HStack({ align = 'center', ...p }, ref) {
  return <Stack ref={ref} direction="row" align={align} {...p} />;
});

/* ------------------------------------------------------------------------ */
/* App shell + sidebar                                                       */
/* ------------------------------------------------------------------------ */

const ShellContext = createContext<{ collapsed: boolean; setCollapsed: (c: boolean) => void }>({ collapsed: false, setCollapsed: () => {} });
export const useAppShell = () => useContext(ShellContext);

export interface AppShellProps {
  sidebar: ReactNode;
  children: ReactNode;
  /** Render as a rounded window floating on the canvas (as in the reference). */
  framed?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function AppShell({ sidebar, children, framed, defaultCollapsed = false, className, style }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <ShellContext.Provider value={{ collapsed, setCollapsed }}>
      <div className={cx('ui-shell', framed && 'ui-shell--framed', className)} data-collapsed={collapsed || undefined} style={style}>
        {sidebar}
        <main className="ui-shell__main">{children}</main>
      </div>
    </ShellContext.Provider>
  );
}

export function Sidebar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <aside className={cx('ui-sidebar', className)}>
      <nav className="ui-sidebar__inner">{children}</nav>
    </aside>
  );
}

export function SidebarHeader({ logo, title, action }: { logo?: ReactNode; title?: ReactNode; action?: ReactNode }) {
  const { collapsed, setCollapsed } = useAppShell();
  return (
    <div className="ui-sidebar__header">
      {logo && <span className="ui-sidebar__logo">{logo}</span>}
      {title && <span className="ui-sidebar__title">{title}</span>}
      <span className="ui-sidebar__header-action">
        {action ?? (
          <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <button type="button" className="ui-control__btn" aria-label="Toggle sidebar" onClick={() => setCollapsed(!collapsed)}>
              <PanelLeft />
            </button>
          </Tooltip>
        )}
      </span>
    </div>
  );
}

export function SidebarFooter({ children }: { children: ReactNode }) {
  return <div className="ui-sidebar__footer">{children}</div>;
}

export interface NavSectionProps {
  title?: ReactNode;
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function NavSection({ title, action, collapsible, defaultOpen = true, children }: NavSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ui-nav-section">
      {title && (
        <div className="ui-nav-section__head">
          {collapsible ? (
            <button type="button" className="ui-nav-section__title" aria-expanded={open} onClick={() => setOpen(!open)}>
              {title}
            </button>
          ) : (
            <span className="ui-nav-section__title">{title}</span>
          )}
          {action}
        </div>
      )}
      {open && <ul className="ui-nav-section__list">{children}</ul>}
    </div>
  );
}

export interface NavItemProps {
  icon?: ReactNode;
  label: ReactNode;
  active?: boolean;
  /** Badge / count on the right. */
  badge?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Nested items, shown as a collapsible group. */
  children?: ReactNode;
  defaultOpen?: boolean;
}

export function NavItem({ icon, label, active, badge, href, onClick, children, defaultOpen }: NavItemProps) {
  const { collapsed } = useAppShell();
  const [open, setOpen] = useState(!!defaultOpen);
  const hasKids = !!children;
  const inner = (
    <>
      {hasKids && !icon && <ChevronRight className="ui-nav-item__chev" data-open={open || undefined} aria-hidden />}
      {icon && <span className="ui-nav-item__icon">{icon}</span>}
      <span className="ui-nav-item__label">{label}</span>
      {badge != null && <span className="ui-nav-item__badge">{badge}</span>}
    </>
  );
  const props = {
    className: 'ui-nav-item',
    'aria-current': active ? ('page' as const) : undefined,
    'aria-expanded': hasKids ? open : undefined,
    onClick: (e: React.MouseEvent) => {
      if (hasKids) setOpen(!open);
      if (onClick) {
        e.preventDefault();
        onClick();
      }
    },
  };
  const el = href && !hasKids ? (
    <a href={href} {...props}>
      {inner}
    </a>
  ) : (
    <button type="button" {...props}>
      {inner}
    </button>
  );
  return (
    <li>
      {collapsed && typeof label === 'string' ? (
        <Tooltip content={label} placement="right" delay={0}>
          {el}
        </Tooltip>
      ) : (
        el
      )}
      {hasKids && open && <ul className="ui-nav-item__children">{children}</ul>}
    </li>
  );
}

/* ------------------------------------------------------------------------ */
/* Page header                                                               */
/* ------------------------------------------------------------------------ */

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Rendered above the title (breadcrumbs, back link). */
  eyebrow?: ReactNode;
  /** Rendered below (tabs). */
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, eyebrow, children, className }: PageHeaderProps) {
  return (
    <header className={cx('ui-page-header', className)}>
      {eyebrow && <div className="ui-page-header__eyebrow">{eyebrow}</div>}
      <div className="ui-page-header__row">
        <div className="ui-page-header__titles">
          <h1 className="ui-page-header__title">{title}</h1>
          {description && <p className="ui-page-header__desc">{description}</p>}
        </div>
        {actions && <div className="ui-page-header__actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Section heading inside a page ("File explorer"). */
export function SectionHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ui-section-header">
      <div>
        <h2 className="ui-section-header__title">{title}</h2>
        {description && <p className="ui-section-header__desc">{description}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
  );
}
