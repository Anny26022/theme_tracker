import { useState, useMemo, useEffect } from 'react';
import { fetchTechnicalBreadth, cleanSymbol } from '../services/priceService';
import { useAsync } from './useAsync';

export function useTechnicalBreadth(items, hierarchy, type = 'sector') {
    const itemToSymbols = useMemo(() => {
        const itemToSymbols = new Map();
        if (!items || items.length === 0) return itemToSymbols;

        for (const name of items) {
            const symbols = [];
            if (type === 'sector') {
                const sectorData = hierarchy[name];
                if (sectorData) {
                    Object.values(sectorData).forEach(companies => {
                        companies.forEach(c => symbols.push(c.symbol));
                    });
                }
            } else {
                for (const sector of Object.keys(hierarchy)) {
                    if (hierarchy[sector][name]) {
                        hierarchy[sector][name].forEach(c => symbols.push(c.symbol));
                        break;
                    }
                }
            }
            itemToSymbols.set(name, symbols);
        }
        return itemToSymbols;
    }, [items, hierarchy, type]);

    const fetchFunc = async () => {
        const updates = {};
        // We do this sequentially per industry to avoid massive parallel bulk calls 
        // that might hit Google rate limits.
        for (const [name, symbols] of itemToSymbols.entries()) {
            if (symbols.length === 0) {
                updates[name] = null;
                continue;
            }
            try {
                const result = await fetchTechnicalBreadth(symbols);
                updates[name] = result;
            } catch (err) {
                console.warn(`[BreadthHook] Failed for ${name}:`, err);
                updates[name] = null;
            }
        }
        return updates;
    };

    const { data: breadthMap, loading, execute } = useAsync(fetchFunc, [itemToSymbols]);

    return { breadthMap: breadthMap || {}, loading, refresh: execute };
}
