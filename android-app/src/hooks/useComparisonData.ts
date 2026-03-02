import { useCallback, useEffect, useMemo } from 'react';
import { cleanSymbol, getCachedComparisonSeries } from '../services/priceService';
import { useMarketDataRegistry, useChartVersion } from '../contexts/MarketDataContext';

export function useComparisonData(symbols: string[], interval: string) {
    const { subscribeChartSymbols, refreshCharts } = useMarketDataRegistry();
    const version = useChartVersion();

    useEffect(() => {
        if (!symbols.length) return;
        return subscribeChartSymbols(interval, symbols);
    }, [interval, symbols, subscribeChartSymbols]);

    const dataMap = useMemo(() => {
        const cacheVersion = version;
        const map = new Map<string, any[]>();
        if (cacheVersion < 0) return map;
        symbols.forEach((symbol) => {
            const series = getCachedComparisonSeries(symbol, interval);
            if (series && series.length) {
                map.set(cleanSymbol(symbol), series);
            }
        });
        return map;
    }, [symbols, interval, version]);

    const loading = symbols.length > 0 && dataMap.size === 0;

    const refresh = useCallback(() => {
        if (!symbols.length) return;
        void refreshCharts(interval, symbols);
    }, [interval, refreshCharts, symbols]);

    return {
        data: dataMap,
        loading,
        error: null,
        refresh
    };
}
