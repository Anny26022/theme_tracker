import { useState, useEffect, useCallback, useMemo, useRef } from "react";

export function useAsync<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  deps: any[] = [],
  immediate = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  const execute = useCallback(
    async (...args: any[]) => {
      const requestId = ++latestRequestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFn(...args);
        if (requestId === latestRequestIdRef.current) {
          setData(result);
        }
        return result;
      } catch (err: any) {
        const message = err?.message || String(err);
        if (requestId === latestRequestIdRef.current) {
          setError(message);
        }
        throw err;
      } finally {
        if (requestId === latestRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [asyncFn],
  );

  useEffect(() => {
    if (!immediate) return;

    let cancelled = false;
    const requestId = ++latestRequestIdRef.current;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        const result = await asyncFn();
        if (!cancelled && requestId === latestRequestIdRef.current) {
          setData(result);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled && requestId === latestRequestIdRef.current) {
          setError(err?.message || String(err));
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => ({
      data,
      loading,
      error,
      execute,
      setData,
    }),
    [data, loading, error, execute],
  );
}
