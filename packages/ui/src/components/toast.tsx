'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from './cx.js';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  leaving: boolean;
}

type Show = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<Show | null>(null);

// The mounted provider, for code outside React (e.g. a query client's global mutation callbacks).
let mounted: Show | null = null;

/** Shows a toast from anywhere (no-op when no `ToastProvider` is mounted). */
export function notify(message: string, tone: ToastTone = 'success'): void {
  mounted?.(message, tone);
}

const DURATION_MS = 3800;
const LEAVE_MS = 220;

/**
 * Small, accessible toasts ("انحفظ", "انلغى الحجز"…). One polite live region (errors are
 * assertive), newest at the bottom, auto-dismissed, tap to dismiss. Sits above the mobile tab bar.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    timers.current.set(
      id,
      setTimeout(() => {
        setItems((list) => list.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, LEAVE_MS),
    );
  }, []);

  const show = useCallback<Show>(
    (message, tone = 'success') => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, tone, message, leaving: false }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    mounted = show;
    return () => {
      if (mounted === show) mounted = null;
    };
  }, [show]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)] z-[60] flex flex-col items-center gap-2 md:bottom-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((t) => (
          // Not a button: the live region announces it, it leaves on its own, and a tap (pointer
          // only) just clears it sooner. Errors are also role=alert (announced assertively).
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            role={t.tone === 'error' ? 'alert' : undefined}
            className={cx(
              'pointer-events-auto flex max-w-md cursor-pointer items-center gap-3 rounded-full px-5 py-3 text-start text-sm font-medium shadow-float',
              'transition-[transform,opacity] duration-200 ease-soft',
              t.tone === 'error' ? 'bg-danger text-white' : 'bg-night text-canvas',
              t.leaving ? 'translate-y-2 opacity-0' : 'animate-pop',
            )}
            data-testid="toast"
          >
            <ToastIcon tone={t.tone} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.18" />
      {tone === 'error' ? (
        <path
          d="M10 5.5v5.5M10 14h.01"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : tone === 'info' ? (
        <path d="M10 9v5M10 6h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path
          d="m6 10.2 2.6 2.6L14 7.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="12"
          style={{ ['--path-length' as string]: 12 }}
          className="animate-draw"
        />
      )}
    </svg>
  );
}

/** `toast('انحفظ')`, `toast('صار خطأ', 'error')`. A no-op outside a ToastProvider. */
export function useToast(): Show {
  return useContext(ToastContext) ?? noop;
}

const noop: Show = () => undefined;
