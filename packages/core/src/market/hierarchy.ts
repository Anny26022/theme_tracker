import type { MarketCompany, MarketHierarchy } from "../domain/types";

export function buildHierarchyFromRawData(rawData: MarketCompany[] = []): MarketHierarchy {
  if (!Array.isArray(rawData)) return {};

  const tree: MarketHierarchy = {};
  const industryToSector: Record<string, string> = {};

  for (const item of rawData) {
    if (!item?.industry) continue;
    let fallback = item.sector;
    if ((!fallback || fallback === "N/A") && Array.isArray(item.levels) && item.levels.length > 0) {
      fallback = item.levels[0];
    }

    if (fallback && fallback !== "N/A") {
      industryToSector[item.industry] = fallback as string;
    }
  }

  for (const item of rawData) {
    if (!item?.industry) continue;

    let sector = industryToSector[item.industry] || item.sector;
    if ((!sector || sector === "N/A") && Array.isArray(item.levels) && item.levels.length > 0) {
      sector = item.levels[0];
    }
    if (!sector) sector = "N/A";

    if (!tree[sector as string]) tree[sector as string] = {};
    if (!tree[sector as string][item.industry]) tree[sector as string][item.industry] = [];

    tree[sector as string][item.industry].push({
      ...item,
      sector: sector as string,
    });
  }

  return tree;
}

export function getSortedSectors(hierarchy: MarketHierarchy): string[] {
  return Object.keys(hierarchy || {}).sort();
}

