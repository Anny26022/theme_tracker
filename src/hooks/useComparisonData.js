import { fetchComparisonCharts } from '../services/priceService';
import { useAsync } from './useAsync';

/**
 * Hook to manage comparison data state and fetching.
 */
export function useComparisonData(symbols, interval) {
    const fetchFunc = async () => {
        if (!symbols || symbols.length === 0) return new Map();

        const charts = await fetchComparisonCharts(symbols, interval);
        const finalResults = new Map();
        symbols.forEach(s => {
            if (charts.has(s)) finalResults.set(s, charts.get(s));
        });

        return finalResults;
    };

    const { data: dataMap, loading, error, execute } = useAsync(fetchFunc, [symbols, interval]);

    return {
        data: dataMap || new Map(),
        loading,
        error,
        refresh: execute
    };
}
