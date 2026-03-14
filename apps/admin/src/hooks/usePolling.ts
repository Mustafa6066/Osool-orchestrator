import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Polls `fn` immediately on mount and then every `intervalMs`.
 * Returns { data, error, loading, refresh }.
 */
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs = 30_000,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await fnRef.current();
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    timerRef.current = setInterval(() => { void refresh(); }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, intervalMs]);

  return { data, error, loading, refresh };
}
