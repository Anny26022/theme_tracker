import { useEffect, useMemo, useState } from 'react';

const SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_STORAGE_KEY = 'tt_market_map_snapshot_v1';
const SNAPSHOT_TTL_MS = 45 * 60 * 1000;
const SNAPSHOT_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD'];

function hasFiniteValue(value) {
    return Number.isFinite(value);
}

function hasAnyHeatmapValues(heatmap) {
    return Object.values(heatmap || {}).some((intervalMap) =>
        Object.values(intervalMap || {}).some((value) => hasFiniteValue(value))
    );
}

function readSnapshotStore() {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== SNAPSHOT_SCHEMA_VERSION || typeof parsed.scopes !== 'object') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function writeSnapshotStore(store) {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(store));
    } catch {
        // Ignore quota / serialization failures. Snapshot caching is opportunistic.
    }
}

function readScopeSnapshot(scope) {
    if (!scope) return null;

    const store = readSnapshotStore();
    const snapshot = store?.scopes?.[scope];
    if (!snapshot) return null;
    const snapshotTimestamp = typeof snapshot.generatedAtMs === 'number'
        ? snapshot.generatedAtMs
        : snapshot.savedAt;
    if (typeof snapshotTimestamp !== 'number') return null;

    const isExpired = Date.now() - snapshotTimestamp > SNAPSHOT_TTL_MS;
    if (isExpired) return null;

    return {
        ...snapshot,
        generatedAtMs: snapshotTimestamp
    };
}

function writeScopeSnapshot(scope, snapshot) {
    if (!scope || !snapshot) return;

    const store = readSnapshotStore() || { version: SNAPSHOT_SCHEMA_VERSION, scopes: {} };
    const nextStore = {
        version: SNAPSHOT_SCHEMA_VERSION,
        scopes: {
            ...store.scopes,
            [scope]: snapshot
        }
    };

    writeSnapshotStore(nextStore);
}

export function mergeMarketMapHeatmapData(snapshotHeatmapData, liveHeatmapData) {
    if (!snapshotHeatmapData) return liveHeatmapData || {};
    if (!liveHeatmapData) return snapshotHeatmapData;

    const merged = {};
    const themeNames = new Set([
        ...Object.keys(snapshotHeatmapData || {}),
        ...Object.keys(liveHeatmapData || {})
    ]);

    themeNames.forEach((themeName) => {
        const snapshotIntervals = snapshotHeatmapData?.[themeName] || {};
        const liveIntervals = liveHeatmapData?.[themeName] || {};
        const intervalMap = {};

        SNAPSHOT_INTERVALS.forEach((interval) => {
            const liveValue = liveIntervals[interval];
            const snapshotValue = snapshotIntervals[interval];
            intervalMap[interval] = hasFiniteValue(liveValue)
                ? liveValue
                : hasFiniteValue(snapshotValue)
                    ? snapshotValue
                    : null;
        });

        merged[themeName] = intervalMap;
    });

    return merged;
}

export function useMarketMapSnapshot(scope, liveHeatmapData, pendingIntervals) {
    const [revision, setRevision] = useState(0);
    const [networkState, setNetworkState] = useState({
        loading: Boolean(scope),
        resolved: false,
        error: null
    });

    const snapshotState = useMemo(() => readScopeSnapshot(scope), [scope, revision]);
    const snapshotHeatmapData = snapshotState?.heatmapData || null;
    const hasSnapshot = hasAnyHeatmapValues(snapshotHeatmapData);
    const snapshotAgeMs = snapshotState?.generatedAtMs ? Math.max(0, Date.now() - snapshotState.generatedAtMs) : null;
    const snapshotIsComplete = snapshotState?.complete !== false;
    const snapshotSource = snapshotState?.source || null;

    useEffect(() => {
        if (!scope || typeof window === 'undefined') {
            setNetworkState({ loading: false, resolved: true, error: null });
            return undefined;
        }

        const controller = new AbortController();
        setNetworkState({ loading: !hasSnapshot, resolved: false, error: null });

        const loadRemoteSnapshot = async () => {
            try {
                const response = await fetch(`/api/market-map/snapshot?scope=${encodeURIComponent(scope)}`, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`Snapshot request failed: ${response.status}`);
                }

                const payload = await response.json();
                const snapshot = payload?.snapshot;
                if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.heatmapData !== 'object') {
                    throw new Error('Snapshot payload invalid');
                }

                writeScopeSnapshot(scope, {
                    generatedAtMs: Date.parse(snapshot.generatedAt) || Date.now(),
                    complete: true,
                    heatmapData: snapshot.heatmapData,
                    source: 'server'
                });
                setRevision((value) => value + 1);
                setNetworkState({ loading: false, resolved: true, error: null });
            } catch (error) {
                if (controller.signal.aborted) return;
                setNetworkState({ loading: false, resolved: true, error });
            }
        };

        loadRemoteSnapshot();

        return () => controller.abort();
    }, [scope, hasSnapshot]);

    useEffect(() => {
        if (!scope || !hasAnyHeatmapValues(liveHeatmapData)) return;

        const nextComplete = !Array.isArray(pendingIntervals) || pendingIntervals.length === 0;
        const currentSnapshot = readScopeSnapshot(scope);

        // Persist client-derived fallback snapshots only when there is no server snapshot yet.
        const shouldPersist = !currentSnapshot || (currentSnapshot.source !== 'server' && !currentSnapshot.complete && nextComplete);
        if (!shouldPersist) return;

        writeScopeSnapshot(scope, {
            generatedAtMs: Date.now(),
            complete: nextComplete,
            heatmapData: liveHeatmapData,
            source: 'client'
        });
        setRevision((value) => value + 1);
    }, [scope, liveHeatmapData, pendingIntervals]);

    return {
        snapshotHeatmapData,
        hasSnapshot,
        snapshotAgeMs,
        snapshotIsComplete,
        snapshotSource,
        snapshotLoading: networkState.loading,
        snapshotResolved: networkState.resolved,
        snapshotError: networkState.error
    };
}
