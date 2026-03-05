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
    if (typeof snapshot.savedAt !== 'number') return null;

    const isExpired = Date.now() - snapshot.savedAt > SNAPSHOT_TTL_MS;
    if (isExpired) return null;

    return snapshot;
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

    const snapshotState = useMemo(() => readScopeSnapshot(scope), [scope, revision]);
    const snapshotHeatmapData = snapshotState?.heatmapData || null;
    const hasSnapshot = hasAnyHeatmapValues(snapshotHeatmapData);
    const snapshotAgeMs = snapshotState?.savedAt ? Math.max(0, Date.now() - snapshotState.savedAt) : null;
    const snapshotIsComplete = snapshotState?.complete !== false;

    useEffect(() => {
        if (!scope || !hasAnyHeatmapValues(liveHeatmapData)) return;

        const nextComplete = !Array.isArray(pendingIntervals) || pendingIntervals.length === 0;
        const currentSnapshot = readScopeSnapshot(scope);

        // Persist one partial snapshot if nothing exists, then upgrade it once the background
        // interval hydration completes. Avoid rewriting on every live cache tick.
        const shouldPersist = !currentSnapshot || (!currentSnapshot.complete && nextComplete);
        if (!shouldPersist) return;

        writeScopeSnapshot(scope, {
            savedAt: Date.now(),
            complete: nextComplete,
            heatmapData: liveHeatmapData
        });
        setRevision((value) => value + 1);
    }, [scope, liveHeatmapData, pendingIntervals]);

    return {
        snapshotHeatmapData,
        hasSnapshot,
        snapshotAgeMs,
        snapshotIsComplete
    };
}
