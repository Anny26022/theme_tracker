import { fetchComparisonCharts } from '../services/priceService';
import { useAsync } from './useAsync';
import { buildComparisonMap } from '@core/comparison/buildComparisonMap';

export function useComparisonData(symbols: string[], interval: string) {
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
