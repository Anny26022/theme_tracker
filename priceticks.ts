import { isFriday } from 'date-fns';
import { storageService } from '@/services/storageService';
import { fetchYahooSearchQuotes, type YahooSearchQuote } from '@/services/yahooSearchService';
import { PRICE_FETCHING, type PriceFetchProvider } from '@/config/feature-flags';
import {
  encodeSymbolForApi,
  getCurrentISTDate,
  getLastWorkingDay,
  getPreviousTradingDay,
  getTodayMarketClose,
  getTodayMarketOpen,
  isAfterHoursWeekday,
  isIndexSymbol,
  isProblematicNightHours,
  isWeekendIST,
  MARKET_OPEN_HOUR,
  MARKET_OPEN_MIN,
  requiresDailyTimeframe,
  retryWithBackoff,
} from './priceticks-utils';
export { getTodayMarketClose, getTodayMarketOpen, isMarketOpen } from './priceticks-utils';

export interface PriceTick {
  dateTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dayVolume: number;
}

export interface PriceTicksResponse {
  data: {
    statistic: number;
    count: number;
    fields: string[];
    ticks: {
      [symbol: string]: Array<[string, number, number, number, number, number, number]>;
    };
  };
}

export type PriceFetchMarket = 'india' | 'us';

// Cache for Friday close
let fridayClosePrice: number | null = null;
let lastFridayDate: Date | null = null;

// Allowed headers only (browser fetch forbids many request headers)
const DEFAULT_HEADERS: HeadersInit = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

const buildTimestampForApi = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}%3A${pad(date.getMinutes())}%3A${pad(date.getSeconds())}%2B05%3A30`;
};

export const fetchPriceTicks = async (
  symbol: string,
  fromDate?: Date,
  toDate?: Date,
  interval?: string,
): Promise<PriceTicksResponse> => {
  return retryWithBackoff(async () => {
    const now = getCurrentISTDate();
    const weekend = isWeekendIST();
    const afterHours = isAfterHoursWeekday();

    let from: Date;
    let to: Date;
    let actualInterval: string;

    const forceDaily = requiresDailyTimeframe(symbol);

    if (weekend && !fromDate && !toDate) {
      // Weekend → daily candles over recent history ending last working day
      actualInterval = interval || '1d';
      const lastWorking = getLastWorkingDay();
      to = new Date(lastWorking);
      to.setHours(23, 59, 59, 999);
      from = new Date(lastWorking);
      from.setDate(from.getDate() - 45);
      from.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MIN, 59, 0);
    } else if (afterHours && !fromDate && !toDate) {
      // After-hours before open → previous trading day
      actualInterval = forceDaily ? '1d' : (interval || '1m');
      const prevDay = getPreviousTradingDay();
      from = new Date(prevDay);
      from.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MIN, 59, 0);
      to = new Date(prevDay);
      to.setHours(23, 59, 59, 999);
    } else if (!fromDate && !toDate) {
      actualInterval = forceDaily ? '1d' : (interval || '1m');
      if (forceDaily) {
        // Use recent daily history up to yesterday
        const today = getCurrentISTDate();
        to = new Date(today);
        to.setDate(to.getDate() - 1);
        to.setHours(23, 59, 59, 999);
        from = new Date(to);
        from.setDate(from.getDate() - 30);
        from.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MIN, 59, 0);
      } else {
        from = getTodayMarketOpen();
        to = getCurrentISTDate();
      }
    } else {
      actualInterval = forceDaily ? '1d' : (interval || '1m');
      from = fromDate || getTodayMarketOpen();
      to = toDate || getCurrentISTDate();
    }

    const fromStr = buildTimestampForApi(from);
    const toStr = buildTimestampForApi(to);
    const encodedSymbol = encodeSymbolForApi(symbol);

    const baseUrl = (import.meta as any).env.VITE_PRICE_TICKS_BASE_URL || 'https://api-v2.strike.money';
    const url = `${baseUrl}/v2/api/equity/priceticks?candleInterval=${actualInterval}&from=${fromStr}&to=${toStr}&securities=${encodedSymbol}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: DEFAULT_HEADERS,
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit',
      signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(8000) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as PriceTicksResponse;

    // Validate that we have actual tick data
    const tickKey = symbol.toUpperCase();
    const ticks = data.data?.ticks?.[tickKey] ?? data.data?.ticks?.[symbol];

    if (!ticks || !Array.isArray(ticks) || ticks.length === 0) {
      throw new Error(`No tick data available for ${symbol} - Strike API returned empty ticks`);
    }

    // Cache Friday close after market close
    if (isFriday(now) && now > getTodayMarketClose()) {
      if (Array.isArray(ticks) && ticks.length > 0) {
        const lastTick = ticks[ticks.length - 1];
        const close = lastTick?.[4];
        if (typeof close === 'number') {
          fridayClosePrice = close;
          lastFridayDate = new Date(now);
          if (typeof window !== 'undefined') {
            storageService.setLocalStorage('fridayClosePrice', String(fridayClosePrice));
            storageService.setLocalStorage('lastFridayDate', lastFridayDate.toISOString());
          }
        }
      }
    }

    return data;
  });
};

export const fetchPriceTicksWithFallback = async (
  symbol: string,
  fromDate?: Date,
  toDate?: Date,
  interval?: string,
): Promise<PriceTicksResponse> => {
  const fallbackBases = [...PRICE_FETCHING.strike.fallbackBaseUrls];

  if (fallbackBases.length === 0) {
    throw new Error('No Strike fallback base URLs configured');
  }

  let lastError: unknown;
  for (const baseUrl of fallbackBases) {
    try {
      const now = getCurrentISTDate();
      const weekend = isWeekendIST();
      const afterHours = isAfterHoursWeekday();

      let from: Date;
      let to: Date;
      let actualInterval: string;

      const forceDaily = requiresDailyTimeframe(symbol);

      if (weekend && !fromDate && !toDate) {
        actualInterval = interval || '1d';
        const lastWorking = getLastWorkingDay();
        to = new Date(lastWorking);
        to.setHours(23, 59, 59, 999);
        from = new Date(lastWorking);
        from.setDate(from.getDate() - 45);
        from.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MIN, 59, 0);
      } else if (afterHours && !fromDate && !toDate) {
        actualInterval = forceDaily ? '1d' : (interval || '1m');
        const prevDay = getPreviousTradingDay();
        from = new Date(prevDay);
        from.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MIN, 59, 0);
        to = new Date(prevDay);
        to.setHours(23, 59, 59, 999);
      } else if (!fromDate && !toDate) {
        actualInterval = forceDaily ? '1d' : (interval || '1m');
        if (forceDaily) {
          const today = getCurrentISTDate();
          to = new Date(today);
          to.setDate(to.getDate() - 1);
          to.setHours(23, 59, 59, 999);
          from = new Date(to);
          from.setDate(from.getDate() - 30);
          from.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MIN, 59, 0);
        } else {
          from = getTodayMarketOpen();
          to = getCurrentISTDate();
        }
      } else {
        actualInterval = forceDaily ? '1d' : (interval || '1m');
        from = fromDate || getTodayMarketOpen();
        to = toDate || getCurrentISTDate();
      }

      const fromStr = buildTimestampForApi(from);
      const toStr = buildTimestampForApi(to);
      const encodedSymbol = encodeSymbolForApi(symbol);
      const url = `${baseUrl}/v2/api/equity/priceticks?candleInterval=${actualInterval}&from=${fromStr}&to=${toStr}&securities=${encodedSymbol}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: DEFAULT_HEADERS,
        mode: 'cors',
        cache: 'no-cache',
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined,
      });

      if (response.ok) {
        const data = (await response.json()) as PriceTicksResponse;

        // Validate that we have actual tick data
        const tickKey = symbol.toUpperCase();
        const ticks = data.data?.ticks?.[tickKey] ?? data.data?.ticks?.[symbol];

        if (!ticks || !Array.isArray(ticks) || ticks.length === 0) {
          throw new Error(`No tick data available for ${symbol} - Strike API returned empty ticks`);
        }

        return data;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw (lastError as Error) ?? new Error('All API endpoints failed');
};

export const fetchPriceTicksWithHistoricalFallback = async (
  symbol: string,
): Promise<PriceTicksResponse> => {
  const now = getCurrentISTDate();
  const to = isWeekendIST() ? getLastWorkingDay() : getCurrentISTDate();
  to.setHours(23, 59, 59, 999);

  const from = new Date(to);
  // Reduced from 1 year to 1 week for faster response
  from.setDate(from.getDate() - 7);
  from.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MIN, 59, 0);

  const fromStr = buildTimestampForApi(from);
  const toStr = buildTimestampForApi(to);
  const encodedSymbol = encodeSymbolForApi(symbol);

  const baseUrl = (import.meta as any).env.VITE_PRICE_TICKS_BASE_URL || 'https://api-v2.strike.money';
  // Using 1 week of daily data for faster response (vs 1 year before)
  const url = `${baseUrl}/v2/api/equity/priceticks?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encodedSymbol}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: DEFAULT_HEADERS,
    mode: 'cors',
    cache: 'no-cache',
    credentials: 'omit',
    signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(10000) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Historical fallback failed with status ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as PriceTicksResponse;
  const tickKey = symbol.toUpperCase();
  const ticks = data.data?.ticks?.[tickKey] ?? data.data?.ticks?.[symbol];

  if (!ticks || !Array.isArray(ticks) || ticks.length === 0) {
    throw new Error(`No historical data available for ${symbol} - Strike API returned empty ticks`);
  }

  return data;
};

/**
 * Normalize symbol for Yahoo Finance API
 * @param symbol - Stock symbol
 * @param exchange - Exchange suffix (.NS or .BO)
 * @returns Normalized symbol for Yahoo Finance
 */
const normalizeSymbolForYahoo = (symbol: string, exchange: '.NS' | '.BO' = '.NS'): string => {
  let yahooSymbol = symbol.trim().toUpperCase();

  // Remove any existing exchange suffixes first
  yahooSymbol = yahooSymbol.replace(/\.(NS|BO|NF|BF)$/i, '');

  // Add specified exchange suffix
  yahooSymbol = `${yahooSymbol}${exchange}`;

  return yahooSymbol;
};

/**
 * Normalize symbol for Google Finance quote URLs
 * @param symbol - Stock symbol
 * @returns Normalized symbol for Google Finance
 */
const normalizeSymbolForGoogle = (symbol: string): string => {
  let googleSymbol = symbol.trim().toUpperCase();

  // Common US index aliases
  if (googleSymbol === '^DJI') googleSymbol = '.DJI';
  if (googleSymbol === '^GSPC') googleSymbol = '.INX';
  if (googleSymbol === '^IXIC') googleSymbol = '.IXIC';

  googleSymbol = googleSymbol.replace(/\.(NS|BO|NF|BF)$/i, '');
  googleSymbol = googleSymbol.replace(
    /:(NSE|BSE|BOM|INDEXNSE|INDEXBOM|NASDAQ|NYSE|NYSEARCA|BATS|AMEX|INDEXDJX|INDEXSP|INDEXNASDAQ)$/i,
    '',
  );
  googleSymbol = googleSymbol.replace(/-EQ$/i, '');
  return googleSymbol;
};

const GOOGLE_FINANCE_BATCH_EXECUTE_PATH =
  '/api/google-finance/finance/_/GoogleFinanceUi/data/batchexecute';
const GOOGLE_FINANCE_RPC_ID = 'xh8wxf';
const GOOGLE_US_INDEX_EXCHANGE_BY_SYMBOL: Record<string, string> = {
  '.DJI': 'INDEXDJX',
  '.INX': 'INDEXSP',
  '.IXIC': 'INDEXNASDAQ',
};
const YAHOO_US_ALLOWED_QUOTE_TYPES = new Set(['EQUITY', 'ETF', 'INDEX']);
const YAHOO_US_ALLOWED_EQUITY_ETF_EXCHANGES = new Set([
  'NASDAQ',
  'NYSE',
  'NYSEARCA',
  'BATS',
  'BATS TRADING',
  'NYSE MKT',
  'AMEX',
]);
const US_CMP_DEBUG_METRICS = {
  searchResolved: 0,
  searchMiss: 0,
  yahooSuccess: 0,
  yahooFail: 0,
  googleResolvedSuccess: 0,
  googleResolvedFail: 0,
  googleOriginalSuccess: 0,
  googleOriginalFail: 0,
};
const logUsCmpDebug = (event: string, payload?: Record<string, unknown>): void => {
  if (!(import.meta as any).env?.DEV) return;
  // eslint-disable-next-line no-console
  console.debug('[US CMP]', {
    event,
    ...payload,
    metrics: { ...US_CMP_DEBUG_METRICS },
  });
};
const YAHOO_US_INDEX_ALIASES: Record<string, string[]> = {
  '.DJI': ['^DJI', 'DJI'],
  '.INX': ['^GSPC', 'SP500', 'S&P 500'],
  '.IXIC': ['^IXIC', 'NASDAQ'],
};

const buildGoogleFinanceBatchExecutePayload = (symbol: string, exchange: string): string => {
  const rpcArgs = JSON.stringify([[[null, [symbol, exchange]]], 1]);
  return JSON.stringify([[[GOOGLE_FINANCE_RPC_ID, rpcArgs, null, 'generic']]]);
};

const buildGoogleFinanceBatchExecuteUrl = (symbol: string, exchange: string): string => {
  const query = new URLSearchParams({
    rpcids: GOOGLE_FINANCE_RPC_ID,
    'source-path': `/finance/quote/${symbol}:${exchange}`,
    'f.sid': 'dummy',
    hl: 'en-US',
    'soc-app': '162',
    'soc-platform': '1',
    'soc-device': '1',
    rt: 'c',
  });
  return `${GOOGLE_FINANCE_BATCH_EXECUTE_PATH}?${query.toString()}`;
};

const extractGooglePriceFromBatchExecute = (responseText: string): number | null => {
  const candidateLines = responseText
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith('[[') &&
        line.includes('"wrb.fr"') &&
        line.includes(`"${GOOGLE_FINANCE_RPC_ID}"`),
    );

  for (const line of candidateLines) {
    try {
      const frames = JSON.parse(line) as unknown;
      if (!Array.isArray(frames)) continue;

      for (const frame of frames) {
        if (!Array.isArray(frame)) continue;
        if (frame[0] !== 'wrb.fr' || frame[1] !== GOOGLE_FINANCE_RPC_ID) continue;

        const payloadText = frame[2];
        if (typeof payloadText !== 'string') continue;

        const payload = JSON.parse(payloadText) as unknown;
        if (!Array.isArray(payload)) continue;

        const quote =
          Array.isArray(payload[0]) &&
          Array.isArray(payload[0][0]) &&
          Array.isArray(payload[0][0][0])
            ? payload[0][0][0]
            : null;

        if (!Array.isArray(quote)) continue;

        const quoteTuple = quote[5];
        const price = Array.isArray(quoteTuple) ? quoteTuple[0] : null;
        if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
          return price;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
};

const normalizeUsSearchSymbolKey = (value: string): string => {
  return value.trim().toUpperCase().replace(/[\s./\-_]/g, '');
};

const isUsYahooSearchQuoteAllowed = (quote: YahooSearchQuote): boolean => {
  const quoteType = (quote.quoteType || '').toUpperCase();
  if (!YAHOO_US_ALLOWED_QUOTE_TYPES.has(quoteType)) return false;
  if (quoteType === 'INDEX') return true;
  const exchange = (quote.exchDisp || quote.exchange || '').toUpperCase();
  return YAHOO_US_ALLOWED_EQUITY_ETF_EXCHANGES.has(exchange);
};

const buildUsYahooSearchQueries = (symbol: string): string[] => {
  const raw = symbol.trim().toUpperCase();
  if (!raw) return [];

  const queries = new Set<string>([raw]);
  const normalized = normalizeSymbolForGoogle(raw);

  if (normalized && normalized !== raw) queries.add(normalized);
  if (raw.includes('.')) queries.add(raw.replace(/\./g, '-'));
  if (raw.includes('-')) queries.add(raw.replace(/-/g, '.'));
  if (raw.includes('/')) queries.add(raw.replace(/\//g, '.'));
  if (normalized.includes('.')) queries.add(normalized.replace(/\./g, '-'));
  if (normalized.includes('-')) queries.add(normalized.replace(/-/g, '.'));

  const indexAliases = YAHOO_US_INDEX_ALIASES[normalized];
  if (indexAliases) {
    for (const alias of indexAliases) queries.add(alias);
  }

  return Array.from(queries).filter(Boolean);
};

const fetchUsSymbolFromYahooSearch = async (symbol: string): Promise<string | null> => {
  const queries = buildUsYahooSearchQueries(symbol);
  if (queries.length === 0) return null;

  const rawUpper = symbol.trim().toUpperCase();
  const normalizedRaw = normalizeUsSearchSymbolKey(rawUpper);

  for (const query of queries) {
    try {
      const quotes = await fetchYahooSearchQuotes(query, 12);
      const filtered = quotes.filter((quote) => {
        const quoteSymbol = (quote.symbol || '').trim().toUpperCase();
        return Boolean(quoteSymbol) && isUsYahooSearchQuoteAllowed(quote);
      });

      // Strict match first to avoid wrong symbol mapping.
      const exact = filtered.find((quote) => (quote.symbol || '').trim().toUpperCase() === rawUpper);
      if (exact?.symbol) {
        US_CMP_DEBUG_METRICS.searchResolved += 1;
        logUsCmpDebug('search_resolved_exact', { input: symbol, resolved: exact.symbol, query });
        return exact.symbol.trim().toUpperCase();
      }

      const normalized = filtered.find(
        (quote) => normalizeUsSearchSymbolKey(quote.symbol || '') === normalizedRaw,
      );
      if (normalized?.symbol) {
        US_CMP_DEBUG_METRICS.searchResolved += 1;
        logUsCmpDebug('search_resolved_normalized', {
          input: symbol,
          resolved: normalized.symbol,
          query,
        });
        return normalized.symbol.trim().toUpperCase();
      }
    } catch {
      continue;
    }
  }

  US_CMP_DEBUG_METRICS.searchMiss += 1;
  logUsCmpDebug('search_miss', { input: symbol, attemptedQueries: queries.length });
  return null;
};

const buildGoogleFinanceCandidates = (
  symbol: string,
  market: PriceFetchMarket,
): Array<{ symbol: string; exchange: string }> => {
  const normalized = normalizeSymbolForGoogle(symbol);
  if (!normalized) return [];

  if (market === 'india') {
    const exchanges = isIndexSymbol(normalized) ? ['INDEXNSE', 'INDEXBOM'] : ['NSE', 'BOM'];
    return exchanges.map((exchange) => ({ symbol: normalized, exchange }));
  }

  if (normalized.startsWith('.')) {
    const exact = GOOGLE_US_INDEX_EXCHANGE_BY_SYMBOL[normalized];
    if (exact) return [{ symbol: normalized, exchange: exact }];
    return ['INDEXNASDAQ', 'INDEXSP', 'INDEXDJX'].map((exchange) => ({ symbol: normalized, exchange }));
  }

  const symbolVariants = new Set<string>([normalized]);
  if (normalized.includes('/')) symbolVariants.add(normalized.replace(/\//g, '.'));
  if (/^[A-Z]+-[A-Z]+$/.test(normalized)) symbolVariants.add(normalized.replace('-', '.'));
  if (/^[A-Z]+\.[A-Z]+$/.test(normalized)) symbolVariants.add(normalized.replace('.', '-'));

  const preferredExchanges =
    normalized.includes('.') || normalized.includes('-')
      ? ['NYSE', 'NASDAQ', 'NYSEARCA', 'BATS']
      : ['NASDAQ', 'NYSE', 'NYSEARCA', 'BATS'];

  const candidates: Array<{ symbol: string; exchange: string }> = [];
  const seen = new Set<string>();

  for (const candidateSymbol of symbolVariants) {
    for (const exchange of preferredExchanges) {
      const key = `${candidateSymbol}:${exchange}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ symbol: candidateSymbol, exchange });
    }
  }

  return candidates;
};

/**
 * Fetch current price from Yahoo Finance API as a fallback
 * @param symbol - Stock symbol
 * @returns PriceTicksResponse compatible format
 */
export const fetchPriceFromYahoo = async (
  symbol: string,
  market: PriceFetchMarket = 'india',
): Promise<PriceTicksResponse> => {
  const cleanSymbol = symbol.trim().toUpperCase().replace(/\.(NS|BO|NF|BF)$/i, '');
  const symbolsToTry =
    market === 'us'
      ? [cleanSymbol]
      : [normalizeSymbolForYahoo(symbol, '.NS'), normalizeSymbolForYahoo(symbol, '.BO')];
  let lastError: Error | null = null;

  for (const yahooSymbol of symbolsToTry) {
    try {
      // Use 1m interval to get current price (more accurate for real-time pricing)
      const url = `/api/yahoo/v8/finance/chart/${yahooSymbol}?range=1d&interval=1m&events=capitalGain|div|split&formatted=true&includeAdjustedClose=true&lang=en-US&region=US`;

      const response = await fetch(url, {
        method: 'GET',
        headers: DEFAULT_HEADERS,
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit',
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined,
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance API request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (data.chart?.error) {
        throw new Error(`Yahoo Finance API error: ${data.chart.error}`);
      }

      if (!data.chart?.result?.length) {
        throw new Error('No data available from Yahoo Finance');
      }

      const result = data.chart.result[0];
      const { timestamp, indicators } = result;
      const quote = indicators.quote[0];

      if (!timestamp?.length || !quote?.close?.length) {
        throw new Error('Invalid data structure from Yahoo Finance');
      }

      // Get the latest price (last element in arrays)
      const latestTimestamp = timestamp[timestamp.length - 1];
      const latestClose = quote.close[quote.close.length - 1];
      const latestOpen = quote.open[quote.open.length - 1];
      const latestHigh = quote.high[quote.high.length - 1];
      const latestLow = quote.low[quote.low.length - 1];
      const latestVolume = quote.volume[quote.volume.length - 1];

      // Validate that we have a valid close price
      if (!latestClose || latestClose <= 0) {
        throw new Error('Invalid price data from Yahoo Finance');
      }

      // Convert to Strike API format: [timestamp, open, high, low, close, volume, dayVolume]
      const tick: [string, number, number, number, number, number, number] = [
        latestTimestamp.toString(),
        latestOpen || 0,
        latestHigh || 0,
        latestLow || 0,
        latestClose || 0,
        latestVolume || 0,
        latestVolume || 0 // dayVolume same as volume for daily data
      ];

      // Return in Strike API format
      return {
        data: {
          statistic: 0,
          count: 1,
          fields: ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'dayVolume'],
          ticks: {
            [symbol.toUpperCase()]: [tick]
          }
        }
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }
  }

  // If we get here, all symbol variants failed
  throw new Error(`Yahoo Finance fallback failed: ${lastError?.message || 'Unknown error'}`);
};

/**
 * Fetch current price from Google Finance as a fallback
 * @param symbol - Stock symbol
 * @returns PriceTicksResponse compatible format
 */
export const fetchPriceFromGoogle = async (symbol: string): Promise<PriceTicksResponse> => {
  return fetchPriceFromGoogleByMarket(symbol, 'india');
};

const fetchPriceFromGoogleByMarket = async (
  symbol: string,
  market: PriceFetchMarket,
): Promise<PriceTicksResponse> => {
  const candidates = buildGoogleFinanceCandidates(symbol, market);
  if (candidates.length === 0) {
    throw new Error('Google Finance fallback failed: no valid symbol candidates');
  }

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const url = buildGoogleFinanceBatchExecuteUrl(candidate.symbol, candidate.exchange);
      const body = new URLSearchParams({
        'f.req': buildGoogleFinanceBatchExecutePayload(candidate.symbol, candidate.exchange),
      }).toString();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
        body,
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'omit',
        signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(5000) : undefined,
      });

      if (!response.ok) {
        throw new Error(`Google Finance request failed with status ${response.status}`);
      }

      const batchExecuteResponse = await response.text();
      const price = extractGooglePriceFromBatchExecute(batchExecuteResponse);
      if (price === null) {
        throw new Error('Unable to extract quote from Google Finance RPC response');
      }

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const tick: [string, number, number, number, number, number, number] = [
        timestamp,
        price,
        price,
        price,
        price,
        0,
        0,
      ];

      return {
        data: {
          statistic: 0,
          count: 1,
          fields: ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'dayVolume'],
          ticks: {
            [symbol.toUpperCase()]: [tick],
          },
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }
  }

  throw new Error(`Google Finance fallback failed: ${lastError?.message || 'Unknown error'}`);
};

export const fetchPriceTicksSmart = async (
  symbol: string,
  fromDate?: Date,
  toDate?: Date,
  interval?: string,
  options?: { market?: PriceFetchMarket },
): Promise<PriceTicksResponse> => {
  const market = options?.market ?? 'india';
  if (market === 'us') {
    const searchedSymbol = await fetchUsSymbolFromYahooSearch(symbol).catch(() => null);
    const resolvedSymbol = searchedSymbol || symbol;

    try {
      const response = await fetchPriceFromYahoo(resolvedSymbol, 'us');
      US_CMP_DEBUG_METRICS.yahooSuccess += 1;
      logUsCmpDebug('yahoo_success', { input: symbol, resolvedSymbol });
      return response;
    } catch {
      US_CMP_DEBUG_METRICS.yahooFail += 1;
      logUsCmpDebug('yahoo_fail', { input: symbol, resolvedSymbol });
      try {
        const response = await fetchPriceFromGoogleByMarket(resolvedSymbol, 'us');
        US_CMP_DEBUG_METRICS.googleResolvedSuccess += 1;
        logUsCmpDebug('google_resolved_success', { input: symbol, resolvedSymbol });
        return response;
      } catch {
        US_CMP_DEBUG_METRICS.googleResolvedFail += 1;
        logUsCmpDebug('google_resolved_fail', { input: symbol, resolvedSymbol });
        // Final fallback: try Google heuristics with original symbol too.
        if (resolvedSymbol !== symbol) {
          try {
            const response = await fetchPriceFromGoogleByMarket(symbol, 'us');
            US_CMP_DEBUG_METRICS.googleOriginalSuccess += 1;
            logUsCmpDebug('google_original_success', { input: symbol, resolvedSymbol });
            return response;
          } catch {
            US_CMP_DEBUG_METRICS.googleOriginalFail += 1;
            logUsCmpDebug('google_original_fail', { input: symbol, resolvedSymbol });
            throw new Error(`US price fetch failed for ${symbol}`);
          }
        }
        throw new Error(`US price fetch failed for ${symbol}`);
      }
    }
  }

  const night = isProblematicNightHours();
  const strategy = night ? PRICE_FETCHING.night : PRICE_FETCHING.standard;
  const orderedProviders: PriceFetchProvider[] = [
    strategy.primaryProvider,
    ...strategy.fallbackOrder,
  ];

  const dedupedEnabledProviders: PriceFetchProvider[] = [];
  const seenProviders = new Set<PriceFetchProvider>();

  for (const provider of orderedProviders) {
    if (seenProviders.has(provider)) continue;
    seenProviders.add(provider);
    if (!PRICE_FETCHING.providerEnabled[provider]) continue;
    dedupedEnabledProviders.push(provider);
  }

  if (dedupedEnabledProviders.length === 0) {
    throw new Error('No price providers are enabled in PRICE_FETCHING');
  }

  const providerErrors: string[] = [];

  for (const provider of dedupedEnabledProviders) {
    try {
      switch (provider) {
        case 'strikePrimary':
          return await fetchPriceTicks(symbol, fromDate, toDate, interval);
        case 'strikeFallback':
          return await fetchPriceTicksWithFallback(symbol, fromDate, toDate, interval);
        case 'strikeHistorical':
          return await fetchPriceTicksWithHistoricalFallback(symbol);
        case 'yahoo':
          return await fetchPriceFromYahoo(symbol, 'india');
        case 'google':
          return await fetchPriceFromGoogle(symbol);
      }
    } catch (error) {
      providerErrors.push(
        `${provider}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `All configured providers failed for ${symbol}. ${providerErrors.join(' | ')}`,
  );
};

export const testApiUrlConstruction = (
  symbol: string = 'TATACOMM',
): { weekday: string; afterHours: string; weekend: string } => {
  const encodedSymbol = `EQ%3A${symbol.toUpperCase()}`;
  const baseUrl = (import.meta as any).env.VITE_PRICE_TICKS_BASE_URL || 'https://api-v2.strike.money';

  const weekdayFrom = new Date('2025-06-11T09:15:59+05:30');
  const weekdayTo = new Date('2025-06-11T15:30:00+05:30');
  const weekdayUrl = `${baseUrl}/v2/api/equity/priceticks?candleInterval=1m&from=${buildTimestampForApi(weekdayFrom)}&to=${buildTimestampForApi(weekdayTo)}&securities=${encodedSymbol}`;

  const afterFrom = new Date('2025-06-13T09:15:59+05:30');
  const afterTo = new Date('2025-06-13T23:59:59+05:30');
  const afterHoursUrl = `${baseUrl}/v2/api/equity/priceticks?candleInterval=1m&from=${buildTimestampForApi(afterFrom)}&to=${buildTimestampForApi(afterTo)}&securities=${encodedSymbol}`;

  const weekendFrom = new Date('2023-11-29T09:15:59+05:30');
  const weekendTo = new Date('2025-06-13T23:59:59+05:30');
  const weekendUrl = `${baseUrl}/v2/api/equity/priceticks?candleInterval=1d&from=${buildTimestampForApi(weekendFrom)}&to=${buildTimestampForApi(weekendTo)}&securities=${encodedSymbol}`;

  return { weekday: weekdayUrl, afterHours: afterHoursUrl, weekend: weekendUrl };
};

export type { }; 
