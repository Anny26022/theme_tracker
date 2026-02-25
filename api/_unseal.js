import { createDecipheriv } from 'crypto';

// AES-256-GCM key (must match client stealth.js)
const _k = Buffer.from([
    0x4a, 0x9c, 0x2e, 0xf1, 0x83, 0xd7, 0x56, 0xbb,
    0x12, 0x7e, 0xa4, 0x38, 0xc5, 0x69, 0xf0, 0x1d,
    0xe8, 0x31, 0x5b, 0x97, 0x04, 0xac, 0x72, 0xdf,
    0x63, 0xb8, 0x1f, 0x45, 0xea, 0x06, 0x8d, 0xc4
]);

/**
 * Decrypt an AES-256-GCM encrypted hex string.
 * Format: [12-byte IV] + [ciphertext] + [16-byte auth tag]
 */
export function unseal(hexStr) {
    const raw = Buffer.from(hexStr, 'hex');
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(raw.length - 16);
    const ciphertext = raw.subarray(12, raw.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', _k, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
}
