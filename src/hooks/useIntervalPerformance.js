import { useEffect, useRef } from 'react';
import { fetchBatchIntervalPerformance, cleanSymbol } from '../services/priceService';
import { useAsync } from './useAsync';

const REFRESH_INTERVALS = {
    '1D': 5 * 60_000,
    '5D': 5 * 60_000,
    '1M': 10 * 60_000,
    '6M': 10 * 60_000,
    'YTD': 10 * 60_000,
    '1Y': 10 * 60_000,
    '5Y': 15 * 60_000,
    'MAX': 15 * 60_000,
};

export function useIntervalPerformance(items, hierarchy, interval, type = 'sector') {
    const fetchFunc = async () => {
        if (!items || !items.length) return {};

        const itemToSymbols = new Map();
        const allSymbols = new Set();

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
            symbols.forEach(c => allSymbols.add(c.symbol));
        }

        const symbolsArray = [...allSymbols];
        if (symbolsArray.length === 0) return {};

        const results = await fetchBatchIntervalPerformance(symbolsArray, interval);
        const updates = {};

        for (const name of items) {
            const companies = itemToSymbols.get(name) || [];
            let totalPerf = 0;
            let validCount = 0;
            const pool = [];

            companies.forEach(c => {
                const key = cleanSymbol(c.symbol);
                const data = results.get(key);
                if (data && data.changePct !== null) {
                    totalPerf += data.changePct;
                    validCount++;

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

        return updates;
    };

    const { data: perfMap, loading, execute } = useAsync(fetchFunc, [items, hierarchy, type, interval]);
    const intervalTimerRef = useRef(null);

    useEffect(() => {
        if (!items || !items.length) return;

        const refreshMs = REFRESH_INTERVALS[interval] || 10 * 60_000;
        intervalTimerRef.current = setInterval(() => {
            execute();
        }, refreshMs);

        return () => {
            if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
        };
    }, [items, interval, execute]);

    return { perfMap: perfMap || {}, loading };
}

