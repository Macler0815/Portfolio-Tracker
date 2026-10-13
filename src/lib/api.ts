import { getSetting, setSetting } from '@/lib/db';

export type ApiProvider = 'finnhub' | 'twelvedata';

export interface ApiKeyConfig {
  provider: ApiProvider;
  apiKey: string;
}

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const SETTING_KEY = 'api-key-config';

export async function getApiKeyConfig(): Promise<ApiKeyConfig | null> {
  const config = await getSetting<ApiKeyConfig>(SETTING_KEY);
  if (config && config.apiKey) return config;
  return null;
}

export async function saveApiKeyConfig(config: ApiKeyConfig): Promise<void> {
  await setSetting(SETTING_KEY, config);
}

export async function clearApiKeyConfig(): Promise<void> {
  await setSetting<ApiKeyConfig | null>(SETTING_KEY, null);
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: 'stock' | 'etf' | 'unknown';
  quoteType: string;
}

export interface QuoteResult {
  symbol: string;
  price: number;
  currency: string;
  name: string;
  exchange: string;
  changePercent: number;
}

// --- Finnhub (CORS-enabled, requires API key) ---

async function finnhubSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.result || []).map((r: any) => ({
    symbol: r.symbol,
    name: r.description || r.symbol,
    exchange: r.exchange || '',
    type: r.type === 'ETF' ? 'etf' : 'stock',
    quoteType: r.type || '',
  }));
}

async function finnhubQuotes(symbols: string[], apiKey: string): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  for (const symbol of symbols) {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.c && data.c > 0) {
        result.set(symbol, {
          symbol,
          price: data.c,
          currency: 'USD',
          name: symbol,
          exchange: '',
          changePercent: data.dp || 0,
        });
      }
    } catch {
      // continue to next symbol
    }
  }
  return result;
}

// --- Twelve Data (CORS-enabled, requires API key) ---

async function twelveDataSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  const matches = data.data || [];
  return matches.map((m: any) => ({
    symbol: m.symbol,
    name: m.instrument_name || m.symbol,
    exchange: m.exchange || '',
    type: m.instrument_type === 'ETF' ? 'etf' : 'stock',
    quoteType: m.instrument_type || '',
  }));
}

async function twelveDataQuotes(symbols: string[], apiKey: string): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  // Twelve Data supports batch quotes (up to 8 symbols)
  const BATCH_SIZE = 8;
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const symbolStr = batch.join(',');
    try {
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolStr)}&apikey=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const data = await res.json();
      // Batch response is an object keyed by symbol; single response is a flat object
      if (Array.isArray(batch) && batch.length > 1 && !data.symbol) {
        for (const sym of batch) {
          const q = data[sym];
          if (q && q.close) {
            result.set(sym, {
              symbol: sym,
              price: parseFloat(q.close),
              currency: q.currency || 'USD',
              name: q.name || sym,
              exchange: q.exchange || '',
              changePercent: parseFloat(q.percent_change) || 0,
            });
          }
        }
      } else {
        const q = data;
        if (q && q.close) {
          const sym = batch[0];
          result.set(sym, {
            symbol: sym,
            price: parseFloat(q.close),
            currency: q.currency || 'USD',
            name: q.name || sym,
            exchange: q.exchange || '',
            changePercent: parseFloat(q.percent_change) || 0,
          });
        }
      }
    } catch {
      // continue to next batch
    }
  }
  return result;
}

// --- Public API ---

/**
 * Resolve an ISIN, WKN, or arbitrary query to a ticker symbol.
 * Returns the first matching stock/ETF result, or null if none found.
 */
export async function resolveTicker(query: string): Promise<SearchResult | null> {
  if (!query.trim()) return null;
  const results = await searchSymbol(query);
  return results.length > 0 ? results[0] : null;
}

/**
 * Check if a symbol looks like an ISIN (12 chars, alphanumeric, starts with 2 letters)
 * or a WKN (6 chars, alphanumeric).
 */
export function isIsin(input: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(input.toUpperCase());
}

export function isWkn(input: string): boolean {
  return /^[A-Z0-9]{6}$/.test(input.toUpperCase());
}

export function needsTickerResolution(input: string): boolean {
  const upper = input.toUpperCase().trim();
  if (upper.includes('.')) return false;
  if (isIsin(upper)) return true;
  if (isWkn(upper)) return true;
  return false;
}

export async function searchSymbol(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const config = await getApiKeyConfig();
  if (!config) return [];

  if (config.provider === 'finnhub') {
    return finnhubSearch(query, config.apiKey);
  } else if (config.provider === 'twelvedata') {
    return twelveDataSearch(query, config.apiKey);
  }

  return [];
}

export async function fetchQuotes(symbols: string[], tickerMap?: Map<string, string>): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (symbols.length === 0) return result;

  const fetchSymbols = symbols.map((s) => tickerMap?.get(s) || s);
  const config = await getApiKeyConfig();

  if (!config) return result;

  let quotes: Map<string, QuoteResult>;

  if (config.provider === 'finnhub') {
    quotes = await finnhubQuotes(fetchSymbols, config.apiKey);
  } else if (config.provider === 'twelvedata') {
    quotes = await twelveDataQuotes(fetchSymbols, config.apiKey);
  } else {
    return result;
  }

  for (const [ticker, q] of quotes) {
    const origSymbol = symbols.find((s) => (tickerMap?.get(s) || s) === ticker);
    if (origSymbol) result.set(origSymbol, q);
  }
  return result;
}

export function isCacheValid(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CACHE_TTL;
}

export const CACHE_TTL_MS = CACHE_TTL;
