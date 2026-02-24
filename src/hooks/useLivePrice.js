import { useEffect, useRef } from 'react';
import { fetchLivePrice } from '../services/priceService';
import { useAsync } from './useAsync';

/**
 * Hook to fetch and auto-refresh live price for a symbol.
 */
export function useLivePrice(symbol, { refreshInterval = 15000, enabled = true } = {}) {
    const fetchFunc = async () => {
        if (!symbol || !enabled) return null;
        return await fetchLivePrice(symbol);
    };

    const { data, loading, error, execute } = useAsync(fetchFunc, [symbol, enabled], enabled);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (!symbol || !enabled) return;

        intervalRef.current = setInterval(() => {
            execute();
        }, refreshInterval);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [symbol, refreshInterval, enabled, execute]);

    return {
        price: data?.price ?? null,
        change: data?.change ?? null,
        changePct: data?.changePct ?? null,
        prevClose: data?.prevClose ?? null,
        source: data?.source ?? null,
        loading,
        error,
    };
}

