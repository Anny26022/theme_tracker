/**
 * Filing Service - Handles fetching and persistent caching of company filings.
 * Filings are historical data and don't change frequently, so they can be cached heavily.
 */

import { EP_SCANX, CT_PLAIN } from '../lib/stealth';

const FILINGS_CACHE_KEY = 'tt_filings_cache:v1';
const FILINGS_CACHE_TTL = 3600_000 * 4; // 4 hours
const MAX_PERSISTED_FILINGS = 50; // Reduced to fit within 5MB sessionStorage limit (~70KB per entry)

// ─── Cache Management ──────────────────────────────────────────────

function pruneCache(cache, maxEntries) {
    if (cache.size <= maxEntries) return cache;
    const sorted = [...cache.entries()].sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
    cache.clear();
    sorted.slice(0, maxEntries).forEach(([k, v]) => cache.set(k, v));
    return cache;
}

function loadCache() {
    try {
        const raw = sessionStorage.getItem(FILINGS_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return new Map(parsed);
        }
    } catch (e) { console.warn('[FilingService] Cache hydration failed', e); }
    return new Map();
}

function saveCache(cache) {
    try {
        pruneCache(cache, MAX_PERSISTED_FILINGS);
        sessionStorage.setItem(FILINGS_CACHE_KEY, JSON.stringify([...cache]));
    } catch (e) { /* Storage likely full */ }
}

const filingsCache = loadCache();
let saveTimer = null;

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveCache(filingsCache), 1000);
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Fetch filings for a company by ISIN, with persistent caching.
 * @param {string} isin 
 */
export async function fetchCompanyFilings(isin) {
    if (!isin) return [];

    // Check Cache
    const cached = filingsCache.get(isin);
    if (cached && Date.now() - cached.timestamp < FILINGS_CACHE_TTL) {
        return cached.data;
    }

    // Nuclear: Base64 Masking (Dhan requires { data: { isin, count } } wrapper)
    const payload = btoa(JSON.stringify({ data: { isin, count: 500 } }));

    // Fetch fresh data
    try {
        const response = await fetch(EP_SCANX, {
            method: 'POST',
            headers: {
                'Content-Type': CT_PLAIN,
            },
            body: payload
        });

        if (!response.ok) throw new Error(`Filings API failed: ${response.status}`);
        const json = await response.json();
        const data = json.data || [];

        // Save to Cache
        filingsCache.set(isin, { data, timestamp: Date.now() });
        scheduleSave();

        return data;
    } catch (error) {
        console.error('[FilingService] Fetch failed:', error);
        // Return stale data if available on error
        if (cached) return cached.data;
        throw error;
    }
}
