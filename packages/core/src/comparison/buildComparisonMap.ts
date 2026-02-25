export async function buildComparisonMap(
  symbols: string[],
  interval: string,
  fetchComparisonCharts: (symbols: string[], interval: string) => Promise<Map<string, any>>,
) {
  if (!symbols || symbols.length === 0) return new Map();

  const charts = await fetchComparisonCharts(symbols, interval);
  const finalResults = new Map();

  symbols.forEach((symbol) => {
    if (charts.has(symbol)) finalResults.set(symbol, charts.get(symbol));
  });

  return finalResults;
}

