import { useEffect, useMemo, useState } from 'react';
import { buildWorkerApiUrl } from '../lib/workerApi';

const SNAPSHOT_SCHEMA_VERSION = 6;
const SNAPSHOT_STORAGE_KEY = 'tt_market_map_snapshot_v6';
const SNAPSHOT_TTL_MS = 45 * 60 * 1000;
const SNAPSHOT_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD', '5Y', 'MAX'];
const snapshotManifestRequestCache = new Map();
const snapshotPayloadRequestCache = new Map();

function hasFiniteValue(value) {
    return Number.isFinite(value);
}

function hasAnyHeatmapValues(heatmap) {
    return Object.values(heatmap || {}).some((intervalMap) =>
        Object.values(intervalMap || {}).some((value) => hasFiniteValue(value))
    );
}

function hasUsableThemeConstituents(themeConstituents, heatmapData) {
    const totalThemes = Object.keys(heatmapData || {}).length;
    if (totalThemes === 0) return false;

    const nonEmptyThemes = Object.values(themeConstituents || {}).filter(
        (companies) => Array.isArray(companies) && companies.length > 0
    ).length;

    return nonEmptyThemes / totalThemes >= 0.75;
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

function fetchRemoteSnapshotManifest(scope) {
    if (!scope) return Promise.resolve(null);

    const cachedRequest = snapshotManifestRequestCache.get(scope);
    if (cachedRequest) return cachedRequest;

    const request = fetch(buildWorkerApiUrl(`/api/market-map/snapshot?scope=${encodeURIComponent(scope)}`), {
        method: 'GET',
        headers: { Accept: 'application/json' },
    })
        .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || `Snapshot manifest request failed: ${response.status}`);
            }
            const manifest = payload?.manifest;
            if (
                !manifest ||
                typeof manifest !== 'object' ||
                typeof manifest.versionId !== 'string'
            ) {
                throw new Error('Snapshot manifest invalid');
            }

            return manifest;
        })
        .finally(() => {
            snapshotManifestRequestCache.delete(scope);
        });

    snapshotManifestRequestCache.set(scope, request);
    return request;
}

function fetchRemoteSnapshotVersion(scope, versionId) {
    const key = `${scope}:${versionId}`;
    const cachedRequest = snapshotPayloadRequestCache.get(key);
    if (cachedRequest) return cachedRequest;

    const request = fetch(
        buildWorkerApiUrl(`/api/market-map/snapshot/version?scope=${encodeURIComponent(scope)}&version=${encodeURIComponent(versionId)}`),
        {
            method: 'GET',
            headers: { Accept: 'application/json' },
        }
    )
        .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error || `Snapshot payload request failed: ${response.status}`);
            }

            const snapshot = payload?.snapshot;
            if (
                !snapshot ||
                typeof snapshot !== 'object' ||
                typeof snapshot.heatmapData !== 'object' ||
                typeof snapshot.themeConstituents !== 'object' ||
                typeof snapshot.symbolPerf !== 'object' ||
                typeof snapshot.symbolQuotes !== 'object' ||
                typeof snapshot.symbolTechnicals !== 'object'
            ) {
                throw new Error('Snapshot payload invalid');
            }

            return snapshot;
        })
        .finally(() => {
            snapshotPayloadRequestCache.delete(key);
        });

    snapshotPayloadRequestCache.set(key, request);
    return request;
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
    const snapshotThemeConstituents = snapshotState?.themeConstituents || null;
    const snapshotSymbolPerf = snapshotState?.symbolPerf || null;
    const snapshotSymbolQuotes = snapshotState?.symbolQuotes || null;
    const snapshotSymbolTechnicals = snapshotState?.symbolTechnicals || null;
    const hasSnapshot = hasAnyHeatmapValues(snapshotHeatmapData);
    const hasUsableSnapshot = hasSnapshot && hasUsableThemeConstituents(snapshotThemeConstituents, snapshotHeatmapData);
    const snapshotAgeMs = snapshotState?.generatedAtMs ? Math.max(0, Date.now() - snapshotState.generatedAtMs) : null;
    const snapshotIsComplete = snapshotState?.complete !== false;
    const snapshotSource = snapshotState?.source || null;
    const snapshotVersionId = snapshotState?.versionId || null;

    useEffect(() => {
        if (!scope || typeof window === 'undefined') {
            setNetworkState({ loading: false, resolved: true, error: null });
            return undefined;
        }

        let cancelled = false;
        setNetworkState({ loading: !hasUsableSnapshot, resolved: false, error: null });

        const loadRemoteSnapshot = async () => {
            try {
                const manifest = await fetchRemoteSnapshotManifest(scope);
                if (cancelled || !manifest) return;

                if (
                    snapshotState?.source === 'server' &&
                    snapshotVersionId === manifest.versionId &&
                    hasUsableSnapshot
                ) {
                    setNetworkState({ loading: false, resolved: true, error: null });
                    return;
                }

                const snapshot = await fetchRemoteSnapshotVersion(scope, manifest.versionId);
                if (cancelled || !snapshot) return;

                writeScopeSnapshot(scope, {
                    generatedAtMs: Date.parse(snapshot.generatedAt) || Date.now(),
                    versionId: manifest.versionId,
                    complete: true,
                    heatmapData: snapshot.heatmapData,
                    themeConstituents: snapshot.themeConstituents,
                    symbolPerf: snapshot.symbolPerf,
                    symbolQuotes: snapshot.symbolQuotes,
                    symbolTechnicals: snapshot.symbolTechnicals,
                    source: 'server'
                });
                setRevision((value) => value + 1);
                setNetworkState({ loading: false, resolved: true, error: null });
            } catch (error) {
                if (cancelled) return;
                setNetworkState({ loading: false, resolved: true, error });
            }
        };

        loadRemoteSnapshot();

        return () => {
            cancelled = true;
        };
    }, [hasUsableSnapshot, scope, snapshotState?.source, snapshotVersionId]);

    useEffect(() => {
        if (!scope || !hasAnyHeatmapValues(liveHeatmapData)) return;

        const nextComplete = !Array.isArray(pendingIntervals) || pendingIntervals.length === 0;
        const currentSnapshot = readScopeSnapshot(scope);

        // Persist client-derived fallback snapshots only when there is no server snapshot yet.
        const shouldPersist = !currentSnapshot || (currentSnapshot.source !== 'server' && !currentSnapshot.complete && nextComplete);
        if (!shouldPersist) return;

        writeScopeSnapshot(scope, {
            generatedAtMs: Date.now(),
            versionId: currentSnapshot?.versionId || null,
            complete: nextComplete,
            heatmapData: liveHeatmapData,
            themeConstituents: currentSnapshot?.themeConstituents || {},
            symbolPerf: currentSnapshot?.symbolPerf || {},
            symbolQuotes: currentSnapshot?.symbolQuotes || {},
            symbolTechnicals: currentSnapshot?.symbolTechnicals || {},
            source: 'client'
        });
        setRevision((value) => value + 1);
    }, [scope, liveHeatmapData, pendingIntervals]);

    return {
        snapshotHeatmapData,
        snapshotThemeConstituents,
        snapshotSymbolPerf,
        snapshotSymbolQuotes,
        snapshotSymbolTechnicals,
        hasSnapshot,
        snapshotAgeMs,
        snapshotIsComplete,
        snapshotSource,
        snapshotVersionId,
        snapshotLoading: networkState.loading,
        snapshotResolved: networkState.resolved,
        snapshotError: networkState.error
    };
}

export function useMarketMapSnapshotQuote(symbol, scope = 'all') {
    const { snapshotSymbolQuotes } = useMarketMapSnapshot(scope);

    return useMemo(() => {
        if (!symbol) return null;
        return snapshotSymbolQuotes?.[symbol] || null;
    }, [snapshotSymbolQuotes, symbol]);
}

export function useMarketMapSnapshotSymbol(symbol, scope = 'all') {
    const { snapshotSymbolQuotes, snapshotSymbolPerf, snapshotSymbolTechnicals } = useMarketMapSnapshot(scope);

    return useMemo(() => {
        if (!symbol) return null;
        return {
            quote: snapshotSymbolQuotes?.[symbol] || null,
            perf: snapshotSymbolPerf?.[symbol] || null,
            technicals: snapshotSymbolTechnicals?.[symbol] || null,
        };
    }, [snapshotSymbolPerf, snapshotSymbolQuotes, snapshotSymbolTechnicals, symbol]);
}
