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
import { fetchQuotes, isCacheValid, getApiKeyConfig } from '@/lib/api';
import { computeHoldings, computeSummary } from '@/lib/calculations';

function safeRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

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
        getAllTransactions().catch(() => []),
        getAllPriceQuotes().catch(() => new Map()),
        getAllManualPrices().catch(() => new Map()),
      ]);
      if (!mountedRef.current) return;
      const safeTxs = Array.isArray(txs) ? txs.filter(Boolean) : [];
      setTransactions(safeTxs.sort((a, b) => ((b && b.date) || '').localeCompare((a && a.date) || '')));
      setPrices(cachedPrices instanceof Map ? cachedPrices : new Map());
      setManualPrices(manual instanceof Map ? manual : new Map());
      setLoading(false);
    } catch {
      if (!mountedRef.current) return;
      setError('Fehler beim Laden der Daten');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch live prices — uses cache, only fetches stale/missing symbols
  const refreshPrices = useCallback(
    async (force = false) => {
      if (!transactions || transactions.length === 0) return;
      setRefreshing(true);
      setError(null);
      try {
        const symbols = Array.from(
          new Set(
            transactions
              .map((t) => t?.symbol)
              .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          )
        );
        const tickerMap = new Map<string, string>();
        for (const t of transactions) {
          if (!t) continue;
          const ticker = t.ticker || t.yahooTicker;
          if (ticker && t.symbol) tickerMap.set(t.symbol, ticker);
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

        let config = null;
        try {
          config = await getApiKeyConfig();
        } catch {
          // ignore
        }
        if (!config) {
          if (mountedRef.current) {
            setRefreshing(false);
            setError('Bitte trage in den Einstellungen einen kostenlosen API-Schlüssel ein, um Live-Kurse zu aktivieren.');
          }
          return;
        }

        const quotes = await fetchQuotes(toFetch, tickerMap);
        const newPrices = new Map(prices);
        let updatedCount = 0;
        if (quotes && typeof quotes[Symbol.iterator] === 'function') {
          for (const [symbol, q] of quotes) {
            newPrices.set(symbol, { price: q.price, fetchedAt: Date.now() });
            await putPriceQuote({ symbol, price: q.price, fetchedAt: Date.now() }).catch(() => {});
            updatedCount++;
          }
        }
        if (mountedRef.current) {
          setPrices(newPrices);
          setLastRefresh(Date.now());
          if ((!quotes || quotes.size === 0) && toFetch.length > 0) {
            const failedSymbols = toFetch.map((s) => tickerMap.get(s) || s).join(', ');
            const hasCached = toFetch.some((s) => prices.has(s));
            setError(
              hasCached
                ? `Kurse für [${failedSymbols}] konnten nicht geladen werden — es werden gespeicherte Kurse angezeigt. Prüfe API-Key und Tickersymbole.`
                : `Kurse für [${failedSymbols}] konnten nicht geladen werden. Prüfe in den Einstellungen deinen API-Key und ob die Tickersymbole korrekt sind (z.B. EUNL.DE für Xetra-ETFs).`
            );
          } else if (updatedCount < toFetch.length) {
            const failed = toFetch.filter((s) => !quotes || !quotes.has(s)).map((s) => tickerMap.get(s) || s).join(', ');
            setError(`Kurse für [${failed}] konnten nicht aktualisiert werden — Ticker prüfen oder manuell erfassen`);
          }
        }
      } catch (err) {
        console.error('refreshPrices failed:', err);
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
        if (!t?.symbol) return false;
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
    const tx = { ...t, id: safeRandomId() };
    await putTransaction(tx);
    setTransactions((prev) => [tx, ...prev].sort((a, b) => ((b && b.date) || '').localeCompare((a && a.date) || '')));
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
    try {
      const [txs, manual] = await Promise.all([
        getAllTransactions().catch(() => []),
        getAllManualPrices().catch(() => new Map()),
      ]);
      const safeTxs = Array.isArray(txs) ? txs.filter(Boolean) : [];
      const safeManual = manual instanceof Map ? manual : new Map();
      return {
        version: 1,
        exportedAt: Date.now(),
        transactions: safeTxs,
        manualPrices: Array.from(safeManual.entries()).map(([symbol, v]) => ({
          symbol,
          price: v?.price || 0,
          setAt: v?.setAt || Date.now(),
        })),
      };
    } catch {
      return {
        version: 1,
        exportedAt: Date.now(),
        transactions: [],
        manualPrices: [],
      };
    }
  }, []);

  const importPortfolio = useCallback(async (data: PortfolioExport) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Ungültiges Portfolio-Format');
    }
    const safeTxs = Array.isArray(data.transactions) ? data.transactions.filter(Boolean) : [];
    const safeManuals = Array.isArray(data.manualPrices) ? data.manualPrices.filter(Boolean) : [];

    await clearAllData();
    for (const t of safeTxs) {
      if (t && t.id) await putTransaction(t);
    }
    for (const p of safeManuals) {
      if (p && p.symbol) await putManualPrice(p);
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
