export function buildWorkerApiUrl(path) {
    const normalizedPath = String(path || '');
    if (!normalizedPath.startsWith('/api/')) {
        throw new Error(`Worker API path must start with /api/: ${normalizedPath}`);
    }

    if (import.meta.env.DEV) {
        return normalizedPath.replace(/^\/api/, '/api/worker');
    }

    return normalizedPath;
}
