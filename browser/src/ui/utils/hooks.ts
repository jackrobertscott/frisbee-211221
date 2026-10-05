import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref, type RefCallback } from 'react';

/** State that can be controlled (value + onChange) or uncontrolled (defaultValue). */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (next: T) => void] {
  const [inner, setInner] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? (value as T) : inner;
  const onChangeRef = useLatest(onChange);
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChangeRef.current?.(next);
    },
    [controlled, onChangeRef],
  );
  return [current, set];
}

/** Ref that always holds the latest value (for stable callbacks). */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Merge several refs into one callback ref. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    for (const r of refs) {
      if (typeof r === 'function') r(node);
      else if (r) (r as { current: T | null }).current = node;
    }
  };
}

/** Keyboard-driven active index over a list, skipping disabled entries. */
export function useListNavigation(opts: {
  count: number;
  isDisabled?: (i: number) => boolean;
  loop?: boolean;
  initial?: number;
}) {
  const { count, isDisabled = () => false, loop = true } = opts;
  const [active, setActive] = useState(opts.initial ?? -1);

  const step = useCallback(
    (from: number, dir: 1 | -1) => {
      if (count === 0) return -1;
      let i = from;
      for (let n = 0; n < count; n++) {
        i += dir;
        if (i >= count) i = loop ? 0 : count - 1;
        if (i < 0) i = loop ? count - 1 : 0;
        if (!isDisabled(i)) return i;
      }
      return from;
    },
    [count, isDisabled, loop],
  );

  const first = useCallback(() => step(-1, 1), [step]);
  const last = useCallback(() => step(count, -1), [step, count]);

  /** Returns true if the key was handled. */
  const handleKey = useCallback(
    (key: string) => {
      switch (key) {
        case 'ArrowDown':
          setActive((a) => (a < 0 ? first() : step(a, 1)));
          return true;
        case 'ArrowUp':
          setActive((a) => (a < 0 ? last() : step(a, -1)));
          return true;
        case 'Home':
          setActive(first());
          return true;
        case 'End':
          setActive(last());
          return true;
      }
      return false;
    },
    [first, last, step],
  );

  return { active, setActive, handleKey, first, last };
}

/** Accumulates typed characters and resolves to the first matching index. */
export function useTypeahead(getLabel: (i: number) => string, count: number, onMatch: (i: number) => void) {
  const buf = useRef('');
  const timer = useRef<number>(0);
  return useCallback(
    (key: string, from: number) => {
      if (key.length !== 1 || key === ' ' && !buf.current) return false;
      window.clearTimeout(timer.current);
      buf.current += key.toLowerCase();
      timer.current = window.setTimeout(() => (buf.current = ''), 600);
      for (let n = 1; n <= count; n++) {
        const i = (from + (buf.current.length === 1 ? n : n - 1) + count) % count;
        if (getLabel(i).toLowerCase().startsWith(buf.current)) {
          onMatch(i);
          return true;
        }
      }
      return true;
    },
    [getLabel, count, onMatch],
  );
}

/** Keep focus within a container while active; restores focus on deactivate. */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean, initialFocus?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((n) => n.offsetParent !== null || n === document.activeElement);
    const raf = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? focusables()[0] ?? el;
      if (!el.contains(document.activeElement)) target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** Lock page scroll while active (counts nested locks). */
let scrollLocks = 0;
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (scrollLocks++ === 0) {
      const sbw = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (sbw) document.body.style.paddingRight = `${sbw}px`;
    }
    return () => {
      if (--scrollLocks === 0) {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    };
  }, [active]);
}

/** Mount/unmount with an exit animation window. */
export function usePresence(open: boolean, exitMs = 140) {
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return;
    }
    const t = window.setTimeout(() => setLingering(false), exitMs);
    return () => window.clearTimeout(t);
  }, [open, exitMs]);
  // `open` mounts synchronously so refs exist in the same commit as the open state.
  return { mounted: open || lingering, closing: !open };
}
