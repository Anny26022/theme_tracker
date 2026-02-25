import { fetchCompanyFilings } from '../services/filingService';
import { useAsync } from './useAsync';

/**
 * Hook to fetch company filings from Dhan/ScanX API
 * @param isin - The ISIN of the company
 */
export function useFilings(isin: string | null | undefined) {
    const fetchFunc = () => fetchCompanyFilings(isin!);
    return useAsync(fetchFunc, [isin], !!isin);
}
