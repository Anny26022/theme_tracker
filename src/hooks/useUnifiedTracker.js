import { useMemo, useEffect, useCallback } from 'react';
import { fetchUnifiedTrackerData, cleanSymbol } from '../services/priceService';
import { useAsync } from './useAsync';
import { buildItemToCompanies, collectUniqueSymbols, computeTrackerUpdates } from '../../packages/core/src/tracker/aggregation';
import { THEMATIC_MAP } from '../data/thematicMap';

export function useUnifiedTracker(items, hierarchy, interval, type = 'sector') {
    const itemToSymbols = useMemo(() => {
        if (type === 'thematic') {
            const map = new Map();
            items.forEach(themeName => {
                let theme = null;
                for (const block of THEMATIC_MAP) {
                    theme = block.themes.find(t => t.name === themeName);
                    if (theme) break;
                }

                if (!theme) {
                    map.set(themeName, []);
                    return;
                }

                const companies = [];
                const seen = new Set();

                if (theme.industries) {
                    theme.industries.forEach(ind => {
                        for (const s of Object.keys(hierarchy)) {
                            if (hierarchy[s][ind]) {
                                hierarchy[s][ind].forEach(c => {
                                    if (!seen.has(c.symbol)) {
                                        seen.add(c.symbol);
                                        companies.push(c);
                                    }
                                });
                            }
                        }
                    });
                }

                if (theme.symbols) {
                    theme.symbols.forEach(sym => {
                        const clean = cleanSymbol(sym);
                        if (!seen.has(clean)) {
                            // Find company info in hierarchy if possible
                            let found = null;
                            for (const s of Object.keys(hierarchy)) {
                                for (const ind of Object.keys(hierarchy[s])) {
                                    found = hierarchy[s][ind].find(c => cleanSymbol(c.symbol) === clean);
                                    if (found) break;
                                }
                                if (found) break;   
                            }
                            if (found) {
                                seen.add(clean);
                                companies.push(found);
                            } else {
                                companies.push({ symbol: sym, name: sym });
                            }
                        }
                    });
                }
                map.set(themeName, companies);
            });
            return map;
        }
        return buildItemToCompanies(items, hierarchy, type);
    }, [items, hierarchy, type]);

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
