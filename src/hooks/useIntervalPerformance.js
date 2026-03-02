import { useEffect, useMemo } from 'react';
import { cleanSymbol, getCachedInterval } from '../services/priceService';
import { useIntervalVersion, useMarketDataRegistry } from '../context/MarketDataContext';

export function useIntervalPerformance(items, hierarchy, interval, type = 'sector') {
    const { subscribeIntervalSymbols } = useMarketDataRegistry();
    const intervalVersion = useIntervalVersion();
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
                // Build industry lookup once per render cycle and reuse.
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

    useEffect(() => {
        if (symbolsArray.length === 0) return;
        return subscribeIntervalSymbols([interval], symbolsArray);
    }, [symbolsArray, interval, subscribeIntervalSymbols]);

    const { perfMap, hasAnyData } = useMemo(() => {
        if (symbolsArray.length === 0) return { perfMap: {}, hasAnyData: false };

        const updates = {};
        let anyData = false;
        for (const name of items) {
            const companies = itemToSymbols.get(name) || [];
            let totalPerf = 0;
            let validCount = 0;
            const pool = [];

            companies.forEach(c => {
                const key = cleanSymbol(c.symbol);
                const data = getCachedInterval(key, interval, { silent: true });
                if (data && data.changePct !== null) {
                    totalPerf += data.changePct;
                    validCount++;
                    anyData = true;

                    if (!/^\d+$/.test(c.symbol)) {
                        pool.push({
                            name: c.name,
                            symbol: c.symbol,
                            perf: data.changePct
                        });
                    }
                }
            });

            if (validCount > 0) {
                pool.sort((a, b) => b.perf - a.perf);
                updates[name] = {
                    avg: totalPerf / validCount,
                    leaders: pool.slice(0, 6),
                    laggards: [...pool].reverse().slice(0, 6)
                };
            } else {
                updates[name] = null;
            }
        }

        return { perfMap: updates, hasAnyData: anyData };
    }, [symbolsArray, itemToSymbols, items, interval, intervalVersion]);

    const loading = symbolsArray.length > 0 && !hasAnyData;

    return { perfMap: perfMap || {}, loading };
}
