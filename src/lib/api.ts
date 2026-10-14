import { getSetting, setSetting } from '@/lib/db';

export type ApiProvider = 'finnhub' | 'twelvedata';

export interface ApiKeyConfig {
  provider: ApiProvider;
  apiKey: string;
}

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const SETTING_KEY = 'api-key-config';

const VALID_PROVIDERS: ApiProvider[] = ['finnhub', 'twelvedata'];

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function getApiKeyConfig(): Promise<ApiKeyConfig | null> {
  try {
    const config = await getSetting<ApiKeyConfig>(SETTING_KEY);
    if (config && config.apiKey && VALID_PROVIDERS.includes(config.provider)) {
      return { provider: config.provider, apiKey: config.apiKey };
    }
    // Old/invalid config (e.g. from previous Yahoo/AlphaVantage setup) — clean it up
    if (config) {
      await clearApiKeyConfig();
    }
    return null;
  } catch {
    return null;
  }
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
  if (!apiKey) return [];
  try {
    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${apiKey}`;
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result || []).map((r: any) => ({
      symbol: r.symbol,
      name: r.description || r.symbol,
      exchange: r.exchange || '',
      type: r.type === 'ETF' ? 'etf' : 'stock',
      quoteType: r.type || '',
    }));
  } catch {
    return [];
  }
}

async function finnhubQuotes(symbols: string[], apiKey: string): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (!apiKey) return result;
  for (const symbol of symbols) {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
      const res = await fetchWithTimeout(url, 8000);
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
  if (!apiKey) return [];
  try {
    const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey}`;
    const res = await fetchWithTimeout(url, 8000);
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
  } catch {
    return [];
  }
}

async function twelveDataQuotes(symbols: string[], apiKey: string): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (!apiKey) return result;
  const BATCH_SIZE = 8;
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const symbolStr = batch.join(',');
    try {
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolStr)}&apikey=${apiKey}`;
      const res = await fetchWithTimeout(url, 10000);
      if (!res.ok) continue;
      const data = await res.json();
      if (batch.length > 1 && !data.symbol) {
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

export async function searchSymbol(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const config = await getApiKeyConfig();
  if (!config) return [];

  try {
    if (config.provider === 'finnhub') {
      return await finnhubSearch(query, config.apiKey);
    } else if (config.provider === 'twelvedata') {
      return await twelveDataSearch(query, config.apiKey);
    }
  } catch {
    // network or parse error — return empty
  }

  return [];
}

export async function fetchQuotes(symbols: string[], tickerMap?: Map<string, string>): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (symbols.length === 0) return result;

  const config = await getApiKeyConfig();
  if (!config) {
    console.warn('[fetchQuotes] Kein API-Key konfiguriert — Kurse können nicht abgerufen werden');
    return result;
  }

  const fetchSymbols = symbols.map((s) => tickerMap?.get(s) || s);
  console.info(`[fetchQuotes] Provider: ${config.provider}, Symbole: ${fetchSymbols.join(', ')}`);

  let quotes: Map<string, QuoteResult> = new Map();

  try {
    if (config.provider === 'finnhub') {
      quotes = await finnhubQuotes(fetchSymbols, config.apiKey);
    } else if (config.provider === 'twelvedata') {
      quotes = await twelveDataQuotes(fetchSymbols, config.apiKey);
    }
  } catch (err) {
    console.error('[fetchQuotes] Netzwerkfehler:', err);
  }

  console.info(`[fetchQuotes] ${quotes.size} von ${fetchSymbols.length} Kursen erhalten`);

  for (const [ticker, q] of quotes) {
    const origSymbol = symbols.find((s) => (tickerMap?.get(s) || s) === ticker);
    if (origSymbol) result.set(origSymbol, q);
  }

  if (result.size === 0 && fetchSymbols.length > 0) {
    console.warn(`[fetchQuotes] Keine Kurse für [${fetchSymbols.join(', ')}] erhalten. Mögliche Ursachen: ungültiger API-Key, Rate-Limit erreicht, oder Symbole werden vom Provider nicht unterstützt.`);
  }

  return result;
}

export async function fetchSingleQuote(ticker: string): Promise<QuoteResult | null> {
  if (!ticker.trim()) return null;
  const config = await getApiKeyConfig();
  if (!config) return null;

  const sym = ticker.toUpperCase().trim();
  let quotes: Map<string, QuoteResult> = new Map();

  try {
    if (config.provider === 'finnhub') {
      quotes = await finnhubQuotes([sym], config.apiKey);
    } else if (config.provider === 'twelvedata') {
      quotes = await twelveDataQuotes([sym], config.apiKey);
    }
  } catch {
    return null;
  }

  return quotes.get(sym) || null;
}

export function isCacheValid(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CACHE_TTL;
}

export const CACHE_TTL_MS = CACHE_TTL;
