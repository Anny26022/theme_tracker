import { getCachedComparisonSeries } from '../services/priceService';
import { useCallback, useEffect, useMemo } from 'react';
import { useChartVersion, useMarketDataRegistry } from '../context/MarketDataContext';

function normalizeSymbols(symbols) {
    return Array.from(new Set((symbols || []).filter(Boolean).map((s) => String(s).trim().toUpperCase()))).sort();
}

/**
 * Hook to manage comparison data state and fetching.
 * Caching is centralized in priceService (memory + IDB); this hook stays stateless.
 */
export function useComparisonData(symbols, interval) {
    const { subscribeChartSymbols, refreshCharts } = useMarketDataRegistry();
    const chartVersion = useChartVersion();
    const normalizedSymbols = useMemo(() => normalizeSymbols(symbols), [symbols]);
    const stableSymbolKey = useMemo(() => normalizedSymbols.join('|'), [normalizedSymbols]);

    useEffect(() => {
        if (!normalizedSymbols.length || !interval) return;
        return subscribeChartSymbols(interval, normalizedSymbols);
    }, [interval, normalizedSymbols, stableSymbolKey, subscribeChartSymbols]);

    const dataMap = useMemo(() => {
        const map = new Map();
        normalizedSymbols.forEach((symbol) => {
            const series = getCachedComparisonSeries(symbol, interval, { silent: true });
            if (series) map.set(symbol, series);
        });
        return map;
    }, [normalizedSymbols, interval, chartVersion]);

    const refresh = useCallback(() => {
        if (!normalizedSymbols.length || !interval) return Promise.resolve(new Map());
        return refreshCharts(interval, normalizedSymbols);
    }, [interval, normalizedSymbols, stableSymbolKey, refreshCharts]);

    const loading = normalizedSymbols.length > 0 && dataMap.size < normalizedSymbols.length;

    return {
        data: dataMap || new Map(),
        loading,
        error: null,
        refresh
    };
}
