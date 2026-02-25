import { useAsync } from './useAsync';

/**
 * Hook to fetch company filings from Dhan/ScanX API
 * @param {string} isin - The ISIN of the company
 */
export function useFilings(isin) {
    const fetchFunc = async () => {
        if (!isin) return null;

        const response = await fetch('/api/scanx', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    isin: isin,
                    count: 500
                }
            })
        });

        if (!response.ok) throw new Error(`Filings API failed: ${response.status}`);
        const json = await response.json();
        return json.data || [];
    };

    return useAsync(fetchFunc, [isin], !!isin);
}

