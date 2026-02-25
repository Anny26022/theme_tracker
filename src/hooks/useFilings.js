import { fetchCompanyFilings } from '../services/filingService';
import { useAsync } from './useAsync';

/**
 * Hook to fetch company filings from Dhan/ScanX API
 * @param {string} isin - The ISIN of the company
 */
export function useFilings(isin) {
    const fetchFunc = () => fetchCompanyFilings(isin);
    return useAsync(fetchFunc, [isin], !!isin);
}

