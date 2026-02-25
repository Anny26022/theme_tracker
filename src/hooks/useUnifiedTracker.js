import { useMemo, useRef, useEffect, useCallback } from 'react';
import { fetchUnifiedTrackerData, cleanSymbol } from '../services/priceService';
import { useAsync } from './useAsync';

export function useUnifiedTracker(items, hierarchy, interval, type = 'sector') {
    const itemToSymbols = useMemo(() => {
        const itemToSymbols = new Map();
        if (!items || items.length === 0) return itemToSymbols;

        for (const name of items) {
            const symbols = [];
            if (type === 'sector') {
                const sectorData = hierarchy[name];
                if (sectorData) {
                    Object.values(sectorData).forEach(companies => {
                        companies.forEach(c => symbols.push(c));
                    });
                }
            } else {
                for (const sector of Object.keys(hierarchy)) {
                    if (hierarchy[sector][name]) {
                        hierarchy[sector][name].forEach(c => symbols.push(c));
                        break;
                    }
                }
            }
            itemToSymbols.set(name, symbols);
        }
        return itemToSymbols;
    }, [items, hierarchy, type]);

    const symbolsArray = useMemo(() => {
        const allSymbols = new Set();
        itemToSymbols.forEach(companies => {
            companies.forEach(c => allSymbols.add(c.symbol));
        });
        return [...allSymbols];
    }, [itemToSymbols]);

    const fetchFunc = useCallback(async () => {
        if (symbolsArray.length === 0) return {};

        // Fetch unified 1Y data (performance + breadth in one payload)
        const rawResults = await fetchUnifiedTrackerData(symbolsArray, interval);
        const updates = {};

        for (const name of items) {
            const companies = itemToSymbols.get(name) || [];
            let totalPerf = 0;
            let above10 = 0, above21 = 0, above50 = 0, above150 = 0, above200 = 0;
            let validCount = 0;
            const pool = [];

            companies.forEach(c => {
                const key = cleanSymbol(c.symbol);
                const data = rawResults.get(key);

                if (data && data.perf.changePct !== null) {
                    totalPerf += data.perf.changePct;

                    if (data.breadth.above10EMA) above10++;
                    if (data.breadth.above21EMA) above21++;
                    if (data.breadth.above50EMA) above50++;
                    if (data.breadth.above150EMA) above150++;
                    if (data.breadth.above200EMA) above200++;

                    validCount++;

                    if (!/^\d+$/.test(c.symbol)) {
                        pool.push({
                            name: c.name,
                            symbol: c.symbol,
                            perf: data.perf.changePct,
                            breadth: data.breadth
                        });
                    }
                }
            });

            if (validCount > 0) {
                const sortedPool = [...pool].sort((a, b) => b.perf - a.perf);
                const leaders = sortedPool.slice(0, 6);
                // Filter out any leaders from the bottom list to ensure zero overlap
                const remainingForLaggards = sortedPool.filter(p => !leaders.find(l => l.symbol === p.symbol));
                const laggards = remainingForLaggards.slice(-6).reverse();

                updates[name] = {
                    avgPerf: totalPerf / validCount,
                    breadth: {
                        above10EMA: (above10 / validCount) * 100,
                        above21EMA: (above21 / validCount) * 100,
                        above50EMA: (above50 / validCount) * 100,
                        above150EMA: (above150 / validCount) * 100,
                        above200EMA: (above200 / validCount) * 100,
                        validCount,
                        total: companies.length
                    },
                    leaders,
                    laggards
                };
            } else {
                updates[name] = null;
            }
        }

        return updates;
    }, [symbolsArray, itemToSymbols, interval]);

    const { data: trackerMap, loading, execute } = useAsync(fetchFunc, [symbolsArray, itemToSymbols, interval]);

    // Handle background refreshes
    useEffect(() => {
        if (symbolsArray.length === 0) return;
        const timer = setInterval(execute, 5 * 60_000); // Unified refresh every 5 mins
        return () => clearInterval(timer);
    }, [symbolsArray, execute]);

    return { trackerMap: trackerMap || {}, loading, refresh: execute };
}
