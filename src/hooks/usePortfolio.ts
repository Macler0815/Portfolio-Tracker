import { useCallback, useEffect, useRef, useState } from 'react';
import type { Transaction, PortfolioSummary, Holding, PortfolioExport } from '@/lib/types';
import {
  getAllTransactions,
  putTransaction,
  deleteTransaction,
  getAllPriceQuotes,
  putPriceQuote,
  getAllManualPrices,
  putManualPrice,
  deleteManualPrice,
  clearAllData,
} from '@/lib/db';
import { fetchQuotes, isCacheValid } from '@/lib/api';
import { computeHoldings, computeSummary } from '@/lib/calculations';

export function usePortfolio() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prices, setPrices] = useState<Map<string, { price: number; fetchedAt: number }>>(new Map());
  const [manualPrices, setManualPrices] = useState<Map<string, { price: number; setAt: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load all data from IndexedDB on mount
  const loadData = useCallback(async () => {
    try {
      const [txs, cachedPrices, manual] = await Promise.all([
        getAllTransactions(),
        getAllPriceQuotes(),
        getAllManualPrices(),
      ]);
      if (!mountedRef.current) return;
      setTransactions(txs.sort((a, b) => b.date.localeCompare(a.date)));
      setPrices(cachedPrices);
      setManualPrices(manual);
      setLoading(false);
    } catch {
      if (mountedRef.current) {
        setError('Fehler beim Laden der Daten');
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch live prices — uses cache, only fetches stale/missing symbols
  const refreshPrices = useCallback(
    async (force = false) => {
      if (transactions.length === 0) return;
      setRefreshing(true);
      setError(null);
      try {
        const symbols = Array.from(new Set(transactions.map((t) => t.symbol)));
        const tickerMap = new Map<string, string>();
        for (const t of transactions) {
          if (t.yahooTicker) tickerMap.set(t.symbol, t.yahooTicker);
        }
        const toFetch = force
          ? symbols
          : symbols.filter((s) => {
              const cached = prices.get(s);
              return !cached || !isCacheValid(cached.fetchedAt);
            });

        if (toFetch.length === 0) {
          if (mountedRef.current) {
            setRefreshing(false);
            setLastRefresh(Date.now());
          }
          return;
        }

        const quotes = await fetchQuotes(toFetch, tickerMap);
        const newPrices = new Map(prices);
        let updatedCount = 0;
        for (const [symbol, q] of quotes) {
          newPrices.set(symbol, { price: q.price, fetchedAt: Date.now() });
          await putPriceQuote({ symbol, price: q.price, fetchedAt: Date.now() });
          updatedCount++;
        }
        if (mountedRef.current) {
          setPrices(newPrices);
          setLastRefresh(Date.now());
          if (quotes.size === 0 && toFetch.length > 0) {
            // Complete API failure — use cached prices as fallback
            const hasCached = toFetch.some((s) => prices.has(s));
            setError(
              hasCached
                ? 'Kurse konnten nicht geladen werden — es werden die zuletzt gespeicherten Kurse angezeigt'
                : 'Kurse konnten nicht geladen werden'
            );
          } else if (updatedCount < toFetch.length) {
            setError(`${toFetch.length - updatedCount} Position(en) konnten nicht aktualisiert werden — manuelle Kurserfassung möglich`);
          }
        }
      } catch {
        if (mountedRef.current) {
          setError('Kurse konnten nicht abgerufen werden');
        }
      } finally {
        if (mountedRef.current) setRefreshing(false);
      }
    },
    [transactions, prices]
  );

  // Auto-refresh on mount if cache is stale
  useEffect(() => {
    if (!loading && transactions.length > 0) {
      const needsRefresh = transactions.some((t) => {
        const cached = prices.get(t.symbol);
        const manual = manualPrices.get(t.symbol);
        return !manual && (!cached || !isCacheValid(cached.fetchedAt));
      });
      if (needsRefresh) refreshPrices(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Derived state: holdings + summary
  const holdings: Holding[] = computeHoldings(transactions, prices, manualPrices);
  const summary: PortfolioSummary = computeSummary(holdings);

  // CRUD
  const addTransaction = useCallback(async (t: Omit<Transaction, 'id'>) => {
    const tx = { ...t, id: crypto.randomUUID() };
    await putTransaction(tx);
    setTransactions((prev) => [tx, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
  }, []);

  const updateTransaction = useCallback(async (t: Transaction) => {
    await putTransaction(t);
    setTransactions((prev) => [t, ...prev.filter((x) => x.id !== t.id)].sort((a, b) => b.date.localeCompare(a.date)));
  }, []);

  const removeTransaction = useCallback(async (id: string) => {
    await deleteTransaction(id);
    setTransactions((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Manual price override
  const setManualPrice = useCallback(async (symbol: string, price: number) => {
    const entry = { symbol, price, setAt: Date.now() };
    await putManualPrice(entry);
    setManualPrices((prev) => new Map(prev).set(symbol, { price, setAt: entry.setAt }));
  }, []);

  const removeManualPrice = useCallback(async (symbol: string) => {
    await deleteManualPrice(symbol);
    setManualPrices((prev) => {
      const m = new Map(prev);
      m.delete(symbol);
      return m;
    });
  }, []);

  // Export / Import
  const exportPortfolio = useCallback(async (): Promise<PortfolioExport> => {
    const [txs, manual] = await Promise.all([getAllTransactions(), getAllManualPrices()]);
    return {
      version: 1,
      exportedAt: Date.now(),
      transactions: txs,
      manualPrices: Array.from(manual.entries()).map(([symbol, v]) => ({ symbol, price: v.price, setAt: v.setAt })),
    };
  }, []);

  const importPortfolio = useCallback(async (data: PortfolioExport) => {
    await clearAllData();
    for (const t of data.transactions) {
      await putTransaction(t);
    }
    for (const p of data.manualPrices) {
      await putManualPrice(p);
    }
    await loadData();
  }, [loadData]);

  const clearPortfolio = useCallback(async () => {
    await clearAllData();
    setTransactions([]);
    setPrices(new Map());
    setManualPrices(new Map());
  }, []);

  return {
    transactions,
    holdings,
    summary,
    loading,
    refreshing,
    lastRefresh,
    error,
    refreshPrices,
    addTransaction,
    updateTransaction,
    removeTransaction,
    setManualPrice,
    removeManualPrice,
    exportPortfolio,
    importPortfolio,
    clearPortfolio,
    manualPrices,
  };
}
