import { useState, useEffect, useCallback, useRef } from 'react';
import type { WatchlistItem } from '@/lib/types';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  updateWatchlistQuotes,
  WATCHLIST_EVENT,
} from '@/lib/watchlist';
import { fetchQuotes, type QuoteResult } from '@/lib/api';

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>(() => getWatchlist());
  const [quotes, setQuotes] = useState<Map<string, QuoteResult>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Listen to custom and storage events
  useEffect(() => {
    function handleUpdate() {
      if (mountedRef.current) {
        setItems(getWatchlist());
      }
    }

    window.addEventListener(WATCHLIST_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(WATCHLIST_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Refresh live Finnhub quotes
  const refreshQuotes = useCallback(async () => {
    const currentItems = getWatchlist();
    if (currentItems.length === 0) return;

    setRefreshing(true);
    try {
      const symbols = currentItems.map((x) => x.symbol);
      const fetched = await fetchQuotes(symbols);

      if (mountedRef.current && fetched) {
        setQuotes((prev) => {
          const next = new Map(prev);
          for (const [sym, q] of fetched) {
            next.set(sym, q);
          }
          return next;
        });

        // Persist the latest fetched price/percent into localStorage so it loads instantly next time
        updateWatchlistQuotes(fetched);
        setItems(getWatchlist());
      }
    } catch (err) {
      console.error('Error fetching watchlist quotes:', err);
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, []);

  // Auto-fetch quotes on mount and when item count changes
  useEffect(() => {
    if (items.length > 0) {
      refreshQuotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const add = useCallback((item: {
    symbol: string;
    name?: string;
    isin?: string;
    wkn?: string;
    notes?: string;
    lastPrice?: number;
    lastChangePercent?: number;
  }) => {
    const updated = addToWatchlist(item);
    setItems(updated);
  }, []);

  const remove = useCallback((symbol: string) => {
    const updated = removeFromWatchlist(symbol);
    setItems(updated);
  }, []);

  return {
    items,
    quotes,
    refreshing,
    refreshQuotes,
    addItem: add,
    removeItem: remove,
  };
}
