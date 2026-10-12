const CORS_PROXY = 'https://corsproxy.io/?url=';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

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

function yahooUrl(path: string): string {
  return `${CORS_PROXY}${encodeURIComponent('https://query1.finance.yahoo.com' + path)}`;
}

export async function searchSymbol(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const url = yahooUrl(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
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
  } catch {
    return [];
  }
}

function convertCurrency(target: string): number {
  const rates: Record<string, number> = {
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
  return rates[target] ?? null;
}

export async function fetchQuotes(symbols: string[]): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (symbols.length === 0) return result;

  const symbolStr = symbols.map((s) => encodeURIComponent(s)).join(',');
  const url = yahooUrl(`/v7/finance/quote?symbols=${symbolStr}&fields=regularMarketPrice,currency,shortName,longName,fullExchangeName,regularMarketChangePercent`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return result;
    const data = await res.json();
    const quotes = data?.quoteResponse?.result || [];
    for (const q of quotes) {
      const currency = q.currency || 'USD';
      const rawPrice = q.regularMarketPrice ?? 0;
      const rate = convertCurrency(currency);
      const price = rate ? rawPrice * rate : rawPrice;
      result.set(q.symbol, {
        symbol: q.symbol,
        price,
        currency: 'EUR',
        name: q.longName || q.shortName || q.symbol,
        exchange: q.fullExchangeName || q.exchange || '',
        changePercent: q.regularMarketChangePercent ?? 0,
      });
    }
  } catch {
    // silently fail — UI will show missing prices
  }
  return result;
}

export function isCacheValid(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CACHE_TTL;
}

export const CACHE_TTL_MS = CACHE_TTL;
