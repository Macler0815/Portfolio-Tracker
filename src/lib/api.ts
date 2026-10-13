import { getSetting, setSetting } from '@/lib/db';

export type ApiProvider = 'yahoo' | 'alphavantage' | 'finnhub';

export interface ApiKeyConfig {
  provider: ApiProvider;
  apiKey: string;
}

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const SETTING_KEY = 'api-key-config';

const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

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

async function fetchWithProxies(url: string, timeoutMs: number): Promise<Response | null> {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
    } catch {
      // try next proxy
    }
  }
  return null;
}

const CURRENCY_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  CHF: 1.05,
  JPY: 0.0059,
  CAD: 0.68,
  AUD: 0.61,
  INR: 0.011,
  CNY: 0.13,
  SEK: 0.087,
  NOK: 0.085,
  DKK: 0.134,
};

function convertToEur(currency: string, price: number): number {
  const rate = CURRENCY_RATES[currency];
  return rate ? price * rate : price;
}

// --- Yahoo Finance (free, no API key needed, via CORS proxy) ---

async function yahooSearch(query: string): Promise<SearchResult[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`;
  const res = await fetchWithProxies(url, 8000);
  if (!res) return [];
  const data = await res.json();
  return (data.quotes || [])
    .filter((q: any) => q.symbol)
    .map((q: any) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange || '',
      type: q.quoteType === 'ETF' ? 'etf' : q.quoteType === 'EQUITY' ? 'stock' : 'unknown',
      quoteType: q.quoteType || '',
    }))
    .filter((r: SearchResult) => r.type !== 'unknown');
}

async function yahooQuotes(symbols: string[]): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  const symbolStr = symbols.map((s) => encodeURIComponent(s)).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolStr}&fields=regularMarketPrice,currency,shortName,longName,fullExchangeName,regularMarketChangePercent`;
  const res = await fetchWithProxies(url, 10000);
  if (!res) return result;
  const data = await res.json();
  const quotes = data?.quoteResponse?.result || [];
  for (const q of quotes) {
    const rawPrice = q.regularMarketPrice ?? 0;
    const currency = q.currency || 'USD';
    result.set(q.symbol, {
      symbol: q.symbol,
      price: convertToEur(currency, rawPrice),
      currency: 'EUR',
      name: q.longName || q.shortName || q.symbol,
      exchange: q.fullExchangeName || q.exchange || '',
      changePercent: q.regularMarketChangePercent ?? 0,
    });
  }
  return result;
}

// --- Alpha Vantage (requires API key, CORS-enabled) ---

async function alphaVantageSearch(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  const matches = data.bestMatches || [];
  return matches
    .map((m: any) => ({
      symbol: m['1. symbol'],
      name: m['2. name'] || m['1. symbol'],
      exchange: m['4. region'] || '',
      type: m['3. type'] === 'ETF' ? 'etf' : 'stock',
      quoteType: m['3. type'] || '',
    }))
    .filter((r: SearchResult) => r.type !== 'unknown');
}

async function alphaVantageQuotes(symbols: string[], apiKey: string): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  // Alpha Vantage global quote works one symbol at a time
  for (const symbol of symbols) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      const q = data['Global Quote'];
      if (!q || !q['05. price']) continue;
      const price = parseFloat(q['05. price']);
      const changePercent = parseFloat(q['10. change percent']?.replace('%', '') || '0');
      result.set(symbol, {
        symbol,
        price,
        currency: 'USD',
        name: symbol,
        exchange: '',
        changePercent,
      });
    } catch {
      // continue to next symbol
    }
  }
  return result;
}

// --- Finnhub (requires API key, CORS-enabled) ---

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

// --- Public API ---

export async function searchSymbol(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const config = await getApiKeyConfig();

  if (config) {
    if (config.provider === 'alphavantage') {
      const results = await alphaVantageSearch(query, config.apiKey);
      if (results.length > 0) return results;
    } else if (config.provider === 'finnhub') {
      const results = await finnhubSearch(query, config.apiKey);
      if (results.length > 0) return results;
    }
  }

  // Fallback to Yahoo Finance via CORS proxy
  return yahooSearch(query);
}

export async function fetchQuotes(symbols: string[]): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (symbols.length === 0) return result;

  const config = await getApiKeyConfig();

  if (config) {
    if (config.provider === 'alphavantage') {
      const quotes = await alphaVantageQuotes(symbols, config.apiKey);
      if (quotes.size > 0) return quotes;
    } else if (config.provider === 'finnhub') {
      const quotes = await finnhubQuotes(symbols, config.apiKey);
      if (quotes.size > 0) return quotes;
    }
  }

  // Fallback to Yahoo Finance via CORS proxy
  return yahooQuotes(symbols);
}

export function isCacheValid(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CACHE_TTL;
}

export const CACHE_TTL_MS = CACHE_TTL;
