import { useMemo, useEffect, useRef } from 'react';
import { cleanSymbol, getCachedInterval } from '../services/priceService';
import { THEMATIC_MAP, BlockDefinition } from '@core/market/thematicMap';
import { useMarketDataRegistry, useIntervalVersion } from '../contexts/MarketDataContext';

const HEATMAP_INTERVALS = ['1D', '5D', '1M', '6M', 'YTD'];

export function useThematicHeatmap(hierarchy: any) {
    const thematicMap = THEMATIC_MAP;
    const stockPerfMapRef = useRef<Map<string, Map<string, number>>>(new Map());
    const stockPerfVersionRef = useRef(0);
    const { subscribeIntervalSymbols } = useMarketDataRegistry();
    const marketDataVersion = useIntervalVersion();

    const themeMappings = useMemo(() => {
        const themeToSymbols = new Map<string, string[]>();
        const allSymbolsSet = new Set<string>();
        if (!thematicMap || !hierarchy) return { themeToSymbols, allSymbols: [] };

        thematicMap.forEach((block: BlockDefinition) => {
            block.themes.forEach(theme => {
                const symbols = new Set<string>();
                if (theme.industries) {
                    theme.industries.forEach(indName => {
                        for (const sector in hierarchy) {
                            if (hierarchy[sector][indName]) {
                                hierarchy[sector][indName].forEach((c: any) => {
                                    if (c.symbol) {
                                        symbols.add(c.symbol);
                                        allSymbolsSet.add(c.symbol);
                                    }
                                });
                                break;
                            }
                        }
                    });
                }
                if (theme.symbols) {
                    theme.symbols.forEach(s => {
                        symbols.add(s);
                        allSymbolsSet.add(s);
                    });
                }
                themeToSymbols.set(theme.name, Array.from(symbols));
            });
        });

        return {
            themeToSymbols,
            allSymbols: Array.from(allSymbolsSet)
        };
    }, [hierarchy, thematicMap]);

    const { themeToSymbols, allSymbols } = themeMappings;

    useEffect(() => {
        if (!allSymbols.length) return;
        return subscribeIntervalSymbols(HEATMAP_INTERVALS, allSymbols);
    }, [allSymbols, subscribeIntervalSymbols]);

    const { heatmapData, stockPerfMap, hasData } = useMemo(() => {
        const cacheVersion = marketDataVersion;
        if (allSymbols.length === 0) {
            return {
                heatmapData: {},
                stockPerfMap: new Map<string, Map<string, number>>(),
                hasData: false,
            };
        }

        const normalizedSymbols = Array.from(new Set(allSymbols.map((symbol) => cleanSymbol(symbol))));
        const stockPerfMapLocal = new Map<string, Map<string, number>>();
        let anyData = false;

        if (cacheVersion < 0) {
            return {
                heatmapData: {},
                stockPerfMap: stockPerfMapLocal,
                hasData: false,
            };
        }

        HEATMAP_INTERVALS.forEach((interval) => {
            const perfMap = new Map<string, number>();
            normalizedSymbols.forEach((symbol) => {
                const cached = getCachedInterval(symbol, interval);
                if (cached && typeof cached.changePct === 'number') {
                    perfMap.set(symbol, cached.changePct);
                }
            });
            if (perfMap.size > 0) anyData = true;
            stockPerfMapLocal.set(interval, perfMap);
        });

        const heatmap: any = {};
        themeToSymbols.forEach((symbols, themeName) => {
            heatmap[themeName] = {};
            HEATMAP_INTERVALS.forEach((interval) => {
                const perfMap = stockPerfMapLocal.get(interval);
                let sum = 0;
                let validCount = 0;
                symbols.forEach(s => {
                    const val = perfMap?.get(cleanSymbol(s));
                    if (typeof val === 'number') {
                        sum += val;
                        validCount++;
                    }
                });
                heatmap[themeName][interval] = validCount > 0 ? (sum / validCount) : null;
            });
        });

        return {
            heatmapData: heatmap,
            stockPerfMap: stockPerfMapLocal,
            hasData: anyData,
        };
    }, [allSymbols, themeToSymbols, marketDataVersion]);

    useEffect(() => {
        if (stockPerfMap) {
            stockPerfMapRef.current = stockPerfMap;
        }
    }, [stockPerfMap]);

    return {
        heatmapData,
        stockPerfMap: stockPerfMap || stockPerfMapRef.current,
        stockPerfVersion: marketDataVersion ?? stockPerfVersionRef.current,
        loading: allSymbols.length > 0 && !hasData
    };
}
