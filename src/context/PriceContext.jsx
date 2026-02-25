import React, { createContext, use, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { fetchLivePrices } from '../services/priceService';

/**
 * Centralized Price Store
 * 
 * ONE batch fetch for ALL subscribed symbols.
 * 25 symbols on screen = 1 HTTP request to Google Finance.
 * 
 * Components subscribe → store collects symbols → ONE batch POST → results distributed.
 */

const PriceContext = createContext({
    subscribeToSymbol: () => () => { },
    subscribeToPrice: () => () => { },
    getPriceSnapshot: () => null,
});

const REFRESH_INTERVAL = 20_000; // 20 seconds between full refreshes
const DEBOUNCE_MS = 300;         // Wait 300ms for all components to mount before first batch

export function PriceProvider({ children }) {
    const subscribersRef = useRef(new Map());      // symbol → Set<subscriberId> for fetch lifecycle
    const listenersRef = useRef(new Map());        // symbol → Set<listener> for React reactivity
    const pricesRef = useRef({});                  // symbol -> latest price data
    const nextIdRef = useRef(0);
    const intervalRef = useRef(null);
    const debounceRef = useRef(null);
    const fetchingRef = useRef(false);

    const hasPriceChanged = (prev, next) => {
        if (!prev) return true;
        return prev.price !== next.price
            || prev.change !== next.change
            || prev.changePct !== next.changePct
            || prev.prevClose !== next.prevClose
            || prev.source !== next.source;
    };

    const notifySymbol = useCallback((symbol) => {
        const listeners = listenersRef.current.get(symbol);
        if (!listeners || listeners.size === 0) return;
        listeners.forEach(listener => listener());
    }, []);

    // Get all currently subscribed symbols
    const getActiveSymbols = useCallback(() => {
        const symbols = [];
        for (const [symbol, subs] of subscribersRef.current) {
            if (subs.size > 0) symbols.push(symbol);
        }
        return symbols;
    }, []);

    // ONE batch fetch for ALL active symbols
    const fetchAll = useCallback(async () => {
        if (fetchingRef.current) return;

        const symbols = getActiveSymbols();
        if (symbols.length === 0) return;

        fetchingRef.current = true;

        try {
            // ONE HTTP request for all symbols
            const results = await fetchLivePrices(symbols);

            if (results.size > 0) {
                const changedSymbols = [];
                for (const [symbol, data] of results) {
                    const prevData = pricesRef.current[symbol];
                    pricesRef.current[symbol] = data;
                    if (hasPriceChanged(prevData, data)) {
                        changedSymbols.push(symbol);
                    }
                }
                changedSymbols.forEach(notifySymbol);
            }
        } catch (err) {
            console.warn('[PriceProvider] Batch fetch error:', err.message);
        } finally {
            fetchingRef.current = false;
        }
    }, [getActiveSymbols, notifySymbol]);

    // Debounced initial fetch — waits for all components to subscribe before firing
    const scheduleFetch = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetchAll();

            // Restart interval
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(fetchAll, REFRESH_INTERVAL);
        }, DEBOUNCE_MS);
    }, [fetchAll]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    // Subscribe a component to a symbol
    const subscribeToSymbol = useCallback((symbol) => {
        const key = symbol.trim().toUpperCase();
        const id = nextIdRef.current++;

        if (!subscribersRef.current.has(key)) {
            subscribersRef.current.set(key, new Set());
        }
        subscribersRef.current.get(key).add(id);

        // Schedule a batch fetch (debounced so multiple subscribes batch together)
        scheduleFetch();

        // Return unsubscribe function
        return () => {
            const subs = subscribersRef.current.get(key);
            if (subs) {
                subs.delete(id);
                if (subs.size === 0) {
                    subscribersRef.current.delete(key);
                }
            }
        };
    }, [scheduleFetch]);

    const subscribeToPrice = useCallback((symbol, listener) => {
        const key = symbol.trim().toUpperCase();
        if (!listenersRef.current.has(key)) {
            listenersRef.current.set(key, new Set());
        }
        listenersRef.current.get(key).add(listener);

        return () => {
            const listeners = listenersRef.current.get(key);
            if (!listeners) return;
            listeners.delete(listener);
            if (listeners.size === 0) listenersRef.current.delete(key);
        };
    }, []);

    const getPriceSnapshot = useCallback((symbol) => {
        const key = symbol.trim().toUpperCase();
        return pricesRef.current[key] || null;
    }, []);

    const contextValue = useMemo(() => ({
        subscribeToSymbol,
        subscribeToPrice,
        getPriceSnapshot,
    }), [subscribeToSymbol, subscribeToPrice, getPriceSnapshot]);

    return (
        <PriceContext.Provider value={contextValue}>
            {children}
        </PriceContext.Provider>
    );
}

/**
 * Hook to consume live price from the centralized store.
 * Automatically subscribes/unsubscribes on mount/unmount.
 * 
 * ZERO individual fetches — just reads from the shared batch results.
 */
export function useLivePrice(symbol) {
    const { subscribeToSymbol, subscribeToPrice, getPriceSnapshot } = use(PriceContext);
    const key = symbol?.trim().toUpperCase();

    useEffect(() => {
        if (!key) return;
        const unsubscribe = subscribeToSymbol(key);
        return unsubscribe;
    }, [key, subscribeToSymbol]);

    const subscribe = useCallback((onStoreChange) => {
        if (!key) return () => { };
        return subscribeToPrice(key, onStoreChange);
    }, [key, subscribeToPrice]);

    const getSnapshot = useCallback(() => {
        if (!key) return null;
        return getPriceSnapshot(key);
    }, [key, getPriceSnapshot]);

    const data = useSyncExternalStore(subscribe, getSnapshot, () => null);

    return {
        price: data?.price ?? null,
        change: data?.change ?? null,
        changePct: data?.changePct ?? null,
        prevClose: data?.prevClose ?? null,
        source: data?.source ?? null,
        loading: !data && !!key,
    };
}
