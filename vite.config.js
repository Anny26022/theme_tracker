import { defineConfig } from 'vite'
import obfuscatorPlugin from 'rollup-plugin-obfuscator'

// https://vitejs.dev/config/
export default defineConfig({
    optimizeDeps: {
        entries: ['index.html'],
    },
    build: {
        rollupOptions: {
            plugins: [
                obfuscatorPlugin({
                    options: {
                        compact: true,
                        controlFlowFlattening: true,
                        controlFlowFlatteningThreshold: 0.5,
                        deadCodeInjection: true,
                        deadCodeInjectionThreshold: 0.2,
                        identifierNamesGenerator: 'hexadecimal',
                        renameGlobals: false,
                        selfDefending: false,
                        stringArray: true,
                        stringArrayEncoding: ['rc4'],
                        stringArrayThreshold: 0.8,
                        transformObjectKeys: true,
                        unicodeEscapeSequence: false,
                    },
                }),
            ],
        },
    },
    // Nuclear Stealth Middleware: Decodes Base64 bodies before they hit the proxy
    plugins: [
        {
            name: 'nuclear-stealth-middleware',
            configureServer(server) {
                // AES-256-GCM decryption key (must match client stealth.js)
                const _k = Buffer.from([
                    0x4a, 0x9c, 0x2e, 0xf1, 0x83, 0xd7, 0x56, 0xbb,
                    0x12, 0x7e, 0xa4, 0x38, 0xc5, 0x69, 0xf0, 0x1d,
                    0xe8, 0x31, 0x5b, 0x97, 0x04, 0xac, 0x72, 0xdf,
                    0x63, 0xb8, 0x1f, 0x45, 0xea, 0x06, 0x8d, 0xc4
                ]);

                function unseal(hexStr) {
                    const { createDecipheriv } = require('crypto');
                    const raw = Buffer.from(hexStr, 'hex');
                    const iv = raw.subarray(0, 12);
                    const authTag = raw.subarray(raw.length - 16);
                    const ciphertext = raw.subarray(12, raw.length - 16);
                    const decipher = createDecipheriv('aes-256-gcm', _k, iv);
                    decipher.setAuthTag(authTag);
                    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
                }

                server.middlewares.use(async (req, res, next) => {
                    const isApi = req.url.startsWith('/api/');
                    if (isApi && req.method === 'POST') {
                        // If body is already parsed by another middleware, skip
                        if (req.body) return next();

                        const chunks = [];
                        try {
                            for await (const chunk of req) chunks.push(chunk);
                            const body = Buffer.concat(chunks).toString('utf-8');

                            // Attach raw body for stealth/manual proxies
                            req.rawBody = body;

                            // Try to parse as JSON for mobile-friendly proxies
                            try {
                                req.body = JSON.parse(body);
                            } catch (e) {
                                req.body = body; // Fallback to raw string
                            }

                            const nuclearPaths = ['/api/v1/fuckyouuuu', '/api/v1/fckyouuu1', '/api/v1/fckyouuu2'];
                            if (nuclearPaths.some(p => req.url.startsWith(p))) {
                                try {
                                    req.rawBody = unseal(body);
                                    req.isNuclear = true;
                                } catch (e) {
                                    console.error('[Stealth Middleware] Decrypt Failed:', e.message);
                                }
                            }
                        } catch (e) {
                            console.error('[Body Parsing Middleware] Failed:', e.message);
                        }
                    }
                    next();
                });
            }
        }
    ],
    server: {
        host: true,
        proxy: {
            '/api/v1/fuckyouuuu': {
                target: 'https://www.google.com',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        if (req.isNuclear && req.rawBody) {
                            const cid = req.headers['x-app-entropy'] || 'AiCwsd';
                            const googlePath = `/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${cid}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
                            const newBody = new URLSearchParams({ 'f.req': req.rawBody }).toString();

                            proxyReq.setHeader('Content-Type', 'application/x-www-form-urlencoded;charset=utf-8');
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(newBody));
                            proxyReq.path = googlePath;
                            proxyReq.write(newBody);
                        }
                        // Always end to prevent hangs if middleware consumed the body
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            },
            '/api/v1/fckyouuu1': {
                target: 'https://api-v2.strike.money',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        if (req.isNuclear && req.rawBody) {
                            try {
                                const decoded = JSON.parse(req.rawBody);
                                const strikePath = `${decoded.path}?candleInterval=1d&from=${decoded.fromStr}&to=${decoded.toStr}&securities=${decoded.encoded}`;

                                // Scrub all identity headers
                                proxyReq.removeHeader('origin');
                                proxyReq.removeHeader('referer');
                                proxyReq.removeHeader('content-type');
                                proxyReq.removeHeader('content-length');

                                // Spoof Strike identity
                                proxyReq.setHeader('Host', 'api-v2.strike.money');
                                proxyReq.setHeader('Origin', 'https://api-v2.strike.money');
                                proxyReq.setHeader('Referer', 'https://api-v2.strike.money/');
                                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                                proxyReq.method = 'GET';
                                proxyReq.path = strikePath;
                            } catch (e) {
                                console.error('[Strike Proxy] Parse Error:', e.message);
                            }
                        }
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            },
            '/api/v1/fckyouuu2': {
                target: 'https://ow-static-scanx.dhan.co',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        // Point to the correct endpoint path on Dhan
                        proxyReq.path = '/staticscanx/company_filings';

                        if (req.isNuclear && req.rawBody) {
                            proxyReq.setHeader('Origin', 'https://ow-static-scanx.dhan.co');
                            proxyReq.setHeader('Referer', 'https://ow-static-scanx.dhan.co/');
                            proxyReq.setHeader('Content-Type', 'application/json');
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody));
                            proxyReq.write(req.rawBody);
                        }
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            },
            // ─── Mobile App Proxy (plain, no AES encryption) ──────────
            '/api/mobile-batch': {
                target: 'https://www.google.com',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        const rpcIds = req.headers['x-rpc-ids'] || 'xh8wxf';
                        const googlePath = `/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${rpcIds}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;

                        proxyReq.setHeader('Content-Type', 'application/x-www-form-urlencoded;charset=utf-8');
                        proxyReq.setHeader('Origin', 'https://www.google.com');
                        proxyReq.setHeader('Referer', 'https://www.google.com/finance/');
                        proxyReq.path = googlePath;

                        // Re-inject the body consumed by middleware
                        if (req.rawBody) {
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody));
                            proxyReq.write(req.rawBody);
                        }
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            },
            '/api/mobile-strike': {
                target: 'https://api-v2.strike.money',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        try {
                            const payload = req.body;
                            if (payload && typeof payload === 'object') {
                                const { fromStr, toStr, encoded, path } = payload;
                                const strikePath = `${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;

                                proxyReq.method = 'GET';
                                proxyReq.path = strikePath;

                                // Scrub headers and body for GET
                                proxyReq.setHeader('Accept', 'application/json');
                                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                                proxyReq.removeHeader('content-type');
                                proxyReq.removeHeader('content-length');
                            }
                        } catch (e) {
                            console.error('[mobile-strike] Proxy Transformation Error:', e.message);
                        }
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            },
            '/api/mobile-scanx': {
                target: 'https://ow-static-scanx.dhan.co',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        // Point to the correct endpoint path on Dhan
                        proxyReq.path = '/staticscanx/company_filings';
                        proxyReq.setHeader('Origin', 'https://ow-static-scanx.dhan.co');
                        proxyReq.setHeader('Referer', 'https://ow-static-scanx.dhan.co/');
                        proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                        if (req.rawBody) {
                            proxyReq.setHeader('Content-Type', 'application/json');
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody));
                            proxyReq.write(req.rawBody);
                        }
                        if (!proxyReq.writableEnded) proxyReq.end();
                    });
                }
            },
            '/api/tv': {
                target: 'https://www.tradingview.com/api/v1',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/tv/, ''),
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq, req) => {
                        const sessionId = req.headers['x-tv-sessionid'];
                        const sessionSign = req.headers['x-tv-sessionid-sign'];

                        let cookie = '';
                        if (sessionId) cookie += `sessionid=${sessionId}; `;
                        if (sessionSign) cookie += `sessionid_sign=${sessionSign}; `;

                        if (cookie) proxyReq.setHeader('Cookie', cookie.trim());

                        proxyReq.setHeader('Origin', 'https://www.tradingview.com');
                        proxyReq.setHeader('Referer', 'https://www.tradingview.com/');
                        proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');

                        // Handle body for POST/PATCH/DELETE
                        if (req.rawBody && (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE')) {
                            proxyReq.setHeader('Content-Type', 'application/json');
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody));
                            proxyReq.write(req.rawBody);
                        }

                        // Don't call .end() for GET requests, let it stream naturally
                        if (req.method !== 'GET' && !proxyReq.writableEnded) proxyReq.end();
                    });
                }
            }
        }
    }
});
