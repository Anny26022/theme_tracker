import { fetchFundamentals, cleanSymbol } from '../services/priceService';
import { useAsync } from './useAsync';

/**
 * Hook to fetch fundamental data (Market Cap, P/E, etc.) for a symbol.
 */
export function useFundamentals(symbol: string | null | undefined) {
    const fetchFunc = async () => {
        if (!symbol) return null;
        const results = await fetchFundamentals([symbol]);
        const clean = cleanSymbol(symbol);
        return results.get(clean) || null;
    };

    return useAsync(fetchFunc, [symbol], !!symbol);
}
