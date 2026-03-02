import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { cleanSymbol, fetchBatchIntervalPerformance, fetchComparisonCharts, fetchFundamentals, fetchLivePrices } from '../services/priceService';

const MarketDataContext = createContext({
    subscribeIntervalSymbols: () => () => { },
    subscribeChartSymbols: () => () => { },
    subscribeLiveSymbols: () => () => { },
    subscribeFundamentals: () => () => { },
    refreshIntervals: async () => { },
    refreshCharts: async () => { },
    refreshLive: async () => { },
    refreshFundamentals: async () => { },
    getIntervalVersion: () => 0,
    getChartVersion: () => 0,
    getLiveVersion: () => 0,
    getFundamentalsVersion: () => 0,
    subscribeIntervalVersion: () => () => { },
    subscribeChartVersion: () => () => { },
    subscribeLiveVersion: () => () => { },
    subscribeFundamentalsVersion: () => () => { },
});

const REFRESH_TICK_MS = 10_000;
const CHART_REFRESH_MS = 300_000;
const LIVE_REFRESH_MS = 20_000;
const FUNDA_REFRESH_MS = 3_600_000;
const INTERVAL_REFRESH_MS = {
    '1D': 5 * 60_000,
    '5D': 5 * 60_000,
    '1M': 10 * 60_000,
    '3M': 10 * 60_000,
    '6M': 10 * 60_000,
    'YTD': 10 * 60_000,
    '1Y': 10 * 60_000,
    '5Y': 15 * 60_000,
    'MAX': 15 * 60_000,
};

function getIntervalRefreshMs(interval) {
    return INTERVAL_REFRESH_MS[interval] ?? 10 * 60_000;
}

function addSymbols(map, interval, symbols) {
    const existing = map.get(interval) || new Map();
    symbols.forEach((symbol) => {
        const next = (existing.get(symbol) || 0) + 1;
        existing.set(symbol, next);
    });
    map.set(interval, existing);
}

function removeSymbols(map, interval, symbols) {
    const existing = map.get(interval);
    if (!existing) return;
    symbols.forEach((symbol) => {
        const next = (existing.get(symbol) || 0) - 1;
        if (next <= 0) {
            existing.delete(symbol);
        } else {
            existing.set(symbol, next);
        }
    });
    if (existing.size === 0) map.delete(interval);
}

function extractSymbols(map, interval) {
    const entries = map.get(interval);
    if (!entries || entries.size === 0) return [];
    return Array.from(entries.keys());
}

export function MarketDataProvider({ children }) {
    const intervalSymbolsRef = useRef(new Map());
    const chartSymbolsRef = useRef(new Map());
    const liveSymbolsRef = useRef(new Map());
    const fundaSymbolsRef = useRef(new Map());
    const lastIntervalRefreshRef = useRef(new Map());
    const lastChartRefreshRef = useRef(new Map());
    const lastLiveRefreshRef = useRef(0);
    const lastFundaRefreshRef = useRef(0);
    const inFlightRef = useRef(new Set());
    const intervalListenersRef = useRef(new Set());
    const chartListenersRef = useRef(new Set());
    const liveListenersRef = useRef(new Set());
    const fundaListenersRef = useRef(new Set());
    const intervalVersionRef = useRef(0);
    const chartVersionRef = useRef(0);
    const liveVersionRef = useRef(0);
    const fundaVersionRef = useRef(0);
    const loopTimerRef = useRef(null);
    const isVisibleRef = useRef(typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true);

    const notifyInterval = useCallback(() => {
        intervalVersionRef.current += 1;
        intervalListenersRef.current.forEach((listener) => listener());
    }, []);

    const notifyChart = useCallback(() => {
        chartVersionRef.current += 1;
        chartListenersRef.current.forEach((listener) => listener());
    }, []);

    const notifyLive = useCallback(() => {
        liveVersionRef.current += 1;
        liveListenersRef.current.forEach((listener) => listener());
    }, []);

    const notifyFundamentals = useCallback(() => {
        fundaVersionRef.current += 1;
        fundaListenersRef.current.forEach((listener) => listener());
    }, []);

    const refreshInterval = useCallback(async (interval, symbolsOverride) => {
        const key = `interval:${interval}`;
        if (inFlightRef.current.has(key)) return;
        const symbols = symbolsOverride || extractSymbols(intervalSymbolsRef.current, interval);
        if (symbols.length === 0) return;

        inFlightRef.current.add(key);
        try {
            await fetchBatchIntervalPerformance(symbols, interval);
            lastIntervalRefreshRef.current.set(interval, Date.now());
            notifyInterval();
        } finally {
            inFlightRef.current.delete(key);
        }
    }, [notifyInterval]);

    const refreshCharts = useCallback(async (interval, symbolsOverride) => {
        const key = `chart:${interval}`;
        if (inFlightRef.current.has(key)) return;
        const symbols = symbolsOverride || extractSymbols(chartSymbolsRef.current, interval);
        if (symbols.length === 0) return;

        inFlightRef.current.add(key);
        try {
            await fetchComparisonCharts(symbols, interval);
            lastChartRefreshRef.current.set(interval, Date.now());
            notifyChart();
        } finally {
            inFlightRef.current.delete(key);
        }
    }, [notifyChart]);

    const refreshLive = useCallback(async (symbolsOverride) => {
        const key = 'live';
        if (inFlightRef.current.has(key)) return;
        const symbols = symbolsOverride || Array.from(liveSymbolsRef.current.keys());
        if (symbols.length === 0) return;

        inFlightRef.current.add(key);
        try {
            await fetchLivePrices(symbols);
            lastLiveRefreshRef.current = Date.now();
            notifyLive();
        } finally {
            inFlightRef.current.delete(key);
        }
    }, [notifyLive]);

    const refreshFundamentals = useCallback(async (symbolsOverride) => {
        const key = 'funda';
        if (inFlightRef.current.has(key)) return;
        const symbols = symbolsOverride || Array.from(fundaSymbolsRef.current.keys());
        if (symbols.length === 0) return;

        inFlightRef.current.add(key);
        try {
            await fetchFundamentals(symbols);
            lastFundaRefreshRef.current = Date.now();
            notifyFundamentals();
        } finally {
            inFlightRef.current.delete(key);
        }
    }, [notifyFundamentals]);

    const refreshIntervals = useCallback(async (intervals, symbols) => {
        if (!intervals?.length) return;
        await Promise.all(intervals.map((interval) => refreshInterval(interval, symbols)));
    }, [refreshInterval]);

    const refreshChartsBatch = useCallback(async (interval, symbols) => {
        await refreshCharts(interval, symbols);
    }, [refreshCharts]);

    const maybeStartLoop = useCallback(() => {
        if (loopTimerRef.current || !isVisibleRef.current) return;
        loopTimerRef.current = setInterval(() => {
            if (!isVisibleRef.current) return;
            const now = Date.now();
            const intervalPromises = [];
            intervalSymbolsRef.current.forEach((_symbols, interval) => {
                const last = lastIntervalRefreshRef.current.get(interval) || 0;
                if (now - last >= getIntervalRefreshMs(interval)) {
                    intervalPromises.push(refreshInterval(interval));
                }
            });
            const chartPromises = [];
            chartSymbolsRef.current.forEach((_symbols, interval) => {
                const last = lastChartRefreshRef.current.get(interval) || 0;
                if (now - last >= CHART_REFRESH_MS) {
                    chartPromises.push(refreshCharts(interval));
                }
            });
            const livePromises = [];
            if (liveSymbolsRef.current.size > 0 && now - lastLiveRefreshRef.current >= LIVE_REFRESH_MS) {
                livePromises.push(refreshLive());
            }
            const fundaPromises = [];
            if (fundaSymbolsRef.current.size > 0 && now - lastFundaRefreshRef.current >= FUNDA_REFRESH_MS) {
                fundaPromises.push(refreshFundamentals());
            }
            if (intervalPromises.length || chartPromises.length || livePromises.length || fundaPromises.length) {
                void Promise.all([...intervalPromises, ...chartPromises, ...livePromises, ...fundaPromises]);
            }
        }, REFRESH_TICK_MS);
    }, [refreshCharts, refreshFundamentals, refreshInterval, refreshLive]);

    const maybeStopLoop = useCallback(() => {
        const hasIntervals = intervalSymbolsRef.current.size > 0;
        const hasCharts = chartSymbolsRef.current.size > 0;
        const hasLive = liveSymbolsRef.current.size > 0;
        const hasFunda = fundaSymbolsRef.current.size > 0;
        if (hasIntervals || hasCharts || hasLive || hasFunda) return;
        if (loopTimerRef.current) {
            clearInterval(loopTimerRef.current);
            loopTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const handleVisibility = () => {
            const isVisible = document.visibilityState !== 'hidden';
            const wasVisible = isVisibleRef.current;
            isVisibleRef.current = isVisible;
            if (wasVisible && !isVisible) {
                if (loopTimerRef.current) {
                    clearInterval(loopTimerRef.current);
                    loopTimerRef.current = null;
                }
                return;
            }
            if (!wasVisible && isVisible) {
                maybeStartLoop();
                const intervals = Array.from(intervalSymbolsRef.current.keys());
                const charts = Array.from(chartSymbolsRef.current.keys());
                const liveSymbols = Array.from(liveSymbolsRef.current.keys());
                const fundaSymbols = Array.from(fundaSymbolsRef.current.keys());
                void refreshIntervals(intervals);
                void Promise.all(charts.map((interval) => refreshCharts(interval)));
                void refreshLive(liveSymbols);
                void refreshFundamentals(fundaSymbols);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            if (loopTimerRef.current) clearInterval(loopTimerRef.current);
        };
    }, [maybeStartLoop, refreshCharts, refreshFundamentals, refreshIntervals, refreshLive]);

    const subscribeIntervalSymbols = useCallback((intervals, symbols) => {
        const normalized = (symbols || []).map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (!intervals?.length || normalized.length === 0) return () => { };

        intervals.forEach((interval) => addSymbols(intervalSymbolsRef.current, interval, normalized));
        maybeStartLoop();
        void refreshIntervals(intervals, normalized);

        return () => {
            intervals.forEach((interval) => removeSymbols(intervalSymbolsRef.current, interval, normalized));
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshIntervals]);

    const subscribeChartSymbols = useCallback((interval, symbols) => {
        const normalized = (symbols || []).map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (!interval || normalized.length === 0) return () => { };

        addSymbols(chartSymbolsRef.current, interval, normalized);
        maybeStartLoop();
        void refreshCharts(interval, normalized);

        return () => {
            removeSymbols(chartSymbolsRef.current, interval, normalized);
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshCharts]);

    const subscribeLiveSymbols = useCallback((symbols) => {
        const normalized = (symbols || []).map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (normalized.length === 0) return () => { };

        normalized.forEach((symbol) => {
            const next = (liveSymbolsRef.current.get(symbol) || 0) + 1;
            liveSymbolsRef.current.set(symbol, next);
        });
        maybeStartLoop();
        void refreshLive(normalized);

        return () => {
            normalized.forEach((symbol) => {
                const next = (liveSymbolsRef.current.get(symbol) || 0) - 1;
                if (next <= 0) {
                    liveSymbolsRef.current.delete(symbol);
                } else {
                    liveSymbolsRef.current.set(symbol, next);
                }
            });
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshLive]);

    const subscribeFundamentals = useCallback((symbols) => {
        const normalized = (symbols || []).map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (normalized.length === 0) return () => { };

        normalized.forEach((symbol) => {
            const next = (fundaSymbolsRef.current.get(symbol) || 0) + 1;
            fundaSymbolsRef.current.set(symbol, next);
        });
        maybeStartLoop();
        void refreshFundamentals(normalized);

        return () => {
            normalized.forEach((symbol) => {
                const next = (fundaSymbolsRef.current.get(symbol) || 0) - 1;
                if (next <= 0) {
                    fundaSymbolsRef.current.delete(symbol);
                } else {
                    fundaSymbolsRef.current.set(symbol, next);
                }
            });
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshFundamentals]);

    const subscribeIntervalVersion = useCallback((listener) => {
        intervalListenersRef.current.add(listener);
        return () => intervalListenersRef.current.delete(listener);
    }, []);

    const subscribeChartVersion = useCallback((listener) => {
        chartListenersRef.current.add(listener);
        return () => chartListenersRef.current.delete(listener);
    }, []);

    const subscribeLiveVersion = useCallback((listener) => {
        liveListenersRef.current.add(listener);
        return () => liveListenersRef.current.delete(listener);
    }, []);

    const subscribeFundamentalsVersion = useCallback((listener) => {
        fundaListenersRef.current.add(listener);
        return () => fundaListenersRef.current.delete(listener);
    }, []);

    const getIntervalVersion = useCallback(() => intervalVersionRef.current, []);
    const getChartVersion = useCallback(() => chartVersionRef.current, []);
    const getLiveVersion = useCallback(() => liveVersionRef.current, []);
    const getFundamentalsVersion = useCallback(() => fundaVersionRef.current, []);

    const contextValue = useMemo(() => ({
        subscribeIntervalSymbols,
        subscribeChartSymbols,
        subscribeLiveSymbols,
        subscribeFundamentals,
        refreshIntervals,
        refreshCharts: refreshChartsBatch,
        refreshLive,
        refreshFundamentals,
        getIntervalVersion,
        getChartVersion,
        getLiveVersion,
        getFundamentalsVersion,
        subscribeIntervalVersion,
        subscribeChartVersion,
        subscribeLiveVersion,
        subscribeFundamentalsVersion,
    }), [
        getChartVersion,
        getFundamentalsVersion,
        getIntervalVersion,
        getLiveVersion,
        refreshChartsBatch,
        refreshFundamentals,
        refreshIntervals,
        refreshLive,
        subscribeChartSymbols,
        subscribeChartVersion,
        subscribeFundamentals,
        subscribeFundamentalsVersion,
        subscribeIntervalSymbols,
        subscribeIntervalVersion,
        subscribeLiveSymbols,
        subscribeLiveVersion,
    ]);

    return (
        <MarketDataContext.Provider value={contextValue}>
            {children}
        </MarketDataContext.Provider>
    );
}

export function useMarketDataRegistry() {
    return useContext(MarketDataContext);
}

export function useIntervalVersion() {
    const { subscribeIntervalVersion, getIntervalVersion } = useContext(MarketDataContext);
    return useSyncExternalStore(subscribeIntervalVersion, getIntervalVersion, getIntervalVersion);
}

export function useChartVersion() {
    const { subscribeChartVersion, getChartVersion } = useContext(MarketDataContext);
    return useSyncExternalStore(subscribeChartVersion, getChartVersion, getChartVersion);
}

export function useLiveVersion() {
    const { subscribeLiveVersion, getLiveVersion } = useContext(MarketDataContext);
    return useSyncExternalStore(subscribeLiveVersion, getLiveVersion, getLiveVersion);
}

export function useFundamentalsVersion() {
    const { subscribeFundamentalsVersion, getFundamentalsVersion } = useContext(MarketDataContext);
    return useSyncExternalStore(subscribeFundamentalsVersion, getFundamentalsVersion, getFundamentalsVersion);
}
