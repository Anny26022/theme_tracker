import { useCallback, useEffect, useMemo } from 'react';
import { getCachedFundamentals } from '../services/priceService';
import { useFundamentalsVersion, useMarketDataRegistry } from '../contexts/MarketDataContext';

/**
 * Hook to fetch fundamental data (Market Cap, P/E, etc.) for a symbol.
 */
export function useFundamentals(symbol: string | null | undefined) {
    const { subscribeFundamentals, refreshFundamentals } = useMarketDataRegistry();
    const version = useFundamentalsVersion();

    useEffect(() => {
        if (!symbol) return;
        return subscribeFundamentals([symbol]);
    }, [symbol, subscribeFundamentals]);

    const data = useMemo(() => {
        const cacheVersion = version;
        if (cacheVersion < 0) return null;
        if (!symbol) return null;
        return getCachedFundamentals(symbol);
    }, [symbol, version]);

    const refresh = useCallback(() => {
        if (!symbol) return;
        void refreshFundamentals([symbol]);
    }, [refreshFundamentals, symbol]);

    return {
        data,
        loading: !!symbol && !data,
        error: null,
        refresh,
    };
}
