import { isNumericSymbol } from "../symbol/cleanSymbol";
import type { MarketCompany } from "../domain/types";

type WatchlistGroup = {
  label: string;
  companies: MarketCompany[];
};

export function formatTVWatchlist(groupedData: WatchlistGroup[] = []): string {
  const text: string[] = [];

  groupedData.forEach(({ label, companies }) => {
    // 1. Filter Valid Symbols (and exclude purely numerical BSE symbols)
    const valid = companies.filter((company) => company.symbol && !isNumericSymbol(company.symbol));

    if (valid.length > 0) {
      // 2. Add Section Header with Count
      const cleanLabel = label.replace(" COMPANIES", "").toUpperCase();
      text.push(`###${cleanLabel}(${valid.length})`);

      // 3. Add Symbols dynamically with appropriate exchange
      valid.forEach((company) => {
        const exch = company.exch === "BSE" || isNumericSymbol(company.symbol) ? "BSE" : "NSE";
        text.push(`${exch}:${company.symbol}`);
      });
    }
  });

  return text.join(",");
}
