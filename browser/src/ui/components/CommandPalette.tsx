import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { Portal, useLayer, useListNavigation, usePresence, useScrollLock } from '../utils';
import { Listbox, optionId, type Option } from './Listbox';
import { Kbd } from './Kbd';
import './CommandPalette.css';

export interface Command extends Option {
  /** Extra words that should match the search. */
  keywords?: string[];
  onRun: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
  placeholder?: string;
  /** Register ⌘K / Ctrl+K to toggle (default true). */
  hotkey?: boolean;
}

/** ⌘K launcher: fuzzy-ish search over grouped commands. */
export function CommandPalette({ open, onOpenChange, commands, placeholder = 'Type a command or search…', hotkey = true }: CommandPaletteProps) {
  const { mounted, closing } = usePresence(open, 140);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useScrollLock(open);
  useLayer(open, { el: () => panelRef.current, onEscape: () => onOpenChange(false), onOutside: () => onOpenChange(false) });

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey, open, onOpenChange]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const terms = q.split(/\s+/);
    return commands.filter((c) => {
      const hay = [c.label, c.group, ...(c.keywords ?? [])].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [commands, query]);

  const nav = useListNavigation({ count: filtered.length, isDisabled: (i) => !!filtered[i]?.disabled });
  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    nav.setActive(filtered.length ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const run = (i: number) => {
    const c = filtered[i];
    if (!c || c.disabled) return;
    onOpenChange(false);
    c.onRun();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (nav.handleKey(e.key)) e.preventDefault();
    else if (e.key === 'Enter') {
      e.preventDefault();
      run(nav.active);
    }
  };

  if (!mounted) return null;
  return (
    <Portal>
      <div className="ui-dialog-root" data-state={closing ? 'closed' : 'open'}>
        <div className="ui-backdrop" aria-hidden />
        <div className="ui-cmdk-viewport">
          <div ref={panelRef} className="ui-cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
            <div className="ui-cmdk__search">
              <Search aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={nav.active >= 0 ? optionId(listId, nav.active) : undefined}
                className="ui-cmdk__input"
              />
              <Kbd size="sm">Esc</Kbd>
            </div>
            <Listbox
              id={listId}
              options={filtered}
              active={nav.active}
              isSelected={() => false}
              onSelect={(_, i) => run(i)}
              onHover={nav.setActive}
              highlight={query}
              emptyText="No commands found."
              className="ui-cmdk__list"
            />
            <div className="ui-cmdk__foot">
              <span>
                <Kbd size="sm">↑</Kbd>
                <Kbd size="sm">↓</Kbd> navigate
              </span>
              <span>
                <Kbd size="sm">
                  <CornerDownLeft size={10} />
                </Kbd>{' '}
                select
              </span>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
