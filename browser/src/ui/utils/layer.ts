import { useEffect, useRef } from 'react';

/**
 * A global stack of dismissable layers (menus, popovers, dialogs…).
 * - Escape closes only the top-most layer.
 * - A pointer-down outside a layer closes it, *unless* the pointer lands in a
 *   layer stacked above it (e.g. a submenu or a select inside a dialog).
 */
interface Layer {
  el: () => HTMLElement | null;
  anchor?: () => Element | null;
  onEscape?: () => void;
  onOutside?: () => void;
}

const stack: Layer[] = [];
let installed = false;

function contains(el: Element | null | undefined, target: Node) {
  return !!el && el.contains(target);
}

function install() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      for (let i = stack.length - 1; i >= 0; i--) {
        const layer = stack[i];
        if (layer.onEscape) {
          e.preventDefault();
          e.stopPropagation();
          layer.onEscape();
          return;
        }
      }
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target as Element;
      if (!(target instanceof Node) || target.closest?.('[data-ui-ignore-outside]')) return;
      // Highest layer that contains the target.
      let k = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (contains(stack[i].el(), target)) {
          k = i;
          break;
        }
      }
      // Close every layer above k (snapshot: callbacks mutate the stack).
      const toClose = stack.slice(k + 1).filter((l) => !contains(l.anchor?.(), target));
      for (const l of toClose.reverse()) l.onOutside?.();
    },
    true,
  );
}

export function useLayer(active: boolean, layer: Layer) {
  const latest = useRef(layer);
  latest.current = layer;
  useEffect(() => {
    if (!active) return;
    install();
    const entry: Layer = {
      el: () => latest.current.el(),
      anchor: () => latest.current.anchor?.() ?? null,
      onEscape: latest.current.onEscape ? () => latest.current.onEscape?.() : undefined,
      onOutside: () => latest.current.onOutside?.(),
    };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
