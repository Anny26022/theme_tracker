import { useMemo, useCallback, useEffect } from 'react';
import { fetchUnifiedTrackerData } from '../services/priceService';
import { useAsync } from './useAsync';
import { buildItemToCompanies, collectUniqueSymbols, computeTrackerUpdates } from '@core/tracker/aggregation';
import { useMarketDataRegistry, useChartVersion } from '../contexts/MarketDataContext';

export function useUnifiedTracker(items: string[], hierarchy: any, interval: string, type: 'sector' | 'industry' = 'sector') {
    const itemToSymbols = useMemo(() => buildItemToCompanies(items, hierarchy, type), [items, hierarchy, type]);

    const symbolsArray = useMemo(() => collectUniqueSymbols(itemToSymbols), [itemToSymbols]);
    const { subscribeChartSymbols, refreshCharts } = useMarketDataRegistry();
    const marketDataVersion = useChartVersion();

    useEffect(() => {
        if (symbolsArray.length === 0) return;
        return subscribeChartSymbols('1Y', symbolsArray);
    }, [subscribeChartSymbols, symbolsArray]);

    const fetchFunc = useCallback(async () => {
        if (symbolsArray.length === 0) return {};

        const rawResults = await fetchUnifiedTrackerData(symbolsArray, interval, { cacheOnly: true });
        if (rawResults.size === 0) {
            void refreshCharts('1Y', symbolsArray);
        }
        return computeTrackerUpdates(items, itemToSymbols, rawResults);
    }, [symbolsArray, itemToSymbols, interval, items, refreshCharts]);

    const { data: trackerMap, loading, execute } = useAsync(fetchFunc, [symbolsArray, itemToSymbols, interval, items, marketDataVersion]);

    const resolvedMap = trackerMap || {};
    const hasAnyData = useMemo(
        () => Object.values(resolvedMap).some((value) => value && typeof value.avgPerf === 'number'),
        [resolvedMap]
    );

    return {
        trackerMap: resolvedMap,
        loading: loading || (symbolsArray.length > 0 && !hasAnyData),
        refresh: execute
    };
}
