import { createContext, useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cx, useControllable } from '../utils';
import './Disclosure.css';

/* ------------------------------------------------------------------------ */
/* Accordion                                                                 */
/* ------------------------------------------------------------------------ */

interface AccCtx {
  open: string[];
  toggle: (v: string) => void;
}
const AccordionContext = createContext<AccCtx | null>(null);

export interface AccordionProps {
  /** Allow several items open at once. */
  multiple?: boolean;
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (v: string[]) => void;
  /** bordered = one card; separated = each item its own card; plain = dividers only. */
  variant?: 'bordered' | 'separated' | 'plain';
  children: ReactNode;
  className?: string;
}

export function Accordion({ multiple, value, defaultValue = [], onValueChange, variant = 'bordered', children, className }: AccordionProps) {
  const [open, set] = useControllable(value, defaultValue, onValueChange);
  const toggle = (v: string) => {
    const isOpen = open.includes(v);
    set(isOpen ? open.filter((x) => x !== v) : multiple ? [...open, v] : [v]);
  };
  return (
    <AccordionContext.Provider value={{ open, toggle }}>
      <div className={cx('ui-accordion', className)} data-variant={variant}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

export interface AccordionItemProps {
  value: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}

export function AccordionItem({ value, title, subtitle, icon, disabled, children }: AccordionItemProps) {
  const ctx = useContext(AccordionContext)!;
  const open = ctx.open.includes(value);
  const id = useId();
  return (
    <div className="ui-accordion__item" data-state={open ? 'open' : 'closed'}>
      <h3 className="ui-accordion__heading">
        <button
          type="button"
          id={`${id}-t`}
          aria-expanded={open}
          aria-controls={`${id}-p`}
          disabled={disabled}
          className="ui-accordion__trigger"
          onClick={() => ctx.toggle(value)}
        >
          {icon && <span className="ui-accordion__icon">{icon}</span>}
          <span className="ui-accordion__titles">
            <span className="ui-accordion__title">{title}</span>
            {subtitle && <span className="ui-accordion__subtitle">{subtitle}</span>}
          </span>
          <ChevronDown className="ui-accordion__chev" aria-hidden />
        </button>
      </h3>
      <div id={`${id}-p`} role="region" aria-labelledby={`${id}-t`} className="ui-accordion__panel" hidden={!open ? true : undefined}>
        <div className="ui-accordion__content">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Tree                                                                      */
/* ------------------------------------------------------------------------ */

export interface TreeNode {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Icon when expanded (e.g. open folder). */
  iconOpen?: ReactNode;
  children?: TreeNode[];
  meta?: ReactNode;
  disabled?: boolean;
}

export interface TreeProps {
  nodes: TreeNode[];
  selected?: string | null;
  onSelect?: (id: string, node: TreeNode) => void;
  expanded?: string[];
  defaultExpanded?: string[];
  onExpandedChange?: (ids: string[]) => void;
  className?: string;
  'aria-label'?: string;
}

/** Hierarchical list (folders, nav trees) with full arrow-key support. */
export function Tree({ nodes, selected, onSelect, expanded, defaultExpanded = [], onExpandedChange, className, ...aria }: TreeProps) {
  const [open, setOpen] = useControllable(expanded, defaultExpanded, onExpandedChange);
  const [focusId, setFocusId] = useState<string | null>(null);
  const ref = useRef<HTMLUListElement>(null);

  // Flatten visible nodes for keyboard navigation.
  const visible: { node: TreeNode; parent?: string }[] = [];
  const walk = (list: TreeNode[], parent?: string) => {
    for (const n of list) {
      visible.push({ node: n, parent });
      if (n.children && open.includes(n.id)) walk(n.children, n.id);
    }
  };
  walk(nodes);
  const tabbableId = focusId ?? selected ?? visible[0]?.node.id;

  const focusNode = (id: string) => {
    setFocusId(id);
    ref.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)?.focus();
  };
  const toggle = (id: string, force?: boolean) => {
    const isOpen = open.includes(id);
    const next = force ?? !isOpen;
    if (next === isOpen) return;
    setOpen(next ? [...open, id] : open.filter((x) => x !== id));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const i = visible.findIndex((v) => v.node.id === (document.activeElement as HTMLElement)?.dataset.nodeId);
    if (i < 0) return;
    const { node, parent } = visible[i];
    const hasKids = !!node.children?.length;
    const isOpen = open.includes(node.id);
    switch (e.key) {
      case 'ArrowDown':
        if (visible[i + 1]) focusNode(visible[i + 1].node.id);
        break;
      case 'ArrowUp':
        if (visible[i - 1]) focusNode(visible[i - 1].node.id);
        break;
      case 'ArrowRight':
        if (hasKids && !isOpen) toggle(node.id, true);
        else if (hasKids) focusNode(node.children![0].id);
        break;
      case 'ArrowLeft':
        if (hasKids && isOpen) toggle(node.id, false);
        else if (parent) focusNode(parent);
        break;
      case 'Home':
        focusNode(visible[0].node.id);
        break;
      case 'End':
        focusNode(visible[visible.length - 1].node.id);
        break;
      case 'Enter':
      case ' ':
        if (!node.disabled) {
          onSelect?.(node.id, node);
          if (hasKids) toggle(node.id);
        }
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const renderNodes = (list: TreeNode[], depth: number) =>
    list.map((n) => {
      const hasKids = !!n.children?.length;
      const isOpen = open.includes(n.id);
      return (
        <li key={n.id} role="none">
          <div
            role="treeitem"
            data-node-id={n.id}
            aria-expanded={hasKids ? isOpen : undefined}
            aria-selected={selected === n.id}
            aria-disabled={n.disabled || undefined}
            aria-level={depth + 1}
            tabIndex={tabbableId === n.id ? 0 : -1}
            className="ui-tree__item"
            style={{ ['--_depth' as string]: depth }}
            onFocus={() => setFocusId(n.id)}
            onClick={() => {
              if (n.disabled) return;
              onSelect?.(n.id, n);
              if (hasKids) toggle(n.id);
            }}
          >
            <span className="ui-tree__chev" aria-hidden data-open={isOpen || undefined}>
              {hasKids && <ChevronRight />}
            </span>
            {(n.icon || n.iconOpen) && <span className="ui-tree__icon">{isOpen && n.iconOpen ? n.iconOpen : n.icon}</span>}
            <span className="ui-tree__label">{n.label}</span>
            {n.meta && <span className="ui-tree__meta">{n.meta}</span>}
          </div>
          {hasKids && isOpen && (
            <ul role="group" className="ui-tree__group">
              {renderNodes(n.children!, depth + 1)}
            </ul>
          )}
        </li>
      );
    });

  return (
    <ul ref={ref} role="tree" aria-label={aria['aria-label']} className={cx('ui-tree', className)} onKeyDown={onKeyDown}>
      {renderNodes(nodes, 0)}
    </ul>
  );
}
