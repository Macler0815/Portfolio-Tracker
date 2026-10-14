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
    return (data.result || []).map((r: { symbol: string; description?: string; exchange?: string; type?: string }) => ({
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
    return matches.map((m: { symbol: string; instrument_name?: string; exchange?: string; instrument_type?: string }) => ({
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

export interface IsinLookupResult {
  symbol: string;
  name: string;
  wkn?: string;
  price?: number;
  assetType?: 'stock' | 'etf';
}

export function extractWknFromIsin(isin: string): string {
  const clean = isin.trim().toUpperCase();
  if (clean.startsWith('DE') && clean.length === 12) {
    if (clean.startsWith('DE000')) {
      return clean.substring(5, 11);
    }
    return clean.substring(2, 8);
  }
  return '';
}

export async function lookupSecurityByIsin(rawQuery: string): Promise<IsinLookupResult | null> {
  const query = rawQuery.trim().toUpperCase();
  if (!query || query.length < 5) return null;

  const isGermanIsin = query.startsWith('DE') && query.length === 12;
  const derivedWkn = isGermanIsin ? extractWknFromIsin(query) : (query.length === 6 ? query : '');

  const config = await getApiKeyConfig();
  const apiKey = config?.apiKey;

  if (!apiKey) {
    // If no API key configured, we can still return extracted WKN
    return derivedWkn ? { symbol: query, name: '', wkn: derivedWkn } : null;
  }

  try {
    let resolvedSymbol = '';
    let resolvedName = '';
    let assetType: 'stock' | 'etf' = 'stock';

    if (config.provider === 'finnhub') {
      const searchUrl = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${apiKey}`;
      const searchRes = await fetchWithTimeout(searchUrl, 8000);
      let results: { symbol?: string; displaySymbol?: string; description?: string; type?: string }[] = [];
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        results = searchData.result || [];
        if (results.length > 0) {
          const primary = results[0];
          resolvedSymbol = primary.symbol || primary.displaySymbol || '';
          resolvedName = primary.description || '';
          if (primary.type && (primary.type.toUpperCase() === 'ETF' || primary.type.toUpperCase().includes('ETF'))) {
            assetType = 'etf';
          }
        }
      }

      // If no results found by Finnhub
      if (!resolvedSymbol && results.length === 0) {
        return null;
      }

      let livePrice: number | undefined;
      const candidates: string[] = [resolvedSymbol, query].filter(Boolean);
      for (const r of results.slice(1, 4)) {
        const s = r.symbol || r.displaySymbol;
        if (s && !candidates.includes(s)) {
          candidates.push(s);
        }
      }

      for (const sym of candidates) {
        try {
          const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${apiKey}`;
          const quoteRes = await fetchWithTimeout(quoteUrl, 6000);
          if (quoteRes.ok) {
            const qData = await quoteRes.json();
            const p = typeof qData.c === 'number' && qData.c > 0
              ? qData.c
              : (typeof qData.pc === 'number' && qData.pc > 0 ? qData.pc : undefined);
            if (typeof p === 'number' && p > 0) {
              livePrice = p;
              break;
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
    } else if (config.provider === 'twelvedata') {
      const searchResults = await twelveDataSearch(query, apiKey);
      if (searchResults.length > 0) {
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
