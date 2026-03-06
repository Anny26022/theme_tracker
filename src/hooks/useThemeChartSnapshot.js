import { useEffect, useMemo, useState } from 'react';
import { buildWorkerApiUrl } from '../lib/workerApi';
import { cleanSymbol } from '../services/priceService';

const CHART_SNAPSHOT_SCHEMA_VERSION = 2;
const CHART_SNAPSHOT_STORAGE_KEY = 'tt_market_map_chart_snapshot_v2';
const CHART_SNAPSHOT_TTL_MS = 45 * 60 * 1000;
const chartSnapshotManifestRequestCache = new Map();
const chartSnapshotPayloadRequestCache = new Map();

function readSnapshotStore() {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(CHART_SNAPSHOT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== CHART_SNAPSHOT_SCHEMA_VERSION || typeof parsed.entries !== 'object') {
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
        window.localStorage.setItem(CHART_SNAPSHOT_STORAGE_KEY, JSON.stringify(store));
    } catch {
        // Opportunistic cache only.
    }
}

function getStorageKey(scope, themeName) {
    return `${scope || 'nse'}:${themeName || ''}`;
}

function readThemeSnapshot(scope, themeName) {
    const key = getStorageKey(scope, themeName);
    if (!themeName) return null;

    const store = readSnapshotStore();
    const snapshot = store?.entries?.[key];
    if (!snapshot) return null;

    const generatedAtMs = typeof snapshot.generatedAtMs === 'number' ? snapshot.generatedAtMs : snapshot.savedAt;
    if (typeof generatedAtMs !== 'number') return null;
    if (Date.now() - generatedAtMs > CHART_SNAPSHOT_TTL_MS) return null;

    return {
        ...snapshot,
        generatedAtMs,
    };
}

function writeThemeSnapshot(scope, themeName, snapshot) {
    if (!themeName) return;

    const key = getStorageKey(scope, themeName);
    const store = readSnapshotStore() || { version: CHART_SNAPSHOT_SCHEMA_VERSION, entries: {} };
    writeSnapshotStore({
        version: CHART_SNAPSHOT_SCHEMA_VERSION,
        entries: {
            ...store.entries,
            [key]: snapshot,
        },
    });
}

function fetchRemoteThemeChartSnapshotManifest(scope, themeName) {
    const key = getStorageKey(scope, themeName);
    const cached = chartSnapshotManifestRequestCache.get(key);
    if (cached) return cached;

    const request = fetch(
        buildWorkerApiUrl(`/api/market-map/chart-snapshot?scope=${encodeURIComponent(scope)}&theme=${encodeURIComponent(themeName)}`),
        {
            method: 'GET',
            headers: { Accept: 'application/json' },
        }
    )
        .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || `Chart snapshot manifest request failed: ${response.status}`);
            const manifest = payload?.manifest;
            if (
                !manifest ||
                typeof manifest !== 'object' ||
                typeof manifest.versionId !== 'string'
            ) {
                throw new Error('Chart snapshot manifest invalid');
            }
            return manifest;
        })
        .finally(() => {
            chartSnapshotManifestRequestCache.delete(key);
        });

    chartSnapshotManifestRequestCache.set(key, request);
    return request;
}

function fetchRemoteThemeChartSnapshotVersion(scope, themeName, versionId) {
    const key = `${getStorageKey(scope, themeName)}:${versionId}`;
    const cached = chartSnapshotPayloadRequestCache.get(key);
    if (cached) return cached;

    const request = fetch(
        buildWorkerApiUrl(`/api/market-map/chart-snapshot/version?scope=${encodeURIComponent(scope)}&theme=${encodeURIComponent(themeName)}&version=${encodeURIComponent(versionId)}`),
        {
            method: 'GET',
            headers: { Accept: 'application/json' },
        }
    )
        .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || `Chart snapshot payload request failed: ${response.status}`);
            const snapshot = payload?.snapshot;
            if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.symbols !== 'object') {
                throw new Error('Chart snapshot payload invalid');
            }
            return snapshot;
        })
        .finally(() => {
            chartSnapshotPayloadRequestCache.delete(key);
        });

    chartSnapshotPayloadRequestCache.set(key, request);
    return request;
}

export function useThemeChartSnapshot(themeName, scope = 'nse') {
    const [revision, setRevision] = useState(0);
    const [hydratedSnapshot, setHydratedSnapshot] = useState(null);
    const [networkState, setNetworkState] = useState({
        loading: Boolean(themeName),
        resolved: false,
        error: null,
    });

    const storedSnapshot = useMemo(() => readThemeSnapshot(scope, themeName), [scope, themeName, revision]);
    const snapshotState = hydratedSnapshot && hydratedSnapshot.scope === scope && hydratedSnapshot.theme === themeName
        ? hydratedSnapshot
        : storedSnapshot;
    const cachedSeriesCount = useMemo(() => {
        const symbols = snapshotState?.symbols || {};
        let count = 0;
        Object.values(symbols).forEach((value) => {
            if (Array.isArray(value?.series) && value.series.length > 1) count += 1;
        });
        return count;
    }, [snapshotState]);
    const hasUsableCachedSnapshot = snapshotState?.source === 'server'
        && typeof snapshotState?.generatedAtMs === 'number'
        && cachedSeriesCount > 0;
    const snapshotVersionId = snapshotState?.versionId || null;

    useEffect(() => {
        if (!themeName) {
            setHydratedSnapshot(null);
            return;
        }
        setHydratedSnapshot((prev) => (
            prev && prev.scope === scope && prev.theme === themeName
                ? prev
                : null
        ));
    }, [scope, themeName]);

    useEffect(() => {
        if (!themeName || typeof window === 'undefined') {
            setNetworkState({ loading: false, resolved: true, error: null });
            return undefined;
        }

        let cancelled = false;
        setNetworkState((prev) => ({
            loading: !hasUsableCachedSnapshot,
            resolved: hasUsableCachedSnapshot,
            error: prev.error
        }));

        const load = async () => {
            try {
                const manifest = await fetchRemoteThemeChartSnapshotManifest(scope, themeName);
                if (cancelled || !manifest) return;

                if (hasUsableCachedSnapshot && snapshotVersionId === manifest.versionId) {
                    setNetworkState({ loading: false, resolved: true, error: null });
                    return;
                }

                const snapshot = await fetchRemoteThemeChartSnapshotVersion(scope, themeName, manifest.versionId);
                if (cancelled || !snapshot) return;

                const nextSnapshot = {
                    generatedAtMs: Date.parse(snapshot.generatedAt) || Date.now(),
                    versionId: manifest.versionId,
                    source: 'server',
                    theme: snapshot.theme,
                    scope: snapshot.scope,
                    interval: snapshot.interval,
                    symbols: snapshot.symbols,
                };
                setHydratedSnapshot(nextSnapshot);
                writeThemeSnapshot(scope, themeName, nextSnapshot);
                setRevision((value) => value + 1);
                setNetworkState({ loading: false, resolved: true, error: null });
            } catch (error) {
                if (cancelled) return;
                setNetworkState({ loading: false, resolved: true, error });
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [hasUsableCachedSnapshot, scope, snapshotVersionId, themeName]);

    const seriesBySymbol = useMemo(() => {
        const map = new Map();
        const symbols = snapshotState?.symbols || {};
        Object.entries(symbols).forEach(([symbol, value]) => {
            const cleaned = cleanSymbol(symbol);
            if (!cleaned || !Array.isArray(value?.series) || value.series.length < 2) return;
            map.set(cleaned, value.series);
        });
        return map;
    }, [snapshotState]);

    return {
        chartSnapshot: snapshotState,
        chartSnapshotSeriesBySymbol: seriesBySymbol,
        chartSnapshotLoading: networkState.loading,
        chartSnapshotResolved: networkState.resolved,
        chartSnapshotError: networkState.error,
        hasChartSnapshot: seriesBySymbol.size > 0,
    };
}
