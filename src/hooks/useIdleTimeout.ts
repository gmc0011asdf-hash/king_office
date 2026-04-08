import { useEffect, useRef, useCallback } from 'react';

const IDLE_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
] as const;

/**
 * يراقب نشاط المستخدم ويستدعي callback عند انتهاء مدة الخمول.
 * @param timeoutMs مدة الخمول بالميلي ثانية (مثال: 30 * 60 * 1000 = 30 دقيقة)
 * @param onIdle الدالة المستدعاة عند انتهاء المدة
 * @param enabled تفعيل المراقبة (عادة عندما يكون المستخدم مسجلاً)
 */
export function useIdleTimeout(
  timeoutMs: number,
  onIdle: () => void,
  enabled: boolean = true
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      onIdleRef.current();
      timeoutRef.current = null;
    }, timeoutMs);
  }, [timeoutMs, enabled]);

  useEffect(() => {
    if (!enabled) return;
    resetTimer();
    const handlers = IDLE_EVENTS.map((ev) => ({
      ev,
      handler: () => resetTimer(),
    }));
    handlers.forEach(({ ev, handler }) => {
      window.addEventListener(ev, handler, { passive: true });
    });
    return () => {
      handlers.forEach(({ ev, handler }) => {
        window.removeEventListener(ev, handler);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [resetTimer, enabled]);
}
