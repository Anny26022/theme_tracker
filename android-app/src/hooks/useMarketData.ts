import { useMemo } from 'react';
import rawData from '../../assets/data.json';
import { buildHierarchyFromRawData, getSortedSectors } from '@core/market/hierarchy';

export const useMarketData = () => {
    const hierarchy = useMemo(() => buildHierarchyFromRawData(rawData as any), []);

    const sectors = useMemo(() => getSortedSectors(hierarchy), [hierarchy]);

    return useMemo(() => ({ rawData, hierarchy, sectors, loading: false, error: null }), [hierarchy, sectors]);
};
