import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
    optimizeDeps: {
        entries: ['index.html'],
    },
    server: {
        proxy: {
            // Google Finance batchexecute proxy (bypasses CORS)
            '/api/google-finance': {
                target: 'https://www.google.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/google-finance/, ''),
                headers: {
                    'Origin': 'https://www.google.com',
                    'Referer': 'https://www.google.com/finance/',
                },
            },
            // Strike Money API proxy
            '/api/strike': {
                target: 'https://api-v2.strike.money',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/strike/, ''),
            },
        },
    },
})
