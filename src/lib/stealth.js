/**
 * Runtime string decoder + AES-256-GCM payload encryption.
 * 
 * All sensitive strings are XOR-encoded hex.
 * All request payloads are AES-GCM encrypted with a random IV per request.
 * 
 * Network tab shows: completely random hex garbage.
 * Same request twice = completely different ciphertext.
 * Cannot be decoded without the key.
 */

const _K = 0x5A;

function _d(hex) {
    const r = [];
    for (let i = 0; i < hex.length; i += 2) {
        r.push(String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ _K));
    }
    return r.join('');
}

// ═══════════════════════════════════════════════════════════════
//  ENCODED CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const EP_GOOGLE = _d('753b2a33753c2f393123352f2f2f2f');
export const EP_STRIKE = _d('753b2a33753c393123352f2f2f6b');
export const EP_SCANX = _d('753b2a337529393b3422');

export const RPC_PRICE = _d('2232622d223c');
export const RPC_CHART = _d('1b33192d293e');
export const RPC_FUNDA = _d('122b1d2a0d3e');

export const HDR_ENTROPY = _d('02771b2a2a771f342e28352a23');
export const HDR_CTYPE = _d('1935342e3f342e770e232a3f');

export const CT_URLENC = _d('3b2a2a3633393b2e3335347522772d2d2d773c352827772f28363f3439353e3f3e6139323b28293f2e672f2e3c7762');
export const CT_PLAIN = _d('2e3f222e752a363b3334');

// ═══════════════════════════════════════════════════════════════
//  AES-256-GCM ENCRYPTION (Browser-native Web Crypto API)
//  
//  - 256-bit key (embedded, obfuscated in production bundle)
//  - 12-byte random IV per request (prepended to ciphertext)
//  - 16-byte auth tag (appended by GCM)
//  - Output: hex string of [IV + ciphertext + tag]
//  
//  Same payload encrypted twice = completely different output.
//  Cannot be decoded without the key. Period.
// ═══════════════════════════════════════════════════════════════

// Key material — split across fragments to resist static extraction
const _f1 = [0x4a, 0x9c, 0x2e, 0xf1, 0x83, 0xd7, 0x56, 0xbb];
const _f2 = [0x12, 0x7e, 0xa4, 0x38, 0xc5, 0x69, 0xf0, 0x1d];
const _f3 = [0xe8, 0x31, 0x5b, 0x97, 0x04, 0xac, 0x72, 0xdf];
const _f4 = [0x63, 0xb8, 0x1f, 0x45, 0xea, 0x06, 0x8d, 0xc4];
const _RAW = new Uint8Array([..._f1, ..._f2, ..._f3, ..._f4]);

let _cachedKey = null;

async function _getKey() {
    if (_cachedKey) return _cachedKey;
    _cachedKey = await crypto.subtle.importKey(
        'raw', _RAW, { name: 'AES-GCM' }, false, ['encrypt']
    );
    return _cachedKey;
}

/**
 * Encrypt a string payload using AES-256-GCM.
 * Returns a hex string: [12-byte IV] + [ciphertext] + [16-byte auth tag]
 * 
 * Each call produces completely different output even for identical input.
 */
export async function seal(plaintext) {
    const key = await _getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );

    // Prepend IV to ciphertext
    const cipher = new Uint8Array(cipherBuffer);
    const combined = new Uint8Array(iv.length + cipher.length);
    combined.set(iv);
    combined.set(cipher, iv.length);

    // Convert to hex
    return Array.from(combined).map(b => b.toString(16).padStart(2, '0')).join('');
}
