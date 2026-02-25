/**
 * ISIN Resolution Service
 * Maps NSE/BSE symbols to ISINs for external API integrations (Dhan, ScanX, etc.)
 */

import { ISIN_MAP } from './isin_data';
import { cleanSymbol } from '../../packages/core/src/symbol/cleanSymbol';

// Basic mapping for major stocks (Example set)
const STATIC_MAPPING = {
    'RELIANCE': 'INE002A01018',
    'HDFCBANK': 'INE040A01034',
    'ICICIBANK': 'INE090A01021',
    'INFY': 'INE009A01021',
    'TCS': 'INE467B01029',
    'TATAMOTORS': 'INE155A01022',
    'SBIN': 'INE062A01020',
    'ITC': 'INE154A01025'
};

// Merge for maximum coverage
const FULL_MAPPING = { ...ISIN_MAP, ...STATIC_MAPPING };

/**
 * Resolves a symbol to an ISIN.
 * In a real app, this would query a master database or fetch from an API.
 */
export function getIsin(symbol) {
    if (!symbol) return null;
    return FULL_MAPPING[cleanSymbol(symbol)] || null;
}
