export function cleanSymbol(symbol?: string | null): string {
  if (!symbol) return "";

  return symbol
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "")
    .replace(/:(NSE|BOM|BSE)$/i, "")
    .replace(/-EQ$/i, "");
}

export function isNumericSymbol(symbol?: string | null): boolean {
  return /^\d+$/.test(cleanSymbol(symbol));
}

