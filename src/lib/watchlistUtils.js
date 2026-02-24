/**
 * Utility to format company lists into TradingView watchlist format.
 * Strictly excludes BSE-only symbols and numeric codes.
 */
export const formatTVWatchlist = (groupedData) => {
    let text = [];

    // groupedData should be an array of { label: string, companies: Array }
    groupedData.forEach(({ label, companies }) => {
        const nseOnly = companies.filter(c =>
            c.exch !== 'BSE' &&
            !/^\d+$/.test(c.symbol)
        );

        if (nseOnly.length > 0) {
            text.push(`###${label}(${nseOnly.length})`);
            nseOnly.forEach(c => {
                text.push(`NSE:${c.symbol}`);
            });
        }
    });

    return text.join(',');
};
