import { useMemo, useEffect, useCallback } from 'react';
import { fetchUnifiedTrackerData } from '../services/priceService';
import { useAsync } from './useAsync';
import { buildItemToCompanies, collectUniqueSymbols, computeTrackerUpdates } from '../../packages/core/src/tracker/aggregation';

export function useUnifiedTracker(items, hierarchy, interval, type = 'sector') {
    const itemToSymbols = useMemo(() => buildItemToCompanies(items, hierarchy, type), [items, hierarchy, type]);

    const symbolsArray = useMemo(() => collectUniqueSymbols(itemToSymbols), [itemToSymbols]);

    const fetchFunc = useCallback(async () => {
        if (symbolsArray.length === 0) return {};

        // Fetch unified 1Y data (performance + breadth in one payload)
        const rawResults = await fetchUnifiedTrackerData(symbolsArray, interval);
        return computeTrackerUpdates(items, itemToSymbols, rawResults);
    }, [symbolsArray, itemToSymbols, interval, items]);

    const { data: trackerMap, loading, execute } = useAsync(fetchFunc, [symbolsArray, itemToSymbols, interval]);

    // Handle background refreshes
    useEffect(() => {
        if (symbolsArray.length === 0) return;
        const timer = setInterval(execute, 5 * 60_000); // Unified refresh every 5 mins
        return () => clearInterval(timer);
    }, [symbolsArray, execute]);

    return { trackerMap: trackerMap || {}, loading, refresh: execute };
}
