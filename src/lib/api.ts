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
  if (!apiKey || !query || typeof query !== 'string') return [];
  try {
    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query.trim())}&token=${apiKey}`;
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.result)) return [];
    return data.result
      .filter((r: unknown): r is { symbol: string; description?: string; exchange?: string; type?: string } => !!r && typeof (r as Record<string, unknown>).symbol === 'string')
      .map((r: { symbol: string; description?: string; exchange?: string; type?: string }) => ({
        symbol: r.symbol,
        name: r.description || r.symbol,
        exchange: r.exchange || '',
        type: typeof r.type === 'string' && r.type.toUpperCase() === 'ETF' ? 'etf' : 'stock',
        quoteType: r.type || '',
      }));
  } catch {
    return [];
  }
}

async function finnhubQuotes(symbols: string[], apiKey: string): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (!apiKey || !Array.isArray(symbols) || symbols.length === 0) return result;
  for (const symbol of symbols) {
    if (!symbol || typeof symbol !== 'string') continue;
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol.trim())}&token=${apiKey}`;
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') continue;
      const p = typeof data.c === 'number' && data.c > 0
        ? data.c
        : (typeof data.pc === 'number' && data.pc > 0 ? data.pc : 0);
      if (p > 0) {
        result.set(symbol, {
          symbol,
          price: p,
          currency: 'USD',
          name: symbol,
          exchange: '',
          changePercent: typeof data.dp === 'number' ? data.dp : 0,
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
  if (!apiKey || !query || typeof query !== 'string') return [];
  try {
    const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query.trim())}&apikey=${apiKey}`;
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.data)) return [];
    return data.data
      .filter((m: unknown): m is { symbol: string; instrument_name?: string; exchange?: string; instrument_type?: string } => !!m && typeof (m as Record<string, unknown>).symbol === 'string')
      .map((m: { symbol: string; instrument_name?: string; exchange?: string; instrument_type?: string }) => ({
        symbol: m.symbol,
        name: m.instrument_name || m.symbol,
        exchange: m.exchange || '',
        type: typeof m.instrument_type === 'string' && m.instrument_type.toUpperCase() === 'ETF' ? 'etf' : 'stock',
        quoteType: m.instrument_type || '',
      }));
  } catch {
    return [];
  }
}

async function twelveDataQuotes(symbols: string[], apiKey: string): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (!apiKey || !Array.isArray(symbols) || symbols.length === 0) return result;
  const validSymbols = symbols.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  const BATCH_SIZE = 8;
  for (let i = 0; i < validSymbols.length; i += BATCH_SIZE) {
    const batch = validSymbols.slice(i, i + BATCH_SIZE);
    const symbolStr = batch.join(',');
    try {
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolStr)}&apikey=${apiKey}`;
      const res = await fetchWithTimeout(url, 10000);
      if (!res.ok) continue;
      const data = await res.json().catch(() => null);
      if (!data || typeof data !== 'object') continue;
      if (batch.length > 1 && !data.symbol) {
        for (const sym of batch) {
          const q = data[sym];
          if (q && q.close) {
            const price = parseFloat(q.close);
            if (!isNaN(price) && price > 0) {
              result.set(sym, {
                symbol: sym,
                price,
                currency: q.currency || 'USD',
                name: q.name || sym,
                exchange: q.exchange || '',
                changePercent: parseFloat(q.percent_change) || 0,
              });
            }
          }
        }
      } else {
        const q = data;
        if (q && q.close) {
          const sym = batch[0];
          const price = parseFloat(q.close);
          if (!isNaN(price) && price > 0) {
            result.set(sym, {
              symbol: sym,
              price,
              currency: q.currency || 'USD',
              name: q.name || sym,
              exchange: q.exchange || '',
              changePercent: parseFloat(q.percent_change) || 0,
            });
          }
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
  if (!query || typeof query !== 'string' || !query.trim()) return [];

  let config: ApiKeyConfig | null = null;
  try {
    config = await getApiKeyConfig();
  } catch {
    return [];
  }
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
  if (!Array.isArray(symbols) || symbols.length === 0) return result;

  const validSymbols = symbols.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  if (validSymbols.length === 0) return result;

  let config: ApiKeyConfig | null = null;
  try {
    config = await getApiKeyConfig();
  } catch (err) {
    console.error('[fetchQuotes] Fehler beim Lesen der Konfiguration:', err);
  }
  if (!config) {
    console.warn('[fetchQuotes] Kein API-Key konfiguriert — Kurse können nicht abgerufen werden');
    return result;
  }

  const fetchSymbols = validSymbols.map((s) => tickerMap?.get(s) || s);
  console.info(`[fetchQuotes] Provider: ${config.provider}, Symbole: ${fetchSymbols.join(', ')}`);

  let quotes: Map<string, QuoteResult> = new Map();

  try {
    if (config.provider === 'finnhub') {
      quotes = (await finnhubQuotes(fetchSymbols, config.apiKey)) || new Map();
    } else if (config.provider === 'twelvedata') {
      quotes = (await twelveDataQuotes(fetchSymbols, config.apiKey)) || new Map();
    }
  } catch (err) {
    console.error('[fetchQuotes] Netzwerkfehler:', err);
  }

  for (const [ticker, q] of (quotes || new Map())) {
    const origSymbol = validSymbols.find((s) => (tickerMap?.get(s) || s) === ticker);
    if (origSymbol) result.set(origSymbol, q);
  }

  return result;
}

export async function fetchSingleQuote(ticker: string): Promise<QuoteResult | null> {
  if (!ticker || typeof ticker !== 'string' || !ticker.trim()) return null;
  let config: ApiKeyConfig | null = null;
  try {
    config = await getApiKeyConfig();
  } catch {
    return null;
  }
  if (!config) return null;

  const sym = ticker.toUpperCase().trim();
  let quotes: Map<string, QuoteResult> = new Map();

  try {
    if (config.provider === 'finnhub') {
      quotes = (await finnhubQuotes([sym], config.apiKey)) || new Map();
    } else if (config.provider === 'twelvedata') {
      quotes = (await twelveDataQuotes([sym], config.apiKey)) || new Map();
    }
  } catch {
    return null;
  }

  return quotes?.get(sym) || null;
}

export function isCacheValid(fetchedAt: number): boolean {
  return typeof fetchedAt === 'number' && Date.now() - fetchedAt < CACHE_TTL;
}

export const CACHE_TTL_MS = CACHE_TTL;

export interface IsinLookupResult {
  symbol: string;
  name: string;
  wkn?: string;
  price?: number;
  assetType?: 'stock' | 'etf';
}

export function extractWknFromIsin(isin?: string | null): string {
  if (!isin || typeof isin !== 'string') return '';
  const clean = isin.trim().toUpperCase();
  if (clean.startsWith('DE') && clean.length === 12) {
    if (clean.startsWith('DE000')) {
      return clean.substring(5, 11);
    }
    return clean.substring(2, 8);
  }
  return '';
}

export async function lookupSecurityByIsin(rawQuery?: string | null): Promise<IsinLookupResult | null> {
  if (!rawQuery || typeof rawQuery !== 'string') return null;
  const query = rawQuery.trim().toUpperCase();
  if (!query || query.length < 5) return null;

  const isGermanIsin = query.startsWith('DE') && query.length === 12;
  const derivedWkn = isGermanIsin ? extractWknFromIsin(query) : (query.length === 6 ? query : '');

  let config: ApiKeyConfig | null = null;
  try {
    config = await getApiKeyConfig();
  } catch (err) {
    console.error('[lookupSecurityByIsin] Failed to get API key config:', err);
  }
  const apiKey = config?.apiKey;

  if (!apiKey) {
    // If no API key configured, we can still return extracted WKN
    return derivedWkn ? { symbol: query, name: '', wkn: derivedWkn } : null;
  }

  try {
    let resolvedSymbol = '';
    let resolvedName = '';
    let assetType: 'stock' | 'etf' = 'stock';

    if (config?.provider === 'finnhub') {
      const searchUrl = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${apiKey}`;
      const searchRes = await fetchWithTimeout(searchUrl, 8000);
      let results: { symbol?: string; displaySymbol?: string; description?: string; type?: string }[] = [];
      if (searchRes.ok) {
        const searchData = await searchRes.json().catch(() => null);
        if (searchData && Array.isArray(searchData.result)) {
          results = searchData.result.filter(Boolean);
          if (results.length > 0) {
            const primary = results[0];
            resolvedSymbol = primary.symbol || primary.displaySymbol || '';
            resolvedName = primary.description || '';
            if (typeof primary.type === 'string' && primary.type.toUpperCase().includes('ETF')) {
              assetType = 'etf';
            }
          }
        }
      }

      // If no results found by Finnhub
      if (!resolvedSymbol && results.length === 0) {
        return derivedWkn ? { symbol: query, name: '', wkn: derivedWkn } : null;
      }

      let livePrice: number | undefined;
      const candidates: string[] = [resolvedSymbol, query].filter((s): s is string => typeof s === 'string' && s.length > 0);
      for (const r of results.slice(1, 4)) {
        const s = r?.symbol || r?.displaySymbol;
        if (s && typeof s === 'string' && !candidates.includes(s)) {
          candidates.push(s);
        }
      }

      for (const sym of candidates) {
        try {
          const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${apiKey}`;
          const quoteRes = await fetchWithTimeout(quoteUrl, 6000);
          if (quoteRes.ok) {
            const qData = await quoteRes.json().catch(() => null);
            if (qData && typeof qData === 'object') {
              const p = typeof qData.c === 'number' && qData.c > 0
                ? qData.c
                : (typeof qData.pc === 'number' && qData.pc > 0 ? qData.pc : undefined);
              if (typeof p === 'number' && p > 0) {
                livePrice = p;
                break;
              }
            }
          }
        } catch {
          // ignore
        }
      }

      return {
        symbol: resolvedSymbol || query,
        name: resolvedName,
        wkn: derivedWkn || undefined,
        price: livePrice,
        assetType,
      };
    } else if (config?.provider === 'twelvedata') {
      const searchResults = await twelveDataSearch(query, apiKey);
      if (searchResults && searchResults.length > 0) {
        const best = searchResults[0];
        resolvedSymbol = best.symbol;
        resolvedName = best.name;
        assetType = best.type;
        const quote = await fetchSingleQuote(resolvedSymbol);
        return {
          symbol: resolvedSymbol,
          name: resolvedName,
          wkn: derivedWkn || undefined,
          price: quote?.price,
          assetType,
        };
      }
    }
  } catch (err) {
    console.error('[lookupSecurityByIsin] Error querying security:', err);
  }

  return derivedWkn ? { symbol: query, name: '', wkn: derivedWkn } : null;
}
