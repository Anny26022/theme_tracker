export function cleanSymbol(symbol?: string | null): string {
  if (!symbol) return "";

  return symbol
    .trim()
    .toUpperCase()
    // Remove common exchange prefixes/suffixes
    .replace(/^(NSE|BSE|BOM|GOOGLE):/i, "")
    .replace(/:(NSE|BOM|BSE)$/i, "")
    .replace(/\.(NS|BO)$/i, "")
    .replace(/-EQ$/i, "")
    // Final safety — strip any non-identifier characters but keep common ones
    .split(':')[0]; // Handle cases where extra junk is appended after a colon
}

export function isNumericSymbol(symbol?: string | null): boolean {
  return /^\d+$/.test(cleanSymbol(symbol));
}

