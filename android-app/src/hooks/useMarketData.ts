import { useMemo, useState, useEffect } from 'react';
import rawData from '../../assets/data.json';
import { buildHierarchyFromRawData, getSortedSectors } from '@core/market/hierarchy';

export const useMarketData = () => {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate async parse if needed, but it's local
        setTimeout(() => setLoading(false), 100);
    }, []);

    const hierarchy = useMemo(() => buildHierarchyFromRawData(rawData as any), []);

    const sectors = useMemo(() => getSortedSectors(hierarchy), [hierarchy]);

    return useMemo(() => ({ rawData, hierarchy, sectors, loading, error: null }), [hierarchy, sectors, loading]);
};
