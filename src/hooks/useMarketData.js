import { useMemo } from 'react';
import { useAsync } from './useAsync';

export const useMarketData = () => {
    const fetchFunc = async () => {
        const res = await fetch('/data.json');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json)) throw new Error("Invalid data format: Expected array");
        return json;
    };

    const { data: rawData = [], loading, error } = useAsync(fetchFunc, []);

    const hierarchy = useMemo(() => {
        if (!rawData || !Array.isArray(rawData)) return {};
        const tree = {};
        const industryToSector = {};

        // First pass: map industry names to the best available sector (non-N/A)
        rawData.forEach(item => {
            if (!item.industry) return;
            if (item.sector && item.sector !== 'N/A') {
                industryToSector[item.industry] = item.sector;
            }
        });

        // Second pass: build tree using the best sector
        rawData.forEach(item => {
            if (!item.industry) return;

            const sector = industryToSector[item.industry] || item.sector || 'N/A';

            if (!tree[sector]) tree[sector] = {};
            if (!tree[sector][item.industry]) tree[sector][item.industry] = [];

            tree[sector][item.industry].push({
                ...item,
                sector // Ensure the item itself carries the normalized sector
            });
        });

        return tree;
    }, [rawData]);

    const sectors = useMemo(() => Object.keys(hierarchy).sort(), [hierarchy]);

    return useMemo(() => ({ rawData, hierarchy, sectors, loading, error }), [rawData, hierarchy, sectors, loading, error]);
};

