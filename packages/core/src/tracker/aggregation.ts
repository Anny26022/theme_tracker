import type { MarketCompany, MarketHierarchy, TrackerRawRow } from "../domain/types";
import { cleanSymbol, isNumericSymbol } from "../symbol/cleanSymbol";

type TrackerType = "sector" | "industry";

type TrackerSummary = {
  avgPerf: number;
  breadth: {
    above10EMA: number;
    above21EMA: number;
    above50EMA: number;
    above150EMA: number;
    above200EMA: number;
    validCount: number;
    total: number;
  };
  leaders: Array<{
    name?: string;
    symbol?: string;
    perf: number;
    breadth: TrackerRawRow["breadth"];
  }>;
  laggards: Array<{
    name?: string;
    symbol?: string;
    perf: number;
    breadth: TrackerRawRow["breadth"];
  }>;
};

export function buildItemToCompanies(
  items: string[] = [],
  hierarchy: MarketHierarchy = {},
  type: TrackerType = "sector",
): Map<string, MarketCompany[]> {
  const itemToSymbols = new Map<string, MarketCompany[]>();
  if (!items.length) return itemToSymbols;

  for (const name of items) {
    const companies: MarketCompany[] = [];

    if (type === "sector") {
      const sectorData = hierarchy[name];
      if (sectorData) {
        Object.values(sectorData).forEach((row) => row.forEach((c) => companies.push(c)));
      }
    } else {
      for (const sectorName of Object.keys(hierarchy)) {
        if (hierarchy[sectorName]?.[name]) {
          hierarchy[sectorName][name].forEach((c) => companies.push(c));
          break;
        }
      }
    }

    itemToSymbols.set(name, companies);
  }

  return itemToSymbols;
}

export function collectUniqueSymbols(itemToCompanies: Map<string, MarketCompany[]>): string[] {
  const allSymbols = new Set<string>();
  itemToCompanies.forEach((companies) => {
    companies.forEach((company) => {
      if (company.symbol) allSymbols.add(company.symbol);
    });
  });
  return [...allSymbols];
}

export function computeTrackerUpdates(
  items: string[],
  itemToCompanies: Map<string, MarketCompany[]>,
  rawResults: Map<string, TrackerRawRow>,
): Record<string, TrackerSummary | null> {
  const updates: Record<string, TrackerSummary | null> = {};

  for (const name of items) {
    const companies = itemToCompanies.get(name) || [];
    let totalPerf = 0;
    let above10 = 0;
    let above21 = 0;
    let above50 = 0;
    let above150 = 0;
    let above200 = 0;
    let validCount = 0;
    const pool: TrackerSummary["leaders"] = [];

    companies.forEach((company) => {
      const key = cleanSymbol(company.symbol);
      const data = rawResults.get(key);
      const changePct = data?.perf?.changePct;

      if (typeof changePct !== "number") return;

      totalPerf += changePct;
      if (data?.breadth?.above10EMA) above10++;
      if (data?.breadth?.above21EMA) above21++;
      if (data?.breadth?.above50EMA) above50++;
      if (data?.breadth?.above150EMA) above150++;
      if (data?.breadth?.above200EMA) above200++;
      validCount++;

      if (!isNumericSymbol(company.symbol)) {
        pool.push({
          name: company.name,
          symbol: company.symbol,
          perf: changePct,
          breadth: data?.breadth || {},
        });
      }
    });

    if (validCount <= 0) {
      updates[name] = null;
      continue;
    }

    const sortedPool = [...pool].sort((a, b) => b.perf - a.perf);
    const leaders = sortedPool.slice(0, 6);
    const leaderSymbols = new Set(leaders.map((row) => row.symbol));
    const remainingForLaggards = sortedPool.filter((row) => !leaderSymbols.has(row.symbol));
    const laggards = remainingForLaggards.slice(-6).reverse();

    updates[name] = {
      avgPerf: totalPerf / validCount,
      breadth: {
        above10EMA: (above10 / validCount) * 100,
        above21EMA: (above21 / validCount) * 100,
        above50EMA: (above50 / validCount) * 100,
        above150EMA: (above150 / validCount) * 100,
        above200EMA: (above200 / validCount) * 100,
        validCount,
        total: companies.length,
      },
      leaders,
      laggards,
    };
  }

  return updates;
}

