import { useEffect, useMemo, useState } from 'react';
import { cleanSymbol, getCachedIntervalEntry } from '../services/priceService';
import { useIntervalVersion, useMarketDataRegistry } from '../context/MarketDataContext';

const HEATMAP_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD'];
const PRIMARY_INTERVALS = ['1D'];
const SECONDARY_INTERVALS = ['5D', '1M', '3M', '6M', '1Y', 'YTD'];
const SECONDARY_FETCH_DELAY_MS = 350;

function buildHeatmap(themeToSymbols, intervalResults) {
    const heatmap = {};
    const names = Array.from(themeToSymbols.keys());

    names.forEach((themeName) => {
        const symbols = themeToSymbols.get(themeName);
        if (!symbols) return;
        heatmap[themeName] = {};
        HEATMAP_INTERVALS.forEach((interval) => {
            const perfMap = intervalResults.get(interval);
            if (!perfMap) {
                heatmap[themeName][interval] = null;
                return;
            }

            let sum = 0;
            let validCount = 0;
            symbols.forEach((symbol) => {
                const data = perfMap.get(cleanSymbol(symbol));
                if (data && typeof data.changePct === 'number') {
                    sum += data.changePct;
                    validCount += 1;
                }
            });
            heatmap[themeName][interval] = validCount > 0 ? (sum / validCount) : null;
        });
    });

    return heatmap;
}

function hasAnyHeatmapValues(heatmap) {
    return Object.values(heatmap || {}).some((intervalMap) =>
        Object.values(intervalMap || {}).some((value) => Number.isFinite(value))
    );
}

export function useThematicHeatmap(thematicMap, hierarchy, options = {}) {
    const { subscribeIntervalSymbols } = useMarketDataRegistry();
    const intervalVersion = useIntervalVersion();
    const [secondaryPhaseActive, setSecondaryPhaseActive] = useState(false);
    const enabled = options?.enabled !== false;

    const themeMappings = useMemo(() => {
        if (!thematicMap || !hierarchy) return { themeToSymbols: new Map(), allSymbols: [] };

        const industryMap = {};
        Object.values(hierarchy).forEach((industries) => {
            if (!industries) return;
            Object.entries(industries).forEach(([indName, companies]) => {
                industryMap[indName] = companies;
            });
        });

        const tToS = new Map(); // Use Map for themeToSymbols
        const assigned = new Set();
        const allSymsSet = new Set();

        // Pass 1: Explicit symbols priority
        thematicMap.forEach((block) => {
            block.themes.forEach((theme) => {
                if (!tToS.has(theme.name)) tToS.set(theme.name, new Set());
                if (theme.symbols) {
                    theme.symbols.forEach((sym) => {
                        if (!assigned.has(sym)) {
                            assigned.add(sym);
                            tToS.get(theme.name).add(sym);
                            allSymsSet.add(sym);
                        }
                    });
                }
            });
        });

        // Pass 2: Industry symbols
        thematicMap.forEach((block) => {
            block.themes.forEach((theme) => {
                if (!tToS.has(theme.name)) tToS.set(theme.name, new Set()); // Ensure theme exists even if no explicit symbols
                if (theme.industries) {
                    theme.industries.forEach((ind) => {
                        const companies = industryMap[ind] || [];
                        companies.forEach((c) => {
                            if (c?.symbol && !assigned.has(c.symbol)) {
                                assigned.add(c.symbol);
                                tToS.get(theme.name).add(c.symbol);
                                allSymsSet.add(c.symbol);
                            }
                        });
                    });
                }
            });
        });

        // Convert sets to arrays for the final Map
        const finalThemeToSymbols = new Map();
        tToS.forEach((set, name) => {
            finalThemeToSymbols.set(name, Array.from(set));
        });

        return { themeToSymbols: finalThemeToSymbols, allSymbols: Array.from(allSymsSet) };
    }, [thematicMap, hierarchy]);

    const { themeToSymbols, allSymbols } = themeMappings;
    const normalizedSymbols = useMemo(
        () => Array.from(new Set(allSymbols.map((symbol) => cleanSymbol(symbol)).filter(Boolean))),
        [allSymbols]
    );

    useEffect(() => {
        if (!enabled) {
            setSecondaryPhaseActive(false);
            return;
        }
        setSecondaryPhaseActive(false);
    }, [enabled, normalizedSymbols]);

    useEffect(() => {
        if (!enabled || !normalizedSymbols.length) return;
        return subscribeIntervalSymbols(PRIMARY_INTERVALS, normalizedSymbols);
    }, [enabled, normalizedSymbols, subscribeIntervalSymbols]);

    useEffect(() => {
        if (!enabled || !normalizedSymbols.length) return undefined;

        let cancelled = false;
        let timeoutId = null;
        let idleId = null;
        const activateSecondaryPhase = () => {
            if (!cancelled) setSecondaryPhaseActive(true);
        };

        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            idleId = window.requestIdleCallback(activateSecondaryPhase, { timeout: SECONDARY_FETCH_DELAY_MS });
        } else {
            timeoutId = window.setTimeout(activateSecondaryPhase, SECONDARY_FETCH_DELAY_MS);
        }

        return () => {
            cancelled = true;
            if (idleId != null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(idleId);
            }
            if (timeoutId != null && typeof window !== 'undefined') {
                window.clearTimeout(timeoutId);
            }
        };
    }, [enabled, normalizedSymbols]);

    useEffect(() => {
        if (!enabled || !normalizedSymbols.length || !secondaryPhaseActive) return;
        return subscribeIntervalSymbols(SECONDARY_INTERVALS, normalizedSymbols);
    }, [enabled, normalizedSymbols, secondaryPhaseActive, subscribeIntervalSymbols]);

    const { heatmapData, stockPerfMap, intervalProgress, pendingIntervals, primaryHasValues } = useMemo(() => {
        const intervalResults = new Map();
        const primaryIntervalResults = new Map();
        const progress = {};
        const pending = [];

        HEATMAP_INTERVALS.forEach((interval) => {
            const perfMap = new Map();
            let completedSymbols = 0;
            const isQueued = enabled && !secondaryPhaseActive && SECONDARY_INTERVALS.includes(interval);

            normalizedSymbols.forEach((symbol) => {
                const entry = getCachedIntervalEntry(symbol, interval, { silent: true });
                if (entry?.hasEntry) completedSymbols += 1;
                if (entry?.data && typeof entry.data.changePct === 'number') {
                    perfMap.set(symbol, entry.data);
                }
            });

            if (perfMap.size > 0) intervalResults.set(interval, perfMap);
            if (PRIMARY_INTERVALS.includes(interval) && perfMap.size > 0) primaryIntervalResults.set(interval, perfMap);

            const totalSymbols = normalizedSymbols.length;
            const done = isQueued
                ? false
                : totalSymbols === 0
                    ? true
                    : completedSymbols >= totalSymbols;
            progress[interval] = {
                interval,
                totalGroups: 0,
                completedGroups: 0,
                totalSymbols,
                completedSymbols,
                done,
                queued: isQueued
            };
            if (!done) pending.push(interval);
        });

        const heatmap = buildHeatmap(themeToSymbols, intervalResults);
        const primaryHeatmap = buildHeatmap(themeToSymbols, primaryIntervalResults);
        return {
            heatmapData: heatmap,
            stockPerfMap: intervalResults,
            intervalProgress: progress,
            pendingIntervals: pending,
            primaryHasValues: hasAnyHeatmapValues(primaryHeatmap)
        };
    }, [enabled, normalizedSymbols, themeToSymbols, intervalVersion, secondaryPhaseActive]);

    const primaryStillLoading = PRIMARY_INTERVALS.some((interval) => !intervalProgress?.[interval]?.done);
    const loading = enabled && normalizedSymbols.length > 0 && primaryStillLoading && !primaryHasValues;

    return {
        heatmapData: heatmapData || {},
        stockPerfMap,
        loading,
        pendingIntervals,
        intervalProgress,
        secondaryPhaseActive
    };
}
