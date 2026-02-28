export type MarketCompany = {
  name?: string;
  symbol?: string;
  sector?: string;
  industry?: string;
  exch?: string;
  levels?: string[];
  [key: string]: unknown;
};

export type IndustryMap = Record<string, MarketCompany[]>;
export type MarketHierarchy = Record<string, IndustryMap>;

export type TrackerBreadth = {
  above10EMA?: boolean | number;
  above21EMA?: boolean | number;
  above50EMA?: boolean | number;
  above150EMA?: boolean | number;
  above200EMA?: boolean | number;
  validCount?: number;
  total?: number;
};

export type TrackerPerf = {
  changePct: number | null;
  close?: number | null;
};

export type TrackerRawRow = {
  perf: TrackerPerf;
  breadth: TrackerBreadth;
};

