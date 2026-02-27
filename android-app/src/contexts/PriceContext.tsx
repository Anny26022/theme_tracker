import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { fetchLivePrices } from '../services/priceService';

/**
 * Centralized Price Store for React Native
 * 
 * ONE batch fetch for ALL subscribed symbols.
 * Components subscribe → store collects symbols → ONE batch POST → results distributed.
 */

type PriceData = {
    price: number;
    change: number;
    changePct: number;
    prevClose: number;
    source?: string;
};

type PriceContextType = {
    subscribeToSymbol: (symbol: string) => () => void;
    getPriceSnapshot: (symbol: string) => PriceData | null;
    addListener: (symbol: string, listener: () => void) => () => void;
};

const PriceContext = createContext<PriceContextType>({
    subscribeToSymbol: () => () => { },
    getPriceSnapshot: () => null,
    addListener: () => () => { },
});

const REFRESH_INTERVAL = 20_000;    // 20 seconds between full refreshes
const DEBOUNCE_MS = 400;            // Wait for all components to mount before first batch

export function PriceProvider({ children }: { children: React.ReactNode }) {
    const subscribersRef = useRef(new Map<string, Set<number>>());
    const listenersRef = useRef(new Map<string, Set<() => void>>());
    const pricesRef = useRef<Record<string, PriceData>>({});
    const nextIdRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fetchingRef = useRef(false);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const isAppActiveRef = useRef(AppState.currentState === 'active');

    const hasPriceChanged = (prev: PriceData | undefined, next: PriceData) => {
        if (!prev) return true;
        return prev.price !== next.price
            || prev.change !== next.change
            || prev.changePct !== next.changePct
            || prev.prevClose !== next.prevClose
            || prev.source !== next.source;
    };

    const notifySymbol = useCallback((symbol: string) => {
        const listeners = listenersRef.current.get(symbol);
        if (!listeners || listeners.size === 0) return;
        listeners.forEach(listener => listener());
    }, []);

    const getActiveSymbols = useCallback(() => {
        const symbols: string[] = [];
        for (const [symbol, subs] of subscribersRef.current) {
            if (subs.size > 0) symbols.push(symbol);
        }
        return symbols;
    }, []);

    const getActiveSymbolCount = useCallback(() => {
        let count = 0;
        for (const subs of subscribersRef.current.values()) {
            if (subs.size > 0) count += 1;
        }
        return count;
    }, []);

    const fetchAll = useCallback(async () => {
        if (fetchingRef.current) return;

        const symbols = getActiveSymbols();
        if (symbols.length === 0) return;

        fetchingRef.current = true;

        try {
            const results = await fetchLivePrices(symbols);

            if (results.size > 0) {
                const changedSymbols: string[] = [];
                for (const [symbol, data] of results) {
                    const prevData = pricesRef.current[symbol];
                    pricesRef.current[symbol] = data;
                    if (hasPriceChanged(prevData, data)) {
                        changedSymbols.push(symbol);
                    }
                }
                changedSymbols.forEach(notifySymbol);
            }
        } catch (err: any) {
            console.warn('[PriceProvider] Batch fetch error:', err.message);
        } finally {
            fetchingRef.current = false;
        }
    }, [getActiveSymbols, notifySymbol]);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
    }, []);

    const startPolling = useCallback(() => {
        if (debounceRef.current || intervalRef.current) return;

        debounceRef.current = setTimeout(() => {
            debounceRef.current = null;

            if (!isAppActiveRef.current || getActiveSymbolCount() === 0) {
                stopPolling();
                return;
            }

            fetchAll();
            intervalRef.current = setInterval(() => {
                if (!isAppActiveRef.current || getActiveSymbolCount() === 0) {
                    stopPolling();
                    return;
                }
                fetchAll();
            }, REFRESH_INTERVAL);
        }, DEBOUNCE_MS);
    }, [fetchAll, getActiveSymbolCount, stopPolling]);

    const syncPollingState = useCallback(() => {
        if (!isAppActiveRef.current || getActiveSymbolCount() === 0) {
            stopPolling();
            return;
        }
        startPolling();
    }, [getActiveSymbolCount, startPolling, stopPolling]);

    useEffect(() => {
        const appStateSub = AppState.addEventListener('change', (nextState) => {
            const wasActive = appStateRef.current === 'active';
            const isActive = nextState === 'active';
            appStateRef.current = nextState;
            isAppActiveRef.current = isActive;

            if (wasActive && !isActive) {
                stopPolling();
                return;
            }
            if (!wasActive && isActive) {
                syncPollingState();
            }
        });

        return () => {
            appStateSub.remove();
            stopPolling();
        };
    }, [stopPolling, syncPollingState]);

    const subscribeToSymbol = useCallback((symbol: string) => {
        const key = symbol.trim().toUpperCase();
        if (!key) return () => { };
        const id = nextIdRef.current++;

        if (!subscribersRef.current.has(key)) {
            subscribersRef.current.set(key, new Set());
        }
        subscribersRef.current.get(key)!.add(id);

        syncPollingState();

        return () => {
            const subs = subscribersRef.current.get(key);
            if (subs) {
                subs.delete(id);
                if (subs.size === 0) {
                    subscribersRef.current.delete(key);
                }
            }
            syncPollingState();
        };
    }, [syncPollingState]);

    const addListener = useCallback((symbol: string, listener: () => void) => {
        const key = symbol.trim().toUpperCase();
        if (!listenersRef.current.has(key)) {
            listenersRef.current.set(key, new Set());
        }
        listenersRef.current.get(key)!.add(listener);

        return () => {
            const listeners = listenersRef.current.get(key);
            if (!listeners) return;
            listeners.delete(listener);
            if (listeners.size === 0) listenersRef.current.delete(key);
        };
    }, []);

    const getPriceSnapshot = useCallback((symbol: string) => {
        const key = symbol.trim().toUpperCase();
        return pricesRef.current[key] || null;
    }, []);

    const contextValue = useMemo(() => ({
        subscribeToSymbol,
        getPriceSnapshot,
        addListener,
    }), [subscribeToSymbol, getPriceSnapshot, addListener]);

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
 * ZERO individual fetches — reads from the shared batch results.
 */
export function useLivePrice(symbol: string | undefined) {
    const { subscribeToSymbol, getPriceSnapshot, addListener } = useContext(PriceContext);
    const key = symbol?.trim().toUpperCase();

    // Subscribe to the symbol for fetching
    useEffect(() => {
        if (!key) return;
        const unsubscribe = subscribeToSymbol(key);
        return unsubscribe;
    }, [key, subscribeToSymbol]);

    const subscribe = useCallback((onStoreChange: () => void) => {
        if (!key) return () => { };
        return addListener(key, onStoreChange);
    }, [key, addListener]);

    const getSnapshot = useCallback(() => {
        if (!key) return null;
        return getPriceSnapshot(key);
    }, [key, getPriceSnapshot]);

    const data = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    return {
        price: data?.price ?? null,
        change: data?.change ?? null,
        changePct: data?.changePct ?? null,
        prevClose: data?.prevClose ?? null,
        source: data?.source ?? null,
        loading: !data && !!key,
    };
}
