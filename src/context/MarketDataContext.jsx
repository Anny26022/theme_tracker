import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { cleanSymbol, fetchBatchIntervalPerformance, fetchBatchIntervalPerformanceBulk, fetchComparisonCharts, fetchFundamentals, fetchLivePrices, getCachedComparisonSeries, getCachedIntervalEntry } from '../services/priceService';

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
    getChartRequestPending: () => false,
    getLiveVersion: () => 0,
    getFundamentalsVersion: () => 0,
    subscribeIntervalVersion: () => () => { },
    subscribeChartVersion: () => () => { },
    subscribeRequestVersion: () => () => { },
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
    const newlyAdded = [];
    symbols.forEach((symbol) => {
        const prev = existing.get(symbol) || 0;
        const next = prev + 1;
        existing.set(symbol, next);
        if (prev === 0) newlyAdded.push(symbol);
    });
    map.set(interval, existing);
    return newlyAdded;
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

function normalizeSymbolList(symbols) {
    return Array.from(new Set((symbols || []).map((symbol) => cleanSymbol(symbol)).filter(Boolean)));
}

function buildSymbolSetKey(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) return '0::';
    const sorted = [...symbols].sort();
    return `${sorted.length}:${sorted.join(',')}`;
}

function buildChartRequestKey(interval, symbols) {
    if (!interval) return 'chart:unknown';
    if (!Array.isArray(symbols) || symbols.length === 0) return `chart:${interval}:*`;
    return `chart:${interval}:${buildSymbolSetKey(symbols)}`;
}

export function MarketDataProvider({ children }) {
    const intervalSymbolsRef = useRef(new Map());
    const chartSymbolsRef = useRef(new Map());
    const liveSymbolsRef = useRef(new Map());
    const liveStrikeSymbolsRef = useRef(new Map());
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
    const requestListenersRef = useRef(new Set());
    const intervalVersionRef = useRef(0);
    const chartVersionRef = useRef(0);
    const chartNotifyRafRef = useRef(null);
    const liveVersionRef = useRef(0);
    const fundaVersionRef = useRef(0);
    const requestVersionRef = useRef(0);
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

    const scheduleChartNotify = useCallback(() => {
        if (chartNotifyRafRef.current) return;
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
            chartNotifyRafRef.current = setTimeout(() => {
                chartNotifyRafRef.current = null;
                notifyChart();
            }, 16);
            return;
        }
        chartNotifyRafRef.current = window.requestAnimationFrame(() => {
            chartNotifyRafRef.current = null;
            notifyChart();
        });
    }, [notifyChart]);

    const getMissingChartSymbols = useCallback((interval, symbols = []) => (
        (symbols || []).filter((symbol) => {
            const cached = getCachedComparisonSeries(symbol, interval, { silent: true });
            if (!Array.isArray(cached) || cached.length <= 1) return true;
            const first = cached[0];
            const hasOhlc = Number.isFinite(first?.open) && Number.isFinite(first?.high) && Number.isFinite(first?.low) && Number.isFinite(first?.close);
            return !hasOhlc;
        })
    ), []);

    const notifyLive = useCallback(() => {
        liveVersionRef.current += 1;
        liveListenersRef.current.forEach((listener) => listener());
    }, []);

    const notifyFundamentals = useCallback(() => {
        fundaVersionRef.current += 1;
        fundaListenersRef.current.forEach((listener) => listener());
    }, []);

    const notifyRequests = useCallback(() => {
        requestVersionRef.current += 1;
        requestListenersRef.current.forEach((listener) => listener());
    }, []);

    const refreshInterval = useCallback(async (interval, symbolsOverride) => {
        if (!symbolsOverride) {
            const key = `interval:${interval}`;
            if (inFlightRef.current.has(key)) return;
            const symbols = extractSymbols(intervalSymbolsRef.current, interval);
            if (symbols.length === 0) return;

            inFlightRef.current.add(key);
            try {
                await fetchBatchIntervalPerformance(symbols, interval);
                lastIntervalRefreshRef.current.set(interval, Date.now());
                notifyInterval();
            } finally {
                inFlightRef.current.delete(key);
            }
        } else {
            // Specific symbols - let the service handle deduplication
            await fetchBatchIntervalPerformance(symbolsOverride, interval);
            notifyInterval();
        }
    }, [notifyInterval]);

    const refreshCharts = useCallback(async (interval, symbolsOverride) => {
        if (!symbolsOverride) {
            const key = buildChartRequestKey(interval);
            if (inFlightRef.current.has(key)) return;
            const symbols = extractSymbols(chartSymbolsRef.current, interval);
            if (symbols.length === 0) return;
            const missingSymbols = getMissingChartSymbols(interval, symbols);
            if (missingSymbols.length === 0) {
                lastChartRefreshRef.current.set(interval, Date.now());
                return;
            }

            inFlightRef.current.add(key);
            notifyRequests();
            try {
                await fetchComparisonCharts(missingSymbols, interval);
                lastChartRefreshRef.current.set(interval, Date.now());
                scheduleChartNotify();
            } finally {
                inFlightRef.current.delete(key);
                notifyRequests();
            }
        } else {
            const missingSymbols = getMissingChartSymbols(interval, symbolsOverride);
            if (missingSymbols.length === 0) return;
            const key = buildChartRequestKey(interval, missingSymbols);
            if (inFlightRef.current.has(key)) return;
            inFlightRef.current.add(key);
            notifyRequests();
            // Specific symbols - let the service handle deduplication
            try {
                await fetchComparisonCharts(missingSymbols, interval);
                scheduleChartNotify();
            } finally {
                inFlightRef.current.delete(key);
                notifyRequests();
            }
        }
    }, [getMissingChartSymbols, notifyRequests, scheduleChartNotify]);

    const refreshLive = useCallback(async (symbolsOverride, options = {}) => {
        if (!symbolsOverride) {
            const key = 'live';
            if (inFlightRef.current.has(key)) return;
            const symbols = Array.from(liveSymbolsRef.current.keys());
            if (symbols.length === 0) return;
            const strikeSymbols = Array.from(liveStrikeSymbolsRef.current.keys());

            inFlightRef.current.add(key);
            try {
                await fetchLivePrices(symbols, { ...options, skipStrike: true });
                if (strikeSymbols.length > 0) {
                    await fetchLivePrices(strikeSymbols, { ...options, skipStrike: false });
                }
                lastLiveRefreshRef.current = Date.now();
                notifyLive();
            } finally {
                inFlightRef.current.delete(key);
            }
        } else {
            // Specific symbols refresh
            await fetchLivePrices(symbolsOverride, options);
            notifyLive();
        }
    }, [notifyLive]);

    const refreshFundamentals = useCallback(async (symbolsOverride) => {
        if (!symbolsOverride) {
            const key = 'funda';
            if (inFlightRef.current.has(key)) return;
            const symbols = Array.from(fundaSymbolsRef.current.keys());
            if (symbols.length === 0) return;

            inFlightRef.current.add(key);
            try {
                await fetchFundamentals(symbols);
                lastFundaRefreshRef.current = Date.now();
                notifyFundamentals();
            } finally {
                inFlightRef.current.delete(key);
            }
        } else {
            // Specific symbols refresh
            await fetchFundamentals(symbolsOverride);
            notifyFundamentals();
        }
    }, [notifyFundamentals]);

    const refreshIntervals = useCallback(async (intervals, symbols) => {
        const normalizedIntervals = Array.from(new Set((intervals || []).filter(Boolean)));
        if (normalizedIntervals.length === 0) return;

        const normalizedSymbols = normalizeSymbolList(symbols);
        const hasExplicitSymbols = normalizedSymbols.length > 0;
        const canBulkFetch = hasExplicitSymbols && normalizedIntervals.length > 1;

        if (canBulkFetch) {
            const inFlightKey = `interval-bulk:${buildSymbolSetKey(normalizedSymbols)}:${normalizedIntervals.slice().sort().join('|')}`;
            if (inFlightRef.current.has(inFlightKey)) return;

            inFlightRef.current.add(inFlightKey);
            try {
                await fetchBatchIntervalPerformanceBulk(normalizedSymbols, normalizedIntervals);
                const now = Date.now();
                normalizedIntervals.forEach((interval) => {
                    lastIntervalRefreshRef.current.set(interval, now);
                });
                notifyInterval();
            } finally {
                inFlightRef.current.delete(inFlightKey);
            }
            return;
        }

        await Promise.all(normalizedIntervals.map((interval) => refreshInterval(interval, hasExplicitSymbols ? normalizedSymbols : undefined)));
        if (hasExplicitSymbols) {
            const now = Date.now();
            normalizedIntervals.forEach((interval) => {
                lastIntervalRefreshRef.current.set(interval, now);
            });
        }
    }, [notifyInterval, refreshInterval]);

    const refreshChartsBatch = useCallback(async (interval, symbols) => {
        await refreshCharts(interval, symbols);
    }, [refreshCharts]);

    const maybeStartLoop = useCallback(() => {
        if (loopTimerRef.current || !isVisibleRef.current) return;
        loopTimerRef.current = setInterval(() => {
            if (!isVisibleRef.current) return;
            const now = Date.now();
            const dueIntervalGroups = new Map();
            intervalSymbolsRef.current.forEach((_symbols, interval) => {
                const last = lastIntervalRefreshRef.current.get(interval) || 0;
                if (now - last >= getIntervalRefreshMs(interval)) {
                    const symbols = extractSymbols(intervalSymbolsRef.current, interval);
                    if (symbols.length === 0) return;
                    const key = buildSymbolSetKey(symbols);
                    const existing = dueIntervalGroups.get(key);
                    if (existing) {
                        existing.intervals.push(interval);
                        return;
                    }
                    dueIntervalGroups.set(key, { intervals: [interval], symbols });
                }
            });
            const intervalPromises = Array.from(dueIntervalGroups.values()).map(({ intervals, symbols }) => (
                refreshIntervals(intervals, symbols)
            ));
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
    }, [refreshCharts, refreshFundamentals, refreshIntervals, refreshLive]);

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
                const intervalGroups = new Map();
                intervalSymbolsRef.current.forEach((_symbols, interval) => {
                    const symbols = extractSymbols(intervalSymbolsRef.current, interval);
                    if (symbols.length === 0) return;
                    const key = buildSymbolSetKey(symbols);
                    const existing = intervalGroups.get(key);
                    if (existing) {
                        existing.intervals.push(interval);
                        return;
                    }
                    intervalGroups.set(key, { intervals: [interval], symbols });
                });
                const charts = Array.from(chartSymbolsRef.current.keys());
                const liveSymbols = Array.from(liveSymbolsRef.current.keys());
                const fundaSymbols = Array.from(fundaSymbolsRef.current.keys());
                void Promise.all(Array.from(intervalGroups.values()).map(({ intervals, symbols }) => (
                    refreshIntervals(intervals, symbols)
                )));
                void Promise.all(charts.map((interval) => refreshCharts(interval)));
                void refreshLive();
                void refreshFundamentals(fundaSymbols);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            if (chartNotifyRafRef.current) {
                if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
                    window.cancelAnimationFrame(chartNotifyRafRef.current);
                } else {
                    clearTimeout(chartNotifyRafRef.current);
                }
                chartNotifyRafRef.current = null;
            }
            if (loopTimerRef.current) clearInterval(loopTimerRef.current);
        };
    }, [maybeStartLoop, refreshCharts, refreshFundamentals, refreshIntervals, refreshLive]);

    const subscribeIntervalSymbols = useCallback((intervals, symbols) => {
        const normalized = normalizeSymbolList(symbols);
        if (!intervals?.length || normalized.length === 0) return () => { };

        const freshByInterval = [];
        intervals.forEach((interval) => {
            const newlyAdded = addSymbols(intervalSymbolsRef.current, interval, normalized);
            if (newlyAdded.length > 0) {
                const uncached = newlyAdded.filter((symbol) => {
                    const entry = getCachedIntervalEntry(symbol, interval, { silent: true });
                    return !entry?.hasEntry;
                });
                if (uncached.length > 0) {
                    freshByInterval.push({ interval, symbols: uncached });
                }
            }
        });
        maybeStartLoop();
        if (freshByInterval.length > 0) {
            const grouped = new Map();
            freshByInterval.forEach(({ interval, symbols: added }) => {
                const key = buildSymbolSetKey(added);
                if (!grouped.has(key)) {
                    grouped.set(key, { intervals: [], symbols: added });
                }
                grouped.get(key).intervals.push(interval);
            });
            void Promise.all(Array.from(grouped.values()).map(({ intervals: intervalBatch, symbols: symbolBatch }) => (
                refreshIntervals(intervalBatch, symbolBatch)
            )));
        }

        return () => {
            intervals.forEach((interval) => removeSymbols(intervalSymbolsRef.current, interval, normalized));
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshIntervals]);

    const subscribeChartSymbols = useCallback((interval, symbols) => {
        const normalized = (symbols || []).map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (!interval || normalized.length === 0) return () => { };

        const newlyAdded = addSymbols(chartSymbolsRef.current, interval, normalized);
        maybeStartLoop();
        if (newlyAdded.length > 0) {
            void refreshCharts(interval, newlyAdded);
        }

        return () => {
            removeSymbols(chartSymbolsRef.current, interval, normalized);
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshCharts]);

    const subscribeLiveSymbols = useCallback((symbols, options = {}) => {
        const { skipStrike = false } = options;
        const normalized = (symbols || []).map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (normalized.length === 0) return () => { };

        const newlyAdded = [];
        normalized.forEach((symbol) => {
            const prev = liveSymbolsRef.current.get(symbol) || 0;
            const next = prev + 1;
            liveSymbolsRef.current.set(symbol, next);
            if (prev === 0) newlyAdded.push(symbol);
        });
        if (!skipStrike) {
            normalized.forEach((symbol) => {
                const next = (liveStrikeSymbolsRef.current.get(symbol) || 0) + 1;
                liveStrikeSymbolsRef.current.set(symbol, next);
            });
        }
        maybeStartLoop();
        if (newlyAdded.length > 0) {
            void refreshLive(newlyAdded, { skipStrike });
        }

        return () => {
            normalized.forEach((symbol) => {
                const next = (liveSymbolsRef.current.get(symbol) || 0) - 1;
                if (next <= 0) {
                    liveSymbolsRef.current.delete(symbol);
                } else {
                    liveSymbolsRef.current.set(symbol, next);
                }
            });
            if (!skipStrike) {
                normalized.forEach((symbol) => {
                    const next = (liveStrikeSymbolsRef.current.get(symbol) || 0) - 1;
                    if (next <= 0) {
                        liveStrikeSymbolsRef.current.delete(symbol);
                    } else {
                        liveStrikeSymbolsRef.current.set(symbol, next);
                    }
                });
            }
            maybeStopLoop();
        };
    }, [maybeStartLoop, maybeStopLoop, refreshLive]);

    const subscribeFundamentals = useCallback((symbols) => {
        const normalized = (symbols || []).map((symbol) => cleanSymbol(symbol)).filter(Boolean);
        if (normalized.length === 0) return () => { };

        const newlyAdded = [];
        normalized.forEach((symbol) => {
            const prev = fundaSymbolsRef.current.get(symbol) || 0;
            const next = prev + 1;
            fundaSymbolsRef.current.set(symbol, next);
            if (prev === 0) newlyAdded.push(symbol);
        });
        maybeStartLoop();
        if (newlyAdded.length > 0) {
            void refreshFundamentals(newlyAdded);
        }

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

    const subscribeRequestVersion = useCallback((listener) => {
        requestListenersRef.current.add(listener);
        return () => requestListenersRef.current.delete(listener);
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
    const getChartRequestPending = useCallback((interval, symbols) => {
        if (!interval) return false;
        const globalKey = buildChartRequestKey(interval);
        if (inFlightRef.current.has(globalKey)) return true;
        if (!Array.isArray(symbols) || symbols.length === 0) return false;
        return inFlightRef.current.has(buildChartRequestKey(interval, normalizeSymbolList(symbols)));
    }, []);
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
        getChartRequestPending,
        getLiveVersion,
        getFundamentalsVersion,
        subscribeIntervalVersion,
        subscribeChartVersion,
        subscribeRequestVersion,
        subscribeLiveVersion,
        subscribeFundamentalsVersion,
    }), [
        getChartVersion,
        getChartRequestPending,
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
        subscribeRequestVersion,
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

export function useChartRequestPending(interval, symbols) {
    const { subscribeRequestVersion, getChartRequestPending } = useContext(MarketDataContext);
    const normalizedSymbols = useMemo(() => normalizeSymbolList(symbols), [symbols]);
    const getSnapshot = useCallback(
        () => getChartRequestPending(interval, normalizedSymbols),
        [getChartRequestPending, interval, normalizedSymbols]
    );
    return useSyncExternalStore(subscribeRequestVersion, getSnapshot, getSnapshot);
}

export function useLiveVersion() {
    const { subscribeLiveVersion, getLiveVersion } = useContext(MarketDataContext);
    return useSyncExternalStore(subscribeLiveVersion, getLiveVersion, getLiveVersion);
}

export function useFundamentalsVersion() {
    const { subscribeFundamentalsVersion, getFundamentalsVersion } = useContext(MarketDataContext);
    return useSyncExternalStore(subscribeFundamentalsVersion, getFundamentalsVersion, getFundamentalsVersion);
}
