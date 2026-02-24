import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * Standardized hook for managing asynchronous operations.
 * Handles loading states, errors, and race conditions (cancelation).
 * 
 * @param {Function} asyncFn - The async function to execute.
 * @param {Array} deps - Dependency array that triggers re-execution.
 * @param {boolean} immediate - Whether to execute immediately on mount.
 */
export function useAsync(asyncFn, deps = [], immediate = true) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(immediate);
    const [error, setError] = useState(null);

    const execute = useCallback(async (...args) => {
        setLoading(true);
        setError(null);

        try {
            const result = await asyncFn(...args);
            setData(result);
            return result;
        } catch (err) {
            console.error('[useAsync] Execution failed:', err);
            setError(err.message || String(err));
            throw err;
        } finally {
            setLoading(false);
        }
    }, [asyncFn]); // eslint-disable-line react-hooks/exhaustive-deps

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
            } catch (err) {
                if (!cancelled) {
                    setError(err.message || String(err));
                    setLoading(false);
                }
            }
        };

        run();
        return () => { cancelled = true; };
    }, deps); // eslint-disable-line react-hooks/exhaustive-deps

    return useMemo(() => ({
        data,
        loading,
        error,
        execute,
        setData // Allow manual updates if needed
    }), [data, loading, error, execute]);
}
