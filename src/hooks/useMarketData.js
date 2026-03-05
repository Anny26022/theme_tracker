import { useMemo } from 'react';
import { useAsync } from './useAsync';
import { buildHierarchyFromRawData, getSortedSectors } from '../../packages/core/src/market/hierarchy';

let globalFetchPromise = null;

const dataVersion = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';
const dataUrl = `/data.json?v=${encodeURIComponent(dataVersion)}`;

const fetchDataJson = async () => {
    const res = await fetch(dataUrl, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("Invalid data format: Expected array");
    return json;
};

const fetchFunc = async () => {
    if (globalFetchPromise) return globalFetchPromise;

    globalFetchPromise = fetchDataJson();

    try {
        const result = await globalFetchPromise;
        return result;
    } catch (err) {
        globalFetchPromise = null;
        throw err;
    }
};

export const useMarketData = () => {
    const { data: rawData = [], loading, error } = useAsync(fetchFunc, []);

    const hierarchy = useMemo(() => buildHierarchyFromRawData(rawData), [rawData]);

    const sectors = useMemo(() => getSortedSectors(hierarchy), [hierarchy]);

    return useMemo(() => ({ rawData, hierarchy, sectors, loading, error }), [rawData, hierarchy, sectors, loading, error]);
};
