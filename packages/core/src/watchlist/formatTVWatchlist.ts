import { isNumericSymbol } from "../symbol/cleanSymbol";
import type { MarketCompany } from "../domain/types";

type WatchlistGroup = {
  label: string;
  companies: MarketCompany[];
};

export function formatTVWatchlist(groupedData: WatchlistGroup[] = []): string {
  const text: string[] = [];

  groupedData.forEach(({ label, companies }) => {
    const nseOnly = companies.filter((company) => company.exch !== "BSE" && !isNumericSymbol(company.symbol));

    if (nseOnly.length > 0) {
      text.push(`###${label}(${nseOnly.length})`);
      nseOnly.forEach((company) => {
        text.push(`NSE:${company.symbol}`);
      });
    }
  });

  return text.join(",");
}

