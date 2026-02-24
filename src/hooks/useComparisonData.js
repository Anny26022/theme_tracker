import { fetchComparisonCharts } from '../services/priceService';
import { useAsync } from './useAsync';

/**
 * Hook to manage comparison data state and fetching.
 */
export function useComparisonData(symbols, interval) {
    const fetchFunc = async () => {
        if (!symbols || symbols.length === 0) return new Map();

        const allIndividualSymbols = new Set();
        symbols.forEach(s => {
            if (typeof s === 'string') allIndividualSymbols.add(s);
            else if (s && s.type === 'INDUSTRY') {
                if (s.members) s.members.forEach(m => allIndividualSymbols.add(m));
            }
        });

        const charts = await fetchComparisonCharts(Array.from(allIndividualSymbols), interval);
        const finalResults = new Map();

        symbols.forEach(s => {
            if (typeof s === 'string') {
                if (charts.has(s)) finalResults.set(s, charts.get(s));
            } else if (s && s.type === 'INDUSTRY') {
                s.members?.forEach(m => {
                    if (charts.has(m)) finalResults.set(m, charts.get(m));
                });
            }
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
