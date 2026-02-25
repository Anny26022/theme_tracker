import { useState, useEffect, useCallback, useMemo } from "react";

export function useAsync<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  deps: any[] = [],
  immediate = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: any[]) => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFn(...args);
        setData(result);
        return result;
      } catch (err: any) {
        const message = err?.message || String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [asyncFn],
  );

  useEffect(() => {
    if (!immediate) return;

    let cancelled = false;
    setLoading(true);

    const run = async () => {
      try {
        const result = await asyncFn();
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
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

