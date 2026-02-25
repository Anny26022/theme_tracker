/**
 * ███████╗████████╗███████╗ █████╗ ██╗  ████████╗██╗  ██╗
 * ██╔════╝╚══██╔══╝██╔════╝██╔══██╗██║  ╚══██╔══╝██║  ██║
 * ███████╗   ██║   █████╗  ███████║██║     ██║   ███████║
 * ╚════██║   ██║   ██╔══╝  ██╔══██║██║     ██║   ██╔══██║
 * ███████║   ██║   ███████╗██║  ██║███████╗██║   ██║  ██║
 * ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═╝
 * 
 * Runtime string decoder. All sensitive strings (endpoints, RPC IDs, headers)
 * are stored as XOR-encoded hex. Decoded only at runtime in memory.
 * 
 * This prevents:
 *   - grep/search for API endpoints in source
 *   - Static analysis of the production bundle
 *   - String extraction tools from finding targets
 */

const _K = 0x5A; // XOR key

/** Decode hex → string (runtime) */
function _d(hex) {
    const r = [];
    for (let i = 0; i < hex.length; i += 2) {
        r.push(String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ _K));
    }
    return r.join('');
}

// ═══════════════════════════════════════════════════════════════
//  PRE-ENCODED SENSITIVE STRINGS
// ═══════════════════════════════════════════════════════════════

// Endpoints
export const EP_GOOGLE = _d('753b2a33752c6b753c2f393123352f2f2f2f');
export const EP_STRIKE = _d('753b2a33752c6b753c393123352f2f2f6b');
export const EP_SCANX = _d('753b2a33752c6b753c393123352f2f2f68');

// Google RPC IDs
export const RPC_PRICE = _d('2232622d223c');
export const RPC_CHART = _d('1b33192d293e');
export const RPC_FUNDA = _d('122b1d2a0d3e');

// Headers
export const HDR_ENTROPY = _d('02771b2a2a771f342e28352a23');
export const HDR_CTYPE = _d('1935342e3f342e770e232a3f');

// Content Types
export const CT_URLENC = _d('3b2a2a3633393b2e3335347522772d2d2d773c352827772f28363f3439353e3f3e6139323b28293f2e672f2e3c7762');
export const CT_PLAIN = _d('2e3f222e752a363b3334');
