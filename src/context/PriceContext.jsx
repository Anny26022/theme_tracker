import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getCachedPrice, getCachedInterval } from '../services/priceService';
import { useMarketDataRegistry } from './MarketDataContext';

const NOOP_SUBSCRIBE = () => () => { };
const ZERO_SNAPSHOT = () => 0;

export function PriceProvider({ children }) {
    return <>{children}</>;
}

/**
 * Hook to consume live price from the shared market data registry.
 * Checks interval cache first so navigating from Tracker/Theme shows data instantly.
 */
export function useLivePrice(symbol, options = {}) {
    const { subscribeLiveSymbols, subscribeLiveVersion, getLiveVersion } = useMarketDataRegistry();
    const { allowStrike = false, enableFetch = true } = options;
    const canSubscribe = Boolean(symbol) && enableFetch;
    const liveVersion = useSyncExternalStore(
        canSubscribe ? subscribeLiveVersion : NOOP_SUBSCRIBE,
        canSubscribe ? getLiveVersion : ZERO_SNAPSHOT,
        canSubscribe ? getLiveVersion : ZERO_SNAPSHOT
    );

    const hasCache = !!getCachedPrice(symbol) || !!getCachedInterval(symbol, '1D', { silent: true })?.close;

    useEffect(() => {
        if (!symbol || !enableFetch || hasCache) return;
        return subscribeLiveSymbols([symbol], { skipStrike: !allowStrike });
    }, [symbol, hasCache, allowStrike, enableFetch, subscribeLiveSymbols]);

    const data = useMemo(() => {
        const cacheVersion = liveVersion;
        if (cacheVersion < 0) return null;
        if (!symbol) return null;
        // Primary: live price cache
        const live = getCachedPrice(symbol);
        if (live) return live;
        // Fallback: reuse interval cache (close + changePct from Tracker/Theme)
        const interval = getCachedInterval(symbol, '1D', { silent: true });
        if (interval?.close && interval.changePct !== undefined) {
            const prev = interval.close / (1 + (interval.changePct / 100));
            const chg = interval.close - prev;
            return { price: interval.close, change: chg, changePct: interval.changePct, prevClose: prev, source: 'interval' };
        }
        return null;
    }, [symbol, liveVersion]);

    return {
        price: data?.price ?? null,
        change: data?.change ?? null,
        changePct: data?.changePct ?? null,
        prevClose: data?.prevClose ?? null,
        source: data?.source ?? null,
        loading: enableFetch && !data && !!symbol,
    };
}
