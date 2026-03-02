import React, { useEffect, useMemo } from 'react';
import { getCachedPrice } from '../services/priceService';
import { useLiveVersion, useMarketDataRegistry } from './MarketDataContext';

export function PriceProvider({ children }) {
    return <>{children}</>;
}

/**
 * Hook to consume live price from the shared market data registry.
 * Caches are keyed by cleaned symbol; updates are driven by live version ticks.
 */
export function useLivePrice(symbol) {
    const { subscribeLiveSymbols } = useMarketDataRegistry();
    const liveVersion = useLiveVersion();

    useEffect(() => {
        if (!symbol) return;
        return subscribeLiveSymbols([symbol]);
    }, [symbol, subscribeLiveSymbols]);

    const data = useMemo(() => {
        const cacheVersion = liveVersion;
        if (cacheVersion < 0) return null;
        if (!symbol) return null;
        return getCachedPrice(symbol);
    }, [symbol, liveVersion]);

    return {
        price: data?.price ?? null,
        change: data?.change ?? null,
        changePct: data?.changePct ?? null,
        prevClose: data?.prevClose ?? null,
        source: data?.source ?? null,
        loading: !data && !!symbol,
    };
}
