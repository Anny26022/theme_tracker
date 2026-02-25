/**
 * Filing Service for Android — fetches company filings via the mobile proxy.
 * No AES encryption — plain JSON through the proxy.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PROXY_BASE =
    process.env.EXPO_PUBLIC_PROXY_BASE_URL ||
    (__DEV__ ? 'http://192.168.29.39:5173' : 'https://your-vercel-domain.vercel.app');

const SCANX_PROXY_URL = `${PROXY_BASE}/api/mobile-scanx`;

const FILINGS_CACHE_KEY = 'tt_filings_cache:v1';
const FILINGS_CACHE_TTL = 3600_000 * 4; // 4 hours

// ─── In-memory cache ─────────────────────────────────────────────
let filingsCache: Map<string, { data: any[]; timestamp: number }> = new Map();
let cacheLoaded = false;

async function loadCache() {
    if (cacheLoaded) return;
    try {
        const raw = await AsyncStorage.getItem(FILINGS_CACHE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                filingsCache = new Map(parsed);
            }
        }
    } catch (e) {
        console.warn('[FilingService] Cache hydration failed', e);
    }
    cacheLoaded = true;
}

async function saveCache() {
    try {
        // Keep max 30 entries to stay within AsyncStorage limits
        const entries = [...filingsCache.entries()]
            .sort((a, b) => b[1].timestamp - a[1].timestamp)
            .slice(0, 30);
        filingsCache = new Map(entries);
        await AsyncStorage.setItem(FILINGS_CACHE_KEY, JSON.stringify(entries));
    } catch (e) {
        // Storage full — ignore
    }
}

// ─── Public API ──────────────────────────────────────────────────

export async function fetchCompanyFilings(isin: string): Promise<any[]> {
    if (!isin) return [];

    await loadCache();

    // Check cache
    const cached = filingsCache.get(isin);
    if (cached && Date.now() - cached.timestamp < FILINGS_CACHE_TTL) {
        return cached.data;
    }

    try {
        const response = await fetch(SCANX_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: { isin, count: 500 } }),
        });

        if (!response.ok) throw new Error(`Filings API failed: ${response.status}`);

        const json = await response.json();
        const data = json.data || [];

        // Save to cache
        filingsCache.set(isin, { data, timestamp: Date.now() });
        saveCache(); // fire-and-forget

        return data;
    } catch (error: any) {
        console.error('[FilingService] Fetch failed:', error.message);
        // Return stale data if available
        if (cached) return cached.data;
        throw error;
    }
}
