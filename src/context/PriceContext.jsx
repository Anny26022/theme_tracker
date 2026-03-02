import React, { useEffect, useMemo } from 'react';
import { getCachedPrice, getCachedInterval } from '../services/priceService';
import { useLiveVersion, useMarketDataRegistry } from './MarketDataContext';

export function PriceProvider({ children }) {
    return <>{children}</>;
}

/**
 * Hook to consume live price from the shared market data registry.
 * Checks interval cache first so navigating from Tracker/Theme shows data instantly.
 */
export function useLivePrice(symbol) {
    const { subscribeLiveSymbols } = useMarketDataRegistry();
    const liveVersion = useLiveVersion();

    const hasCache = !!getCachedPrice(symbol) || !!getCachedInterval(symbol, '1D', { silent: true })?.close;

    useEffect(() => {
        if (!symbol || hasCache) return;
        return subscribeLiveSymbols([symbol]);
    }, [symbol, hasCache, subscribeLiveSymbols]);

    const data = useMemo(() => {
        const cacheVersion = liveVersion;
        if (cacheVersion < 0) return null;
        if (!symbol) return null;
        // Primary: live price cache
        const live = getCachedPrice(symbol);
        if (live) return live;
        // Fallback: reuse interval cache (close + changePct from Tracker/Theme)
        const interval = getCachedInterval(symbol, '1D', { silent: true });
        if (interval?.close) return { price: interval.close, change: null, changePct: interval.changePct, prevClose: null, source: 'interval' };
        return null;
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
