import { cleanSymbol } from '../services/priceService';

function isNumericSymbol(symbol?: string | null): boolean {
    return /^\d+$/.test(cleanSymbol(symbol));
}

export function formatTVWatchlist(groupedData: any[] = []): string {
    const text: string[] = [];

    groupedData.forEach(({ label, companies }) => {
        // Basic filtering: Only non-numeric symbols (NSE style)
        const nseOnly = companies.filter((company: any) =>
            company.exch !== "BSE" && !isNumericSymbol(company.symbol)
        );

        if (nseOnly.length > 0) {
            text.push(`###${label}(${nseOnly.length})`);
            nseOnly.forEach((company: any) => {
                text.push(`NSE:${company.symbol}`);
            });
        }
    });

    return text.join(",");
}
