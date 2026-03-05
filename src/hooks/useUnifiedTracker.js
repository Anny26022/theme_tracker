import { useMemo, useEffect, useCallback, useRef } from 'react';
import { fetchUnifiedTrackerData, cleanSymbol } from '../services/priceService';
import { useAsync } from './useAsync';
import { buildItemToCompanies, collectUniqueSymbols, computeTrackerUpdates } from '../../packages/core/src/tracker/aggregation';
import { THEMATIC_MAP, MACRO_PILLARS } from '../data/thematicMap';
import { useChartVersion, useIntervalVersion, useMarketDataRegistry } from '../context/MarketDataContext';

export function useUnifiedTracker(items, hierarchy, interval, type = 'sector', options = {}) {
    const includeBreadth = options?.includeBreadth !== false;
    const { subscribeIntervalSymbols, subscribeChartSymbols, refreshIntervals, refreshCharts } = useMarketDataRegistry();
    const intervalVersion = useIntervalVersion();
    const chartVersion = useChartVersion();
    const lastRefreshKeyRef = useRef('');
    const itemToSymbols = useMemo(() => {
        if (type === 'thematic') {
            const themeByName = new Map();
            THEMATIC_MAP.forEach((block) => {
                block.themes.forEach((theme) => {
                    themeByName.set(theme.name, theme);
                });
            });

            const industryToCompanies = new Map();
            const symbolToCompany = new Map();
            Object.keys(hierarchy || {}).forEach((sector) => {
                const sectorData = hierarchy[sector] || {};
                Object.keys(sectorData).forEach((industry) => {
                    const companies = sectorData[industry] || [];
                    if (!industryToCompanies.has(industry)) industryToCompanies.set(industry, []);
                    const bucket = industryToCompanies.get(industry);
                    companies.forEach((company) => {
                        bucket.push(company);
                        const symbolKey = cleanSymbol(company.symbol);
                        if (symbolKey && !symbolToCompany.has(symbolKey)) {
                            symbolToCompany.set(symbolKey, company);
                        }
                    });
                });
            });

            const resolveThemesForItem = (itemName) => {
                if (themeByName.has(itemName)) return [themeByName.get(itemName)];
                const pillar = MACRO_PILLARS.find((p) => p.title === itemName);
                if (!pillar) return [];

                const themes = [];
                pillar.blocks.forEach((blockTitle) => {
                    const block = THEMATIC_MAP.find((b) => b.title === blockTitle);
                    if (!block) return;
                    block.themes.forEach((theme) => themes.push(theme));
                });
                return themes;
            };

            const map = new Map();
            items.forEach((itemName) => {
                const themes = resolveThemesForItem(itemName);
                if (themes.length === 0) {
                    map.set(itemName, []);
                    return;
                }

                const companies = [];
                const seen = new Set();

                const addCompany = (company) => {
                    const symbolKey = cleanSymbol(company?.symbol);
                    if (!symbolKey || seen.has(symbolKey)) return;
                    seen.add(symbolKey);
                    companies.push(company);
                };

                themes.forEach((theme) => {
                    if (theme.industries) {
                        theme.industries.forEach((industryName) => {
                            const bucket = industryToCompanies.get(industryName) || [];
                            bucket.forEach(addCompany);
                        });
                    }

                    if (theme.symbols) {
                        theme.symbols.forEach((symbol) => {
                            const symbolKey = cleanSymbol(symbol);
                            if (!symbolKey || seen.has(symbolKey)) return;
                            const found = symbolToCompany.get(symbolKey);
                            if (found) {
                                addCompany(found);
                            } else {
                                seen.add(symbolKey);
                                companies.push({ symbol, name: symbol });
                            }
                        });
                    }
                });

                map.set(itemName, companies);
            });

            return map;
        }
        return buildItemToCompanies(items, hierarchy, type);
    }, [items, hierarchy, type]);

    const symbolsArray = useMemo(() => collectUniqueSymbols(itemToSymbols), [itemToSymbols]);
    const allSymbolsNormalized = useMemo(
        () => Array.from(new Set(symbolsArray.map((symbol) => cleanSymbol(symbol)).filter(Boolean))),
        [symbolsArray]
    );

    const fetchFunc = useCallback(async () => {
        if (symbolsArray.length === 0) return {};

        // Performance mode can reuse interval cache and skip 1Y chart fetches.
        const rawResults = await fetchUnifiedTrackerData(symbolsArray, interval, { includeBreadth, cacheOnly: true });

        const missingSymbols = allSymbolsNormalized.filter((symbol) => !rawResults.has(symbol));
        if (missingSymbols.length > 0) {
            const refreshKey = missingSymbols.join(',');
            if (refreshKey !== lastRefreshKeyRef.current) {
                lastRefreshKeyRef.current = refreshKey;
                void refreshIntervals([interval], missingSymbols);
                if (includeBreadth) {
                    void refreshCharts('1Y', missingSymbols);
                }
            }
        }

        return computeTrackerUpdates(items, itemToSymbols, rawResults);
    }, [symbolsArray, itemToSymbols, interval, items, includeBreadth, refreshIntervals, refreshCharts, allSymbolsNormalized]);

    useEffect(() => {
        if (allSymbolsNormalized.length === 0) return;
        const intervalUnsub = subscribeIntervalSymbols([interval], allSymbolsNormalized);
        const chartUnsub = includeBreadth ? subscribeChartSymbols('1Y', allSymbolsNormalized) : () => { };
        return () => {
            intervalUnsub?.();
            chartUnsub?.();
        };
    }, [allSymbolsNormalized, interval, includeBreadth, subscribeIntervalSymbols, subscribeChartSymbols]);

    const refreshSignal = includeBreadth ? chartVersion : 0;
    const { data: trackerMap, loading, execute } = useAsync(
        fetchFunc,
        [symbolsArray, itemToSymbols, interval, includeBreadth, intervalVersion, refreshSignal, allSymbolsNormalized]
    );

    const resolvedMap = trackerMap || {};
    const hasAnyData = useMemo(
        () => Object.values(resolvedMap).some((value) => value && (typeof value.avgPerf === 'number' || value?.breadth?.validCount > 0)),
        [resolvedMap]
    );

    return {
        trackerMap: resolvedMap,
        loading: loading || (symbolsArray.length > 0 && !hasAnyData),
        refresh: execute
    };
}
