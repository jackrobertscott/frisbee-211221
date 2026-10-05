import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cx, Floating, useControllable, type Anchor, type Placement, type VirtualAnchor } from '../utils';
import './Menu.css';

/* ------------------------------------------------------------------------ */
/* Contexts                                                                  */
/* ------------------------------------------------------------------------ */

interface RootCtx {
  closeAll: () => void;
}
const MenuRootContext = createContext<RootCtx>({ closeAll: () => {} });

interface PanelCtx {
  openSub: string | null;
  setOpenSub: (id: string | null, delay?: number) => void;
  cancelSubClose: () => void;
}
const PanelContext = createContext<PanelCtx | null>(null);

const ITEM_SELECTOR = '[role^="menuitem"]:not([aria-disabled="true"])';

/* ------------------------------------------------------------------------ */
/* Panel: one floating list of items with keyboard navigation               */
/* ------------------------------------------------------------------------ */

interface PanelProps {
  open: boolean;
  anchor: Anchor;
  placement: Placement;
  onClose: () => void;
  focusFirst: boolean;
  isSub?: boolean;
  onPointerEnter?: () => void;
  minWidth?: number;
  className?: string;
  children: ReactNode;
}

function MenuPanel({ open, anchor, placement, onClose, focusFirst, isSub, onPointerEnter, minWidth, className, children }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSubState] = useState<string | null>(null);
  const timer = useRef(0);
  const typeBuf = useRef({ s: '', t: 0 });

  const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  useEffect(() => {
    if (!open) {
      setOpenSubState(null);
      return;
    }
    const raf = requestAnimationFrame(() => {
      if (focusFirst) items()[0]?.focus();
      else ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, focusFirst]);

  const panelCtx: PanelCtx = {
    openSub,
    setOpenSub: (id, delay = 0) => {
      window.clearTimeout(timer.current);
      if (delay) timer.current = window.setTimeout(() => setOpenSubState(id), delay);
      else setOpenSubState(id);
    },
    cancelSubClose: () => window.clearTimeout(timer.current),
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Only handle keys for this panel (not bubbling from a nested portal tree).
    if (!ref.current?.contains(e.target as Node)) return;
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const focus = (n: number) => list[(n + list.length) % list.length]?.focus();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focus(i + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focus(i < 0 ? list.length - 1 : i - 1);
        break;
      case 'Home':
        e.preventDefault();
        focus(0);
        break;
      case 'End':
        e.preventDefault();
        focus(list.length - 1);
        break;
      case 'ArrowLeft':
        if (isSub) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        break;
      case 'Tab':
        e.preventDefault();
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const b = typeBuf.current;
          window.clearTimeout(b.t);
          b.s += e.key.toLowerCase();
          b.t = window.setTimeout(() => (b.s = ''), 500);
          const start = b.s.length === 1 ? i + 1 : Math.max(i, 0);
          for (let n = 0; n < list.length; n++) {
            const el = list[(start + n) % list.length];
            if (el.textContent?.trim().toLowerCase().startsWith(b.s)) {
              el.focus();
              break;
            }
          }
        }
    }
  };

  return (
    <PanelContext.Provider value={panelCtx}>
      <Floating
        ref={ref}
        open={open}
        anchor={anchor}
        placement={placement}
        offset={isSub ? 2 : 6}
        onClose={onClose}
        role="menu"
        tabIndex={-1}
        className={cx('ui-surface-overlay ui-menu', className)}
        style={minWidth ? { minWidth } : undefined}
        onKeyDown={onKeyDown}
        onPointerEnter={onPointerEnter}
      >
        {children}
      </Floating>
    </PanelContext.Provider>
  );
}

/* ------------------------------------------------------------------------ */
/* Menu (dropdown)                                                           */
/* ------------------------------------------------------------------------ */

export interface MenuProps {
  /** The element that toggles the menu. Must accept ref + onClick. */
  trigger: ReactElement<any>;
  children: ReactNode;
  placement?: Placement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  minWidth?: number;
  className?: string;
}

/** Dropdown menu with keyboard navigation, typeahead, submenus and checkable items. */
export function Menu({ trigger, children, placement = 'bottom-start', open: openProp, onOpenChange, minWidth = 180, className }: MenuProps) {
  const [open, setOpen] = useControllable(openProp, false, onOpenChange);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const menuId = useId();

  const close = () => {
    setOpen(false);
    anchor?.focus({ preventScroll: true });
  };

  const t = trigger.props;
  const triggerEl = cloneElement(trigger, {
    ref: (n: HTMLElement | null) => {
      setAnchor(n);
      const r = (trigger as any).props.ref;
      if (typeof r === 'function') r(n);
      else if (r) r.current = n;
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (e: MouseEvent) => {
      t.onClick?.(e);
      setViaKeyboard(e.detail === 0);
      setOpen(!open);
    },
    onKeyDown: (e: KeyboardEvent) => {
      t.onKeyDown?.(e);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setViaKeyboard(true);
        setOpen(true);
      }
    },
  });

  return (
    <MenuRootContext.Provider value={{ closeAll: close }}>
      {triggerEl}
      <MenuPanel open={open} anchor={anchor} placement={placement} onClose={close} focusFirst={viaKeyboard} minWidth={minWidth} className={className}>
        <div id={menuId} style={{ display: 'contents' }}>
          {children}
        </div>
      </MenuPanel>
    </MenuRootContext.Provider>
  );
}

/* ------------------------------------------------------------------------ */
/* Context menu                                                              */
/* ------------------------------------------------------------------------ */

export interface ContextMenuProps {
  /** Menu items. */
  content: ReactNode;
  /** The region that responds to right-click. */
  children: ReactElement<any>;
  minWidth?: number;
}

/** Opens a menu at the pointer on right-click (or Shift+F10 / context-menu key). */
export function ContextMenu({ content, children, minWidth = 200 }: ContextMenuProps) {
  const [point, setPoint] = useState<VirtualAnchor | null>(null);
  const close = () => setPoint(null);
  const at = (x: number, y: number): VirtualAnchor => ({ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) });
  const region = cloneElement(children, {
    onContextMenu: (e: MouseEvent) => {
      children.props.onContextMenu?.(e);
      e.preventDefault();
      setPoint(at(e.clientX, e.clientY));
    },
    onKeyDown: (e: KeyboardEvent) => {
      children.props.onKeyDown?.(e);
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPoint(at(r.left + 8, r.top + 8));
      }
    },
  });
  return (
    <MenuRootContext.Provider value={{ closeAll: close }}>
      {region}
      <MenuPanel open={!!point} anchor={point} placement="bottom-start" onClose={close} focusFirst={false} minWidth={minWidth}>
        {content}
      </MenuPanel>
    </MenuRootContext.Provider>
  );
}

/* ------------------------------------------------------------------------ */
/* Items                                                                     */
/* ------------------------------------------------------------------------ */

export interface MenuItemProps {
  children: ReactNode;
  icon?: ReactNode;
  /** Keyboard shortcut hint, e.g. "⌘C". */
  shortcut?: string;
  /** Secondary line. */
  description?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  /** Destructive styling. */
  danger?: boolean;
  /** Keep the menu open after selecting. */
  keepOpen?: boolean;
  className?: string;
}

function useItemBehaviour(onSelect: (() => void) | undefined, keepOpen: boolean | undefined, disabled?: boolean) {
  const root = useContext(MenuRootContext);
  const panel = useContext(PanelContext);
  const activate = () => {
    if (disabled) return;
    onSelect?.();
    if (!keepOpen) root.closeAll();
  };
  return {
    tabIndex: -1,
    'aria-disabled': disabled || undefined,
    onClick: activate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      if (document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
      if (panel?.openSub) panel.setOpenSub(null, 150);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      if (document.activeElement === e.currentTarget) (e.currentTarget.closest('[role=menu]') as HTMLElement | null)?.focus({ preventScroll: true });
    },
  };
}

export function MenuItem({ children, icon, shortcut, description, onSelect, disabled, danger, keepOpen, className }: MenuItemProps) {
  const behaviour = useItemBehaviour(onSelect, keepOpen, disabled);
  return (
    <div role="menuitem" className={cx('ui-menu__item', className)} data-danger={danger || undefined} {...behaviour}>
      {icon && <span className="ui-menu__icon">{icon}</span>}
      <span className="ui-menu__text">
        <span className="ui-menu__label">{children}</span>
        {description && <span className="ui-menu__desc">{description}</span>}
      </span>
      {shortcut && <span className="ui-menu__shortcut">{shortcut}</span>}
    </div>
  );
}

export interface MenuCheckboxItemProps extends Omit<MenuItemProps, 'onSelect' | 'danger'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function MenuCheckboxItem({ checked, onCheckedChange, children, icon, shortcut, disabled, keepOpen = true, className }: MenuCheckboxItemProps) {
  const behaviour = useItemBehaviour(() => onCheckedChange(!checked), keepOpen, disabled);
  return (
    <div role="menuitemcheckbox" aria-checked={checked} className={cx('ui-menu__item ui-menu__item--check', className)} {...behaviour}>
      <span className="ui-menu__indicator">{checked && <Check />}</span>
      {icon && <span className="ui-menu__icon">{icon}</span>}
      <span className="ui-menu__text">
        <span className="ui-menu__label">{children}</span>
      </span>
      {shortcut && <span className="ui-menu__shortcut">{shortcut}</span>}
    </div>
  );
}

const RadioCtx = createContext<{ value: string; onValueChange: (v: string) => void } | null>(null);

export function MenuRadioGroup({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) {
  return (
    <RadioCtx.Provider value={{ value, onValueChange }}>
      <div role="group">{children}</div>
    </RadioCtx.Provider>
  );
}

export function MenuRadioItem({ value, children, icon, disabled, keepOpen = true }: { value: string } & Omit<MenuItemProps, 'onSelect' | 'danger' | 'shortcut'>) {
  const ctx = useContext(RadioCtx);
  const checked = ctx?.value === value;
  const behaviour = useItemBehaviour(() => ctx?.onValueChange(value), keepOpen, disabled);
  return (
    <div role="menuitemradio" aria-checked={checked} className="ui-menu__item ui-menu__item--check" {...behaviour}>
      <span className="ui-menu__indicator">{checked && <span className="ui-menu__dot" />}</span>
      {icon && <span className="ui-menu__icon">{icon}</span>}
      <span className="ui-menu__text">
        <span className="ui-menu__label">{children}</span>
      </span>
    </div>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="ui-menu__group-label">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="ui-menu__sep" />;
}

/** Non-interactive header block, e.g. the signed-in user in an account menu. */
export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="ui-menu__header">{children}</div>;
}

export interface MenuSubProps {
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}

/** Nested submenu, opened by hover, click, Enter or →. */
export function MenuSub({ label, icon, disabled, children }: MenuSubProps) {
  const panel = useContext(PanelContext);
  const id = useId();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [viaKeyboard, setViaKeyboard] = useState(false);
  const open = panel?.openSub === id;
  const openNow = (kb: boolean) => {
    setViaKeyboard(kb);
    panel?.setOpenSub(id);
  };
  const closeSelf = () => {
    panel?.setOpenSub(null);
    el?.focus({ preventScroll: true });
  };
  return (
    <>
      <div
        ref={setEl}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        tabIndex={-1}
        className="ui-menu__item"
        data-open={open || undefined}
        onPointerMove={(e) => {
          if (disabled) return;
          if (document.activeElement !== e.currentTarget) e.currentTarget.focus({ preventScroll: true });
          if (!open) {
            setViaKeyboard(false);
            panel?.setOpenSub(id, 80);
          } else panel?.cancelSubClose();
        }}
        onClick={() => !disabled && openNow(false)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openNow(true);
          }
        }}
      >
        {icon && <span className="ui-menu__icon">{icon}</span>}
        <span className="ui-menu__text">
          <span className="ui-menu__label">{label}</span>
        </span>
        <ChevronRight className="ui-menu__chev" />
      </div>
      <MenuPanel
        open={open}
        anchor={el}
        placement="right-start"
        onClose={closeSelf}
        focusFirst={viaKeyboard}
        isSub
        onPointerEnter={() => panel?.cancelSubClose()}
        minWidth={160}
      >
        {children}
      </MenuPanel>
    </>
  );
}
