/**
 * ISIN Resolution Service for Android
 * Maps NSE/BSE symbols to ISINs for Dhan/ScanX API integrations.
 */

import { ISIN_MAP } from '../../../src/services/isin_data';
import { cleanSymbol } from '@core/symbol/cleanSymbol';

const STATIC_MAPPING: Record<string, string> = {
    'RELIANCE': 'INE002A01018',
    'HDFCBANK': 'INE040A01034',
    'ICICIBANK': 'INE090A01021',
    'INFY': 'INE009A01021',
    'TCS': 'INE467B01029',
    'TATAMOTORS': 'INE155A01022',
    'SBIN': 'INE062A01020',
    'ITC': 'INE154A01025',
};

// Merge for maximum coverage
const FULL_MAPPING: Record<string, string> = { ...(ISIN_MAP as Record<string, string>), ...STATIC_MAPPING };

/**
 * Resolves a symbol to an ISIN.
 */
export function getIsin(symbol: string | null | undefined): string | null {
    if (!symbol) return null;
    return FULL_MAPPING[cleanSymbol(symbol)] || null;
}
