import type { WatchlistItem } from '@/lib/types';
import { fetchSingleQuote } from '@/lib/api';

export const WATCHLIST_STORAGE_KEY = 'portfolio_watchlist';
export const WATCHLIST_EVENT = 'portfolio_watchlist_updated';

export function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): WatchlistItem | null => {
        if (!item) return null;
        // Backward-compatibility: if item is just a string (e.g. "AAPL")
        if (typeof item === 'string') {
          const s = item.trim().toUpperCase();
          if (!s) return null;
          return {
            symbol: s,
            name: s,
            addedPrice: 0,
            addedAt: new Date().toISOString(),
          };
        }
        if (typeof item.symbol !== 'string' || !item.symbol.trim()) return null;
        const cleanSymbol = item.symbol.trim().toUpperCase();

        const addedPrice =
          typeof item.addedPrice === 'number' && !isNaN(item.addedPrice)
            ? item.addedPrice
            : typeof item.lastPrice === 'number' && !isNaN(item.lastPrice)
            ? item.lastPrice
            : 0;

        let addedAtStr = new Date().toISOString();
        if (typeof item.addedAt === 'string' && item.addedAt.trim()) {
          addedAtStr = item.addedAt;
        } else if (typeof item.addedAt === 'number' && item.addedAt > 0) {
          addedAtStr = new Date(item.addedAt).toISOString();
        }

        const assetType = item.assetType === 'etf' || item.assetType === 'stock' ? item.assetType : undefined;

        return {
          symbol: cleanSymbol,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : cleanSymbol,
          assetType,
          addedPrice: Math.max(0, addedPrice),
          addedAt: addedAtStr,
          isin: item.isin ? String(item.isin).trim().toUpperCase() : undefined,
          wkn: item.wkn ? String(item.wkn).trim().toUpperCase() : undefined,
          notes: item.notes ? String(item.notes).trim() : undefined,
          lastPrice: typeof item.lastPrice === 'number' ? item.lastPrice : undefined,
          lastChangePercent: typeof item.lastChangePercent === 'number' ? item.lastChangePercent : undefined,
        };
      })
      .filter((item): item is WatchlistItem => item !== null);
  } catch (err) {
    console.error('Error reading watchlist from localStorage:', err);
    return [];
  }
}

export function getWatchlistItemAssetType(item: WatchlistItem): 'stock' | 'etf' {
  if (item.assetType === 'etf' || item.assetType === 'stock') {
    return item.assetType;
  }
  const text = `${item.symbol} ${item.name || ''} ${item.notes || ''}`.toUpperCase();
  if (
    text.includes('ETF') ||
    text.includes('UCITS') ||
    text.includes('ISHARES') ||
    text.includes('VANGUARD') ||
    text.includes('XTRACKERS') ||
    text.includes('AMUNDI') ||
    text.includes('INVESCO') ||
    text.includes('MSCI') ||
    text.includes('CORE') ||
    text.includes('INDEX') ||
    text.includes('SPDR') ||
    text.includes('LYXOR') ||
    text.includes('BOND')
  ) {
    return 'etf';
  }
  return 'stock';
}

export function saveWatchlist(items: WatchlistItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT, { detail: items }));
  } catch (err) {
    console.error('Error saving watchlist to localStorage:', err);
  }
}

export async function addToWatchlist(item: {
  symbol: string;
  name?: string;
  assetType?: import('@/lib/types').AssetType;
  addedPrice?: number;
  addedAt?: string;
  isin?: string;
  wkn?: string;
  notes?: string;
  lastPrice?: number;
  lastChangePercent?: number;
}): Promise<WatchlistItem[]> {
  const current = getWatchlist();
  const cleanSymbol = item.symbol.trim().toUpperCase();
  const filtered = current.filter((x) => x.symbol.toUpperCase() !== cleanSymbol);
  const existing = current.find((x) => x.symbol.toUpperCase() === cleanSymbol);

  let initialPrice =
    typeof item.addedPrice === 'number' && !isNaN(item.addedPrice) && item.addedPrice > 0
      ? item.addedPrice
      : existing && typeof existing.addedPrice === 'number' && existing.addedPrice > 0
      ? existing.addedPrice
      : 0;

  let currentLastPrice = item.lastPrice || existing?.lastPrice;
  let currentChangePercent = item.lastChangePercent || existing?.lastChangePercent;

  // If initialPrice is 0, fetch current live quote from Finnhub
  if (initialPrice <= 0) {
    try {
      const q = await fetchSingleQuote(cleanSymbol);
      if (q && typeof q.price === 'number' && q.price > 0) {
        initialPrice = q.price;
        if (!currentLastPrice) currentLastPrice = q.price;
        if (typeof q.changePercent === 'number') currentChangePercent = q.changePercent;
      }
    } catch (e) {
      console.warn('Could not fetch quote for new watchlist symbol:', e);
      initialPrice = 0;
    }
  }

  const newItem: WatchlistItem = {
    symbol: cleanSymbol,
    name: item.name?.trim() || existing?.name || cleanSymbol,
    assetType: item.assetType || existing?.assetType || (getWatchlistItemAssetType({ symbol: cleanSymbol, name: item.name || '', addedPrice: 0, addedAt: '' })),
    addedPrice: Math.max(0, initialPrice),
    addedAt: item.addedAt || existing?.addedAt || new Date().toISOString(),
    isin: item.isin?.trim().toUpperCase() || existing?.isin,
    wkn: item.wkn?.trim().toUpperCase() || existing?.wkn,
    notes: item.notes?.trim() || existing?.notes,
    lastPrice: currentLastPrice,
    lastChangePercent: currentChangePercent,
  };

  const updated = [newItem, ...filtered];
  saveWatchlist(updated);
  return updated;
}

export function removeFromWatchlist(symbol: string): WatchlistItem[] {
  const current = getWatchlist();
  const cleanSymbol = symbol.trim().toUpperCase();
  const updated = current.filter((x) => x.symbol.toUpperCase() !== cleanSymbol);
  saveWatchlist(updated);
  return updated;
}

export function updateWatchlistQuotes(quotes: Map<string, { price: number; changePercent?: number }>): WatchlistItem[] {
  const current = getWatchlist();
  let changed = false;

  const updated = current.map((item) => {
    const q = quotes.get(item.symbol) || quotes.get(item.symbol.toUpperCase());
    if (q && (q.price !== item.lastPrice || q.changePercent !== item.lastChangePercent)) {
      changed = true;
      return {
        ...item,
        lastPrice: q.price,
        lastChangePercent: q.changePercent,
      };
    }
    return item;
  });

  if (changed) {
    saveWatchlist(updated);
  }

  return updated;
}
