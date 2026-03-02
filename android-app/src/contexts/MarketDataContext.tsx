import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { cleanSymbol, fetchBatchIntervalPerformance, fetchComparisonCharts, fetchFundamentals, fetchLivePrices } from '../services/priceService';

type MarketDataContextType = {
    subscribeIntervalSymbols: (intervals: string[], symbols: string[]) => () => void;
    subscribeChartSymbols: (interval: string, symbols: string[]) => () => void;
    subscribeLiveSymbols: (symbols: string[]) => () => void;
    subscribeFundamentals: (symbols: string[]) => () => void;
    refreshIntervals: (intervals: string[], symbols?: string[]) => Promise<void>;
    refreshCharts: (interval: string, symbols?: string[]) => Promise<void>;
    refreshLive: (symbols?: string[]) => Promise<void>;
    refreshFundamentals: (symbols?: string[]) => Promise<void>;
    getIntervalVersion: () => number;
    getChartVersion: () => number;
    getLiveVersion: () => number;
    getFundamentalsVersion: () => number;
    subscribeIntervalVersion: (listener: () => void) => () => void;
    subscribeChartVersion: (listener: () => void) => () => void;
    subscribeLiveVersion: (listener: () => void) => () => void;
    subscribeFundamentalsVersion: (listener: () => void) => () => void;
};

const MarketDataContext = createContext<MarketDataContextType>({
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
const INTERVAL_REFRESH_MS: Record<string, number> = {
    '1D': 300_000,
    '5D': 300_000,
    '1M': 600_000,
    '6M': 600_000,
    YTD: 600_000,
    '1Y': 600_000,
    '5Y': 600_000,
    MAX: 600_000,
};

function getIntervalRefreshMs(interval: string) {
    return INTERVAL_REFRESH_MS[interval] ?? 300_000;
}

function addSymbols(
    map: Map<string, Map<string, number>>,
    interval: string,
    symbols: string[],
) {
    const existing = map.get(interval) ?? new Map<string, number>();
    symbols.forEach((symbol) => {
        const next = (existing.get(symbol) ?? 0) + 1;
        existing.set(symbol, next);
    });
    map.set(interval, existing);
}

function removeSymbols(
    map: Map<string, Map<string, number>>,
    interval: string,
    symbols: string[],
) {
    const existing = map.get(interval);
    if (!existing) return;
    symbols.forEach((symbol) => {
        const next = (existing.get(symbol) ?? 0) - 1;
        if (next <= 0) {
            existing.delete(symbol);
        } else {
            existing.set(symbol, next);
        }
    });
    if (existing.size === 0) map.delete(interval);
}

function extractSymbols(map: Map<string, Map<string, number>>, interval: string) {
    const entries = map.get(interval);
    if (!entries || entries.size === 0) return [];
    return Array.from(entries.keys());
}

function useMarketDataController(): MarketDataContextType {
    const intervalSymbolsRef = useRef(new Map<string, Map<string, number>>());
    const chartSymbolsRef = useRef(new Map<string, Map<string, number>>());
    const liveSymbolsRef = useRef(new Map<string, number>());
    const fundaSymbolsRef = useRef(new Map<string, number>());
    const lastIntervalRefreshRef = useRef(new Map<string, number>());
    const lastChartRefreshRef = useRef(new Map<string, number>());
    const lastLiveRefreshRef = useRef(0);
    const lastFundaRefreshRef = useRef(0);
    const inFlightRef = useRef(new Set<string>());
    const intervalListenersRef = useRef(new Set<() => void>());
    const chartListenersRef = useRef(new Set<() => void>());
    const liveListenersRef = useRef(new Set<() => void>());
    const fundaListenersRef = useRef(new Set<() => void>());
    const intervalVersionRef = useRef(0);
    const chartVersionRef = useRef(0);
    const liveVersionRef = useRef(0);
    const fundaVersionRef = useRef(0);
    const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const isAppActiveRef = useRef(AppState.currentState === 'active');

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

    const refreshInterval = useCallback(async (interval: string, symbolsOverride?: string[]) => {
        const key = `interval:${interval}`;
        if (inFlightRef.current.has(key)) return;
        const symbols = symbolsOverride ?? extractSymbols(intervalSymbolsRef.current, interval);
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

    const refreshCharts = useCallback(async (interval: string, symbolsOverride?: string[]) => {
        const key = `chart:${interval}`;
        if (inFlightRef.current.has(key)) return;
        const symbols = symbolsOverride ?? extractSymbols(chartSymbolsRef.current, interval);
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

    const refreshLive = useCallback(async (symbolsOverride?: string[]) => {
        const key = 'live';
        if (inFlightRef.current.has(key)) return;
        const symbols = symbolsOverride ?? Array.from(liveSymbolsRef.current.keys());
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

    const refreshFundamentals = useCallback(async (symbolsOverride?: string[]) => {
        const key = 'funda';
        if (inFlightRef.current.has(key)) return;
        const symbols = symbolsOverride ?? Array.from(fundaSymbolsRef.current.keys());
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

    const refreshIntervals = useCallback(async (intervals: string[], symbols?: string[]) => {
        if (!intervals.length) return;
        await Promise.all(intervals.map((interval) => refreshInterval(interval, symbols)));
    }, [refreshInterval]);

    const refreshChartsBatch = useCallback(async (interval: string, symbols?: string[]) => {
        await refreshCharts(interval, symbols);
    }, [refreshCharts]);

    const maybeStartLoop = useCallback(() => {
        if (loopTimerRef.current || !isAppActiveRef.current) return;
        loopTimerRef.current = setInterval(() => {
            if (!isAppActiveRef.current) return;
            const now = Date.now();
            const intervalPromises: Promise<void>[] = [];
            intervalSymbolsRef.current.forEach((_symbols, interval) => {
                const last = lastIntervalRefreshRef.current.get(interval) ?? 0;
                if (now - last >= getIntervalRefreshMs(interval)) {
                    intervalPromises.push(refreshInterval(interval));
                }
            });
            const chartPromises: Promise<void>[] = [];
            chartSymbolsRef.current.forEach((_symbols, interval) => {
                const last = lastChartRefreshRef.current.get(interval) ?? 0;
                if (now - last >= CHART_REFRESH_MS) {
                    chartPromises.push(refreshCharts(interval));
                }
            });
            const livePromises: Promise<void>[] = [];
            if (liveSymbolsRef.current.size > 0 && now - lastLiveRefreshRef.current >= LIVE_REFRESH_MS) {
                livePromises.push(refreshLive());
            }
            const fundaPromises: Promise<void>[] = [];
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
        const appStateSub = AppState.addEventListener('change', (nextState) => {
            const wasActive = appStateRef.current === 'active';
            const isActive = nextState === 'active';
            appStateRef.current = nextState;
            isAppActiveRef.current = isActive;

            if (wasActive && !isActive) {
                if (loopTimerRef.current) {
                    clearInterval(loopTimerRef.current);
                    loopTimerRef.current = null;
                }
                return;
            }

            if (!wasActive && isActive) {
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
        });

        return () => {
            appStateSub.remove();
            if (loopTimerRef.current) clearInterval(loopTimerRef.current);
        };
    }, [maybeStartLoop, refreshCharts, refreshFundamentals, refreshIntervals, refreshLive]);

    const subscribeIntervalSymbols = useCallback((intervals: string[], symbols: string[]) => {
        const normalized = symbols.map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (!intervals.length || !normalized.length) return () => { };

        intervals.forEach((interval) => addSymbols(intervalSymbolsRef.current, interval, normalized));
        maybeStartLoop();
        void refreshIntervals(intervals, normalized);

        return () => {
            intervals.forEach((interval) => removeSymbols(intervalSymbolsRef.current, interval, normalized));
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshIntervals]);

    const subscribeChartSymbols = useCallback((interval: string, symbols: string[]) => {
        const normalized = symbols.map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (!interval || !normalized.length) return () => { };

        addSymbols(chartSymbolsRef.current, interval, normalized);
        maybeStartLoop();
        void refreshCharts(interval, normalized);

        return () => {
            removeSymbols(chartSymbolsRef.current, interval, normalized);
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshCharts]);

    const subscribeLiveSymbols = useCallback((symbols: string[]) => {
        const normalized = symbols.map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (!normalized.length) return () => { };

        normalized.forEach((symbol) => {
            const next = (liveSymbolsRef.current.get(symbol) ?? 0) + 1;
            liveSymbolsRef.current.set(symbol, next);
        });
        maybeStartLoop();
        void refreshLive(normalized);

        return () => {
            normalized.forEach((symbol) => {
                const next = (liveSymbolsRef.current.get(symbol) ?? 0) - 1;
                if (next <= 0) {
                    liveSymbolsRef.current.delete(symbol);
                } else {
                    liveSymbolsRef.current.set(symbol, next);
                }
            });
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshLive]);

    const subscribeFundamentals = useCallback((symbols: string[]) => {
        const normalized = symbols.map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (!normalized.length) return () => { };

        normalized.forEach((symbol) => {
            const next = (fundaSymbolsRef.current.get(symbol) ?? 0) + 1;
            fundaSymbolsRef.current.set(symbol, next);
        });
        maybeStartLoop();
        void refreshFundamentals(normalized);

        return () => {
            normalized.forEach((symbol) => {
                const next = (fundaSymbolsRef.current.get(symbol) ?? 0) - 1;
                if (next <= 0) {
                    fundaSymbolsRef.current.delete(symbol);
                } else {
                    fundaSymbolsRef.current.set(symbol, next);
                }
            });
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshFundamentals]);

    const subscribeIntervalVersion = useCallback((listener: () => void) => {
        intervalListenersRef.current.add(listener);
        return () => {
            intervalListenersRef.current.delete(listener);
        };
    }, []);

    const subscribeChartVersion = useCallback((listener: () => void) => {
        chartListenersRef.current.add(listener);
        return () => {
            chartListenersRef.current.delete(listener);
        };
    }, []);

    const subscribeLiveVersion = useCallback((listener: () => void) => {
        liveListenersRef.current.add(listener);
        return () => {
            liveListenersRef.current.delete(listener);
        };
    }, []);

    const subscribeFundamentalsVersion = useCallback((listener: () => void) => {
        fundaListenersRef.current.add(listener);
        return () => {
            fundaListenersRef.current.delete(listener);
        };
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

    return contextValue;
}

export function MarketDataProvider({ children }: { children: React.ReactNode }) {
    const contextValue = useMarketDataController();

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
