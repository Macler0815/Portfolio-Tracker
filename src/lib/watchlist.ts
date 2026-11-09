import type { WatchlistItem } from '@/lib/types';
import { fetchSingleQuote } from '@/lib/api';

export const WATCHLIST_STORAGE_KEY = 'portfolio_watchlist';
export const WATCHLIST_EVENT = 'portfolio_watchlist_updated';

export function normalizeWatchlistItems(items: unknown[]): WatchlistItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item): WatchlistItem | null => {
      if (!item) return null;
      // Backward-compatibility: if item is just a string (e.g. "AAPL")
      if (typeof item === 'string') {
        const s = item.trim().toUpperCase();
        if (!s) return null;
        return {
          symbol: s,
          name: s,
          assetType: 'stock',
          addedPrice: 0,
          addedAt: new Date().toISOString(),
        };
      }
      if (typeof item !== 'object') return null;
      const rec = item as Record<string, unknown>;
      if (typeof rec.symbol !== 'string' || !rec.symbol.trim()) return null;
      const cleanSymbol = rec.symbol.trim().toUpperCase();

      const addedPrice =
        typeof rec.addedPrice === 'number' && !isNaN(rec.addedPrice)
          ? rec.addedPrice
          : typeof rec.lastPrice === 'number' && !isNaN(rec.lastPrice)
          ? rec.lastPrice
          : 0;

      let addedAtStr = new Date().toISOString();
      if (typeof rec.addedAt === 'string' && rec.addedAt.trim()) {
        addedAtStr = rec.addedAt;
      } else if (typeof rec.addedAt === 'number' && rec.addedAt > 0) {
        addedAtStr = new Date(rec.addedAt).toISOString();
      }

      const assetType =
        rec.assetType === 'etf' || rec.assetType === 'stock'
          ? (rec.assetType as 'stock' | 'etf')
          : undefined;

      const resItem: WatchlistItem = {
        symbol: cleanSymbol,
        name: typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : cleanSymbol,
        assetType,
        addedPrice: Math.max(0, addedPrice),
        addedAt: addedAtStr,
        isin: rec.isin ? String(rec.isin).trim().toUpperCase() : undefined,
        wkn: rec.wkn ? String(rec.wkn).trim().toUpperCase() : undefined,
        notes: rec.notes ? String(rec.notes).trim() : undefined,
        lastPrice: typeof rec.lastPrice === 'number' ? rec.lastPrice : undefined,
        lastChangePercent: typeof rec.lastChangePercent === 'number' ? rec.lastChangePercent : undefined,
      };

      if (!resItem.assetType) {
        resItem.assetType = getWatchlistItemAssetType(resItem);
      }
      return resItem;
    })
    .filter((item): item is WatchlistItem => item !== null);
}

export function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeWatchlistItems(parsed);
  } catch (err) {
    console.error('Error reading watchlist from localStorage:', err);
    return [];
  }
}

export function getWatchlistItemAssetType(item: WatchlistItem | null | undefined): 'stock' | 'etf' {
  if (!item) return 'stock';
  if (item.assetType === 'etf' || item.assetType === 'stock') {
    return item.assetType;
  }
  const text = `${item.symbol || ''} ${item.name || ''} ${item.notes || ''}`.toUpperCase();
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

export function saveWatchlist(items: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeWatchlistItems(items);
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT, { detail: normalized }));
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
