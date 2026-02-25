import type { MarketCompany, MarketHierarchy } from "../domain/types";

export function buildHierarchyFromRawData(rawData: MarketCompany[] = []): MarketHierarchy {
  if (!Array.isArray(rawData)) return {};

  const tree: MarketHierarchy = {};
  const industryToSector: Record<string, string> = {};

  for (const item of rawData) {
    if (!item?.industry) continue;
    if (item.sector && item.sector !== "N/A") {
      industryToSector[item.industry] = item.sector;
    }
  }

  for (const item of rawData) {
    if (!item?.industry) continue;

    const sector = industryToSector[item.industry] || item.sector || "N/A";
    if (!tree[sector]) tree[sector] = {};
    if (!tree[sector][item.industry]) tree[sector][item.industry] = [];

    tree[sector][item.industry].push({
      ...item,
      sector,
    });
  }

  return tree;
}

export function getSortedSectors(hierarchy: MarketHierarchy): string[] {
  return Object.keys(hierarchy || {}).sort();
}

