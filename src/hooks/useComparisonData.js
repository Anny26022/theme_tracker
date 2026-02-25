import { fetchComparisonCharts } from '../services/priceService';
import { useAsync } from './useAsync';
import { buildComparisonMap } from '../../packages/core/src/comparison/buildComparisonMap';

/**
 * Hook to manage comparison data state and fetching.
 */
export function useComparisonData(symbols, interval) {
    const fetchFunc = async () => {
        return buildComparisonMap(symbols, interval, fetchComparisonCharts);
    };

    const { data: dataMap, loading, error, execute } = useAsync(fetchFunc, [symbols, interval]);

    return {
        data: dataMap || new Map(),
        loading,
        error,
        refresh: execute
    };
}
