import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
import { promisify } from 'node:util';

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

function pickEncoding(acceptEncoding) {
    const header = String(acceptEncoding || '').toLowerCase();
    if (header.includes('br')) return 'br';
    if (header.includes('gzip')) return 'gzip';
    return null;
}

export async function sendCompressedText(req, res, text, status = 200) {
    const payload = Buffer.isBuffer(text) ? text : Buffer.from(String(text ?? ''), 'utf-8');
    const acceptEncoding = req.headers?.['accept-encoding'];
    const encoding = pickEncoding(acceptEncoding);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Vary', 'Accept-Encoding');

    if (!encoding || payload.byteLength < 1024) {
        return res.status(status).send(payload);
    }

    try {
        let compressed;
        if (encoding === 'br') {
            compressed = await brotliCompressAsync(payload, {
                params: {
                    [zlibConstants.BROTLI_PARAM_QUALITY]: 6,
                    [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
                },
            });
        } else {
            compressed = await gzipAsync(payload, { level: 6 });
        }

        if (!compressed || compressed.byteLength >= payload.byteLength) {
            return res.status(status).send(payload);
        }

        res.setHeader('Content-Encoding', encoding);
        return res.status(status).send(compressed);
    } catch {
        return res.status(status).send(payload);
    }
}
