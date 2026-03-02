import { useCallback, useEffect, useMemo } from 'react';
import { getCachedFundamentals } from '../services/priceService';
import { useFundamentalsVersion, useMarketDataRegistry } from '../context/MarketDataContext';

/**
 * Hook to fetch fundamental data (Market Cap, P/E, etc.) for a symbol.
 */
export function useFundamentals(symbol) {
    const { subscribeFundamentals, refreshFundamentals } = useMarketDataRegistry();
    const fundaVersion = useFundamentalsVersion();

    useEffect(() => {
        if (!symbol) return;
        return subscribeFundamentals([symbol]);
    }, [symbol, subscribeFundamentals]);

    const data = useMemo(() => {
        if (!symbol) return null;
        const cacheVersion = fundaVersion;
        if (cacheVersion < 0) return null;
        return getCachedFundamentals(symbol, { silent: true });
    }, [symbol, fundaVersion]);

    const execute = useCallback(async () => {
        if (!symbol) return null;
        await refreshFundamentals([symbol]);
        return getCachedFundamentals(symbol, { silent: true });
    }, [symbol, refreshFundamentals]);

    return {
        data,
        loading: !!symbol && !data,
        error: null,
        execute,
        setData: () => { }
    };
}
