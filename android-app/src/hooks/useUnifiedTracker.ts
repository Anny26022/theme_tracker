import { useMemo, useCallback, useEffect } from 'react';
import { fetchUnifiedTrackerData } from '../services/priceService';
import { useAsync } from './useAsync';
import { buildItemToCompanies, collectUniqueSymbols, computeTrackerUpdates } from '@core/tracker/aggregation';
import { useMarketDataRegistry, useChartVersion } from '../contexts/MarketDataContext';
import { THEMATIC_MAP, MACRO_PILLARS } from '@core/market/thematicMap';
import { cleanSymbol } from '../services/priceService';

export function useUnifiedTracker(items: string[], hierarchy: any, interval: string, type: 'sector' | 'industry' | 'thematic' = 'sector') {
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
                    companies.forEach((company: any) => {
                        bucket.push(company);
                        const symbolKey = cleanSymbol(company.symbol);
                        if (symbolKey && !symbolToCompany.has(symbolKey)) {
                            symbolToCompany.set(symbolKey, company);
                        }
                    });
                });
            });

            const resolveThemesForItem = (itemName: string) => {
                if (themeByName.has(itemName)) return [themeByName.get(itemName)];
                const pillar = MACRO_PILLARS.find((p) => p.title === itemName);
                if (!pillar) return [];

                const themes: any[] = [];
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

                const companies: any[] = [];
                const seen = new Set();

                const addCompany = (company: any) => {
                    const symbolKey = cleanSymbol(company?.symbol);
                    if (!symbolKey || seen.has(symbolKey)) return;
                    seen.add(symbolKey);
                    companies.push(company);
                };

                themes.forEach((theme) => {
                    if (theme.industries) {
                        theme.industries.forEach((industryName: string) => {
                            const bucket = industryToCompanies.get(industryName) || [];
                            bucket.forEach(addCompany);
                        });
                    }

                    if (theme.symbols) {
                        theme.symbols.forEach((symbol: string) => {
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
        return buildItemToCompanies(items, hierarchy, type as any);
    }, [items, hierarchy, type]);

    const symbolsArray = useMemo(() => collectUniqueSymbols(itemToSymbols), [itemToSymbols]);
    const { subscribeChartSymbols, refreshCharts } = useMarketDataRegistry();
    const marketDataVersion = useChartVersion();

    useEffect(() => {
        if (symbolsArray.length === 0) return;
        return subscribeChartSymbols('1Y', symbolsArray);
    }, [subscribeChartSymbols, symbolsArray]);

    const fetchFunc = useCallback(async () => {
        if (symbolsArray.length === 0) return {};

        const rawResults = await fetchUnifiedTrackerData(symbolsArray, interval, { cacheOnly: true });
        if (rawResults.size === 0) {
            void refreshCharts('1Y', symbolsArray);
        }
        return computeTrackerUpdates(items, itemToSymbols, rawResults);
    }, [symbolsArray, itemToSymbols, interval, items, refreshCharts]);

    const { data: trackerMap, loading, execute } = useAsync(fetchFunc, [symbolsArray, itemToSymbols, interval, items, marketDataVersion]);

    const resolvedMap = trackerMap || {};
    const hasAnyData = useMemo(
        () => Object.values(resolvedMap).some((value) => value && typeof value.avgPerf === 'number'),
        [resolvedMap]
    );

    return {
        trackerMap: resolvedMap,
        loading: loading || (symbolsArray.length > 0 && !hasAnyData),
        refresh: execute
    };
}
