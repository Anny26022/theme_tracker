import { useMemo, useEffect, useCallback } from 'react';
import { fetchUnifiedTrackerData } from '../services/priceService';
import { useAsync } from './useAsync';
import { buildItemToCompanies, collectUniqueSymbols, computeTrackerUpdates } from '@core/tracker/aggregation';

export function useUnifiedTracker(items: string[], hierarchy: any, interval: string, type: 'sector' | 'industry' = 'sector') {
    const itemToSymbols = useMemo(() => buildItemToCompanies(items, hierarchy, type), [items, hierarchy, type]);

    const symbolsArray = useMemo(() => collectUniqueSymbols(itemToSymbols), [itemToSymbols]);

    const fetchFunc = useCallback(async () => {
        if (symbolsArray.length === 0) return {};

        const rawResults = await fetchUnifiedTrackerData(symbolsArray, interval);
        return computeTrackerUpdates(items, itemToSymbols, rawResults);
    }, [symbolsArray, itemToSymbols, interval, items]);

    const { data: trackerMap, loading, execute } = useAsync(fetchFunc, [symbolsArray, itemToSymbols, interval, items]);

    useEffect(() => {
        if (symbolsArray.length === 0) return;
        const timer = setInterval(execute, 5 * 60_000);
        return () => clearInterval(timer);
    }, [symbolsArray, execute]);

    return { trackerMap: trackerMap || {}, loading, refresh: execute };
}
