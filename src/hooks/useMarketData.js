import { useMemo } from 'react';
import { useAsync } from './useAsync';
import { buildHierarchyFromRawData, getSortedSectors } from '../../packages/core/src/market/hierarchy';

const MAX_CHUNK_CONCURRENCY = 6;

const normalizeSymbol = (symbol) => String(symbol || '').trim().toUpperCase();

const mergeChunkIntoMap = (symbolMap, chunk) => {
    if (Array.isArray(chunk)) {
        chunk.forEach((row) => {
            const symbol = normalizeSymbol(row?.symbol ?? row?.sym ?? row?.s);
            if (!symbol) return;
            symbolMap.set(symbol, row);
        });
        return;
    }

    if (chunk && typeof chunk === 'object') {
        Object.entries(chunk).forEach(([key, value]) => {
            const symbol = normalizeSymbol(value?.symbol ?? key);
            if (!symbol) return;
            symbolMap.set(symbol, value);
        });
    }
};

const runWithConcurrency = async (items, concurrency, worker) => {
    const queue = items.slice();
    const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length) {
            const item = queue.shift();
            if (item === undefined) break;
            await worker(item);
        }
    });
    await Promise.all(runners);
};

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

const tryFetchChunkedSnapshot = async () => {
    const metaRes = await fetch('/api/nse/meta', { cache: 'no-store' });
    if (!metaRes.ok) return null;

    const meta = await metaRes.json();
    const chunks = Array.isArray(meta?.chunks) ? meta.chunks : [];
    if (!chunks.length) return null;

    const versionKey = meta?.generatedAt || meta?.version || dataVersion || 'snapshot';
    const symbolMap = new Map();

    await runWithConcurrency(chunks, MAX_CHUNK_CONCURRENCY, async (chunkKey) => {
        const encodedKey = encodeURIComponent(chunkKey);
        let res;
        try {
            res = await fetch(`/api/nse/chunks/${encodedKey}?v=${encodeURIComponent(versionKey)}`, {
                cache: 'force-cache',
            });
        } catch (err) {
            console.error(`[MarketData] Network error fetching chunk ${chunkKey}:`, err);
            throw err;
        }

        if (!res.ok) {
            console.error(`[MarketData] Chunk ${chunkKey} failed HTTP status: ${res.status}`);
            throw new Error(`Snapshot chunk failed: ${chunkKey}`);
        }

        let chunk;
        try {
            chunk = await res.json();
        } catch (err) {
            console.error(`[MarketData] Chunk ${chunkKey} failed to parse JSON. Possible invalid response from server:`, err);
            throw err;
        }

        mergeChunkIntoMap(symbolMap, chunk);
    });

    if (symbolMap.size === 0) return null;
    return Array.from(symbolMap.values());
};

const fetchFunc = async () => {
    if (globalFetchPromise) return globalFetchPromise;

    globalFetchPromise = (async () => {
        try {
            const chunked = await tryFetchChunkedSnapshot();
            if (Array.isArray(chunked) && chunked.length > 0) {
                console.log(`[MarketData] Successfully loaded ${chunked.length} symbols from NSE chunks.`);
                return chunked;
            }
            console.warn("[MarketData] NSE chunks were empty or invalid. Falling back to data.json.");
        } catch (error) {
            console.error("[MarketData] Failed to load NSE chunked snapshots. Falling back to bundled data.json. Reason:", error);
        }

        return fetchDataJson();
    })();

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
