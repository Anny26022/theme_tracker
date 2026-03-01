import { fetchComparisonCharts } from '../services/priceService';
import { useCallback, useMemo } from 'react';
import { useAsync } from './useAsync';
import { buildComparisonMap } from '../../packages/core/src/comparison/buildComparisonMap';

function normalizeSymbols(symbols) {
    return Array.from(new Set((symbols || []).filter(Boolean).map((s) => String(s).trim().toUpperCase())));
}

/**
 * Hook to manage comparison data state and fetching.
 * Caching is centralized in priceService (memory + IDB); this hook stays stateless.
 */
export function useComparisonData(symbols, interval) {
    const stableSymbolKey = useMemo(() => normalizeSymbols(symbols).join('|'), [symbols]);
    const fetchFunc = useCallback(async () => {
        if (!stableSymbolKey) return new Map();
        const normalizedSymbols = stableSymbolKey.split('|');
        return buildComparisonMap(normalizedSymbols, interval, fetchComparisonCharts);
    }, [stableSymbolKey, interval]);
    const { data: dataMap, loading, error, execute } = useAsync(fetchFunc, [stableSymbolKey, interval]);

    return {
        data: dataMap || new Map(),
        loading,
        error,
        refresh: execute
    };
}
