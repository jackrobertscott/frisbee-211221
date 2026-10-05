import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { Portal } from '../utils';
import { Spinner } from './Spinner';
import './Toast.css';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'loading';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** ms before auto-dismiss; 0 = sticky. Default 5000 (loading toasts are sticky). */
  duration?: number;
  action?: { label: string; onClick: () => void };
  id?: string;
}

interface ToastItem extends ToastOptions {
  id: string;
  createdAt: number;
}

/* A tiny external store so `toast()` can be called from anywhere. */
let items: ToastItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let seq = 0;

function push(opts: ToastOptions) {
  const id = opts.id ?? `t${++seq}`;
  const existing = items.find((t) => t.id === id);
  const item = { ...opts, id, createdAt: existing?.createdAt ?? Date.now() };
  items = existing ? items.map((t) => (t.id === id ? item : t)) : [...items, item].slice(-5);
  emit();
  return id;
}

/** Show a toast. Returns its id (pass it back in `id` to update in place). */
export function toast(opts: ToastOptions | string) {
  return push(typeof opts === 'string' ? { title: opts } : opts);
}
toast.success = (title: ReactNode, o?: Partial<ToastOptions>) => push({ ...o, title, tone: 'success' });
toast.error = (title: ReactNode, o?: Partial<ToastOptions>) => push({ ...o, title, tone: 'danger' });
toast.warning = (title: ReactNode, o?: Partial<ToastOptions>) => push({ ...o, title, tone: 'warning' });
toast.info = (title: ReactNode, o?: Partial<ToastOptions>) => push({ ...o, title, tone: 'info' });
toast.dismiss = (id: string) => {
  items = items.filter((t) => t.id !== id);
  emit();
};
/** Tracks a promise: loading → success / error, updating one toast in place. */
toast.promise = async <T,>(p: Promise<T>, m: { loading: ReactNode; success: ReactNode; error: ReactNode }) => {
  const id = push({ title: m.loading, tone: 'loading' });
  try {
    const r = await p;
    push({ id, title: m.success, tone: 'success' });
    return r;
  } catch (e) {
    push({ id, title: m.error, tone: 'danger' });
    throw e;
  }
};

const icons: Record<ToastTone, ReactNode> = {
  neutral: null,
  success: <CircleCheck />,
  danger: <CircleAlert />,
  warning: <TriangleAlert />,
  info: <Info />,
  loading: <Spinner size={16} />,
};

/** Renders the toast stack. Mount once near the app root. */
export function Toaster({ position = 'bottom-right' }: { position?: 'bottom-right' | 'bottom-center' | 'top-right' | 'top-center' }) {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
  return (
    <Portal>
      <section className="ui-toaster" data-position={position} aria-label="Notifications" data-ui-ignore-outside>
        <ol>
          {list.map((t) => (
            <ToastView key={t.id} item={t} />
          ))}
        </ol>
      </section>
    </Portal>
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const tone = item.tone ?? 'neutral';
  const duration = item.duration ?? (tone === 'loading' ? 0 : 5000);
  const [leaving, setLeaving] = useState(false);
  const paused = useRef(false);
  const remaining = useRef(duration);

  const dismiss = () => {
    setLeaving(true);
    window.setTimeout(() => toast.dismiss(item.id), 180);
  };

  useEffect(() => {
    remaining.current = duration;
    if (!duration) return;
    let last = Date.now();
    const iv = window.setInterval(() => {
      const now = Date.now();
      if (!paused.current) remaining.current -= now - last;
      last = now;
      if (remaining.current <= 0) {
        window.clearInterval(iv);
        dismiss();
      }
    }, 100);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, tone, item.title]);

  return (
    <li
      className="ui-toast"
      data-tone={tone}
      data-leaving={leaving || undefined}
      role={tone === 'danger' ? 'alert' : 'status'}
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
    >
      {icons[tone] && <span className="ui-toast__icon">{icons[tone]}</span>}
      <div className="ui-toast__text">
        <div className="ui-toast__title">{item.title}</div>
        {item.description && <div className="ui-toast__desc">{item.description}</div>}
      </div>
      {item.action && (
        <button
          type="button"
          className="ui-toast__action"
          onClick={() => {
            item.action!.onClick();
            dismiss();
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className="ui-control__btn ui-toast__close" aria-label="Dismiss" onClick={dismiss}>
        <X />
      </button>
    </li>
  );
}
