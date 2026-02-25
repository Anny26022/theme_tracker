const DEV_PROXY_BASE_URL = 'http://192.168.29.39:5173';

function normalizeBaseUrl(url: string) {
    const trimmed = url.trim();
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function resolveProxyBaseUrl() {
    const configured = process.env.EXPO_PUBLIC_PROXY_BASE_URL;
    if (configured && configured.trim()) {
        return normalizeBaseUrl(configured);
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
        return DEV_PROXY_BASE_URL;
    }

    return null;
}

export const MOBILE_PROXY_BASE_URL = resolveProxyBaseUrl();

export function getMobileProxyUrl(path: string) {
    if (!MOBILE_PROXY_BASE_URL) return null;
    return `${MOBILE_PROXY_BASE_URL}${path}`;
}
