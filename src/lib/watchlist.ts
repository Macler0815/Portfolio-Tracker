import type { WatchlistItem } from '@/lib/types';

export const WATCHLIST_STORAGE_KEY = 'portfolio_watchlist';
export const WATCHLIST_EVENT = 'portfolio_watchlist_updated';

export function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WatchlistItem => !!item && typeof item.symbol === 'string' && item.symbol.trim().length > 0);
  } catch (err) {
    console.error('Error reading watchlist from localStorage:', err);
    return [];
  }
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

export function addToWatchlist(item: {
  symbol: string;
  name?: string;
  isin?: string;
  wkn?: string;
  notes?: string;
  lastPrice?: number;
  lastChangePercent?: number;
}): WatchlistItem[] {
  const current = getWatchlist();
  const cleanSymbol = item.symbol.trim().toUpperCase();
  const filtered = current.filter((x) => x.symbol.toUpperCase() !== cleanSymbol);

  const existing = current.find((x) => x.symbol.toUpperCase() === cleanSymbol);

  const newItem: WatchlistItem = {
    symbol: cleanSymbol,
    name: item.name?.trim() || cleanSymbol,
    isin: item.isin?.trim().toUpperCase() || existing?.isin,
    wkn: item.wkn?.trim().toUpperCase() || existing?.wkn,
    notes: item.notes?.trim() || existing?.notes,
    addedAt: existing?.addedAt || Date.now(),
    lastPrice: typeof item.lastPrice === 'number' ? item.lastPrice : existing?.lastPrice,
    lastChangePercent: typeof item.lastChangePercent === 'number' ? item.lastChangePercent : existing?.lastChangePercent,
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
