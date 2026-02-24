import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
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
    prices: {},
    subscribe: () => () => { },
});

const REFRESH_INTERVAL = 20_000; // 20 seconds between full refreshes
const DEBOUNCE_MS = 300;         // Wait 300ms for all components to mount before first batch

export function PriceProvider({ children }) {
    const [prices, setPrices] = useState({});
    const subscribersRef = useRef(new Map());      // symbol → Set<subscriberId>
    const nextIdRef = useRef(0);
    const intervalRef = useRef(null);
    const debounceRef = useRef(null);
    const fetchingRef = useRef(false);

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
                const updates = {};
                for (const [symbol, data] of results) {
                    updates[symbol] = data;
                }
                setPrices(prev => ({ ...prev, ...updates }));
            }
        } catch (err) {
            console.warn('[PriceProvider] Batch fetch error:', err.message);
        }

        fetchingRef.current = false;
    }, [getActiveSymbols]);

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
    const subscribe = useCallback((symbol) => {
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

    return (
        <PriceContext.Provider value={{ prices, subscribe }}>
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
    const { prices, subscribe } = useContext(PriceContext);
    const key = symbol?.trim().toUpperCase();

    useEffect(() => {
        if (!key) return;
        const unsubscribe = subscribe(key);
        return unsubscribe;
    }, [key, subscribe]);

    const data = key ? prices[key] : null;

    return {
        price: data?.price ?? null,
        change: data?.change ?? null,
        changePct: data?.changePct ?? null,
        prevClose: data?.prevClose ?? null,
        source: data?.source ?? null,
        loading: !data && !!key,
    };
}
