import { useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, RefreshCw, AlertCircle, CloudUpload, CloudDownload, CheckCircle2, Loader2, Info, Bookmark, Trash2, Plus } from 'lucide-react';
import type { PortfolioSummary, Holding, PortfolioExport } from '@/lib/types';
import { formatCurrency, formatPercent, formatNumber, timeAgo } from '@/lib/format';
import { HoldingEditModal } from '@/components/HoldingEditModal';
import { useWatchlist } from '@/hooks/useWatchlist';
import { getWatchlistItemAssetType, saveWatchlist } from '@/lib/watchlist';
import { getPortfolioHistory, savePortfolioHistory } from '@/lib/history';

interface DashboardProps {
  summary: PortfolioSummary;
  holdings: Holding[];
  transactions: import('@/lib/types').Transaction[];
  currentPrices: Map<string, number>;
  refreshing: boolean;
  lastRefresh: number | null;
  error: string | null;
  onRefresh: () => void;
  onICloudSync?: (exportData?: PortfolioExport) => void | Promise<void>;
  onICloudLoad?: (data: PortfolioExport) => Promise<void> | void;
  syncing: boolean;
  syncDone: boolean;
  hasApiKey: boolean;
  onUpdateHolding?: (oldSymbol: string, updated: {
    symbol: string;
    name: string;
    quantity: number;
    avgBuyPrice: number;
    broker?: string;
    isin?: string;
    wkn?: string;
    notes?: string;
  }) => Promise<void> | void;
  onDeleteHolding?: (symbol: string) => Promise<void> | void;
  onEditHolding?: (holding: Holding) => void;
  onOpenTransactionModal?: (tab?: 'buy' | 'sell' | 'watchlist', data?: {
    symbol?: string;
    name?: string;
    price?: number;
    isin?: string;
    wkn?: string;
    notes?: string;
  }) => void;
}

export type PositionSortKey = 'marketValue' | 'dailyChangePercent' | 'plPercent' | 'currentPrice' | 'avgBuyPrice';
export type WatchlistSortKey = 'perfSinceAdded' | 'dailyChange' | 'name';
export type WatchlistCategory = 'all' | 'stock' | 'etf';

export function Dashboard({
  summary,
  holdings,
  transactions,
  refreshing,
  lastRefresh,
  error,
  onRefresh,
  onICloudSync,
  onICloudLoad,
  syncing,
  syncDone,
  hasApiKey,
  onUpdateHolding,
  onDeleteHolding,
  onEditHolding,
  onOpenTransactionModal,
}: DashboardProps) {
  const safeSummary = summary || {
    totalValue: 0,
    totalInvested: 0,
    totalPL: 0,
    totalPLPercent: 0,
    holdings: [],
  };
  const safeHoldings = Array.isArray(holdings) ? holdings.filter(Boolean) : [];
  const plPositive = (safeSummary.totalPL || 0) >= 0;
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<PositionSortKey>('marketValue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [sectionTab, setSectionTab] = useState<'positions' | 'watchlist'>('positions');
  const [watchlistCategory, setWatchlistCategory] = useState<WatchlistCategory>('all');
  const [watchlistSortBy, setWatchlistSortBy] = useState<WatchlistSortKey>('perfSinceAdded');
  const [watchlistSortOrder, setWatchlistSortOrder] = useState<'asc' | 'desc'>('desc');
  const watchlist = useWatchlist();

  const handleUpdateHolding = async (oldSymbol: string, updated: {
    symbol: string;
    name: string;
    quantity: number;
    avgBuyPrice: number;
    broker?: string;
    isin?: string;
    wkn?: string;
    notes?: string;
  }) => {
    if (onUpdateHolding) {
      await onUpdateHolding(oldSymbol, updated);
    }
    setEditingHolding(null);
  };

  const handleDeleteHolding = async (symbol: string) => {
    if (onDeleteHolding) {
      await onDeleteHolding(symbol);
    }
    setEditingHolding(null);
  };

  const handleExportClick = () => {
    const exportData: PortfolioExport = {
      version: '1.1',
      exportDate: new Date().toISOString(),
      exportedAt: Date.now(),
      holdings: safeHoldings,
      watchlist: watchlist.items,
      portfolio_history: getPortfolioHistory(),
      transactions: transactions || [],
    };
    if (onICloudSync) {
      onICloudSync(exportData);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadState('loading');
    setLoadError(null);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        if (typeof file.text === 'function') {
          file.text().then(resolve).catch(reject);
        } else {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file);
        }
      });
      const parsedData = JSON.parse(text);
      if (
        !parsedData ||
        (!Array.isArray(parsedData.transactions) &&
          !Array.isArray(parsedData.holdings) &&
          !Array.isArray(parsedData.watchlist))
      ) {
        throw new Error('Ungültiges Portfolio-Format');
      }

      // 1. Restore Watchlist if present in backup (Requirement 2 & 3)
      if (parsedData.watchlist && Array.isArray(parsedData.watchlist)) {
        saveWatchlist(parsedData.watchlist);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('portfolio_watchlist', JSON.stringify(parsedData.watchlist));
          } catch (storageErr) {
            console.warn('Error saving imported watchlist to localStorage:', storageErr);
          }
        }
      }

      // 2. Restore Portfolio History if present in backup
      if (
        parsedData.portfolio_history &&
        typeof parsedData.portfolio_history === 'object' &&
        !Array.isArray(parsedData.portfolio_history)
      ) {
        savePortfolioHistory(parsedData.portfolio_history);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              'portfolio_history',
              JSON.stringify(parsedData.portfolio_history)
            );
          } catch (storageErr) {
            console.warn('Error saving imported portfolio_history to localStorage:', storageErr);
          }
        }
      }

      // 3. Restore Holdings / Transactions
      if (onICloudLoad) {
        await onICloudLoad(parsedData);
      }
      setLoadState('done');
      setTimeout(() => setLoadState('idle'), 3000);
    } catch (err) {
      console.error('iCloud-Laden Fehler:', err);
      setLoadState('error');
      setLoadError('Datei konnte nicht geladen werden');
      setTimeout(() => setLoadState('idle'), 4000);
    } finally {
      e.target.value = '';
    }
  };

  const sortedHoldings = [...safeHoldings].sort((a, b) => {
    let valA = 0;
    let valB = 0;

    switch (sortBy) {
      case 'marketValue':
        valA = (a.quantity || 0) * (a.currentPrice || a.price || 0);
        valB = (b.quantity || 0) * (b.currentPrice || b.price || 0);
        break;
      case 'dailyChangePercent':
        valA = typeof a.dailyChangePercent === 'number' ? a.dailyChangePercent : 0;
        valB = typeof b.dailyChangePercent === 'number' ? b.dailyChangePercent : 0;
        break;
      case 'plPercent': {
        const buyA = a.avgBuyPrice || 0;
        const priceA = a.currentPrice || a.price || 0;
        valA = buyA > 0 ? ((priceA - buyA) / buyA) * 100 : 0;
        
        const buyB = b.avgBuyPrice || 0;
        const priceB = b.currentPrice || b.price || 0;
        valB = buyB > 0 ? ((priceB - buyB) / buyB) * 100 : 0;
        break;
      }
      case 'currentPrice':
        valA = a.currentPrice || a.price || 0;
        valB = b.currentPrice || b.price || 0;
        break;
      case 'avgBuyPrice':
        valA = a.avgBuyPrice || 0;
        valB = b.avgBuyPrice || 0;
        break;
    }

    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const stockCount = watchlist.items.filter((item) => getWatchlistItemAssetType(item) === 'stock').length;
  const etfCount = watchlist.items.filter((item) => getWatchlistItemAssetType(item) === 'etf').length;

  const filteredWatchlist = watchlist.items.filter((item) => {
    if (watchlistCategory === 'all') return true;
    return getWatchlistItemAssetType(item) === watchlistCategory;
  });

  const sortedWatchlist = [...filteredWatchlist].sort((a, b) => {
    const quoteA = watchlist.quotes.get(a.symbol) || watchlist.quotes.get(a.symbol.toUpperCase());
    const priceA = quoteA && quoteA.price > 0 ? quoteA.price : (a.lastPrice || 0);
    const addedA = a.addedPrice || 0;
    const perfPctA = addedA > 0 && priceA > 0 ? ((priceA - addedA) / addedA) * 100 : (addedA === 0 && priceA > 0 ? 0 : -999999);
    const dailyChangeA = quoteA && typeof quoteA.changePercent === 'number' ? quoteA.changePercent : (a.lastChangePercent || 0);

    const quoteB = watchlist.quotes.get(b.symbol) || watchlist.quotes.get(b.symbol.toUpperCase());
    const priceB = quoteB && quoteB.price > 0 ? quoteB.price : (b.lastPrice || 0);
    const addedB = b.addedPrice || 0;
    const perfPctB = addedB > 0 && priceB > 0 ? ((priceB - addedB) / addedB) * 100 : (addedB === 0 && priceB > 0 ? 0 : -999999);
    const dailyChangeB = quoteB && typeof quoteB.changePercent === 'number' ? quoteB.changePercent : (b.lastChangePercent || 0);

    let comparison = 0;
    if (watchlistSortBy === 'perfSinceAdded') {
      comparison = perfPctA - perfPctB;
    } else if (watchlistSortBy === 'dailyChange') {
      comparison = dailyChangeA - dailyChangeB;
    } else if (watchlistSortBy === 'name') {
      const nameA = a.name || a.symbol;
      const nameB = b.name || b.symbol;
      comparison = nameA.localeCompare(nameB, 'de', { sensitivity: 'base' });
    }

    return watchlistSortOrder === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="px-4 pt-2 pb-24 space-y-5 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Portfolio</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {lastRefresh ? `Aktualisiert ${timeAgo(lastRefresh)}` : 'Bereit'}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-transform disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          <span className="hidden xs:inline">Aktualisieren</span>
        </button>
      </div>

      {/* iCloud-Speichern & iCloud-Laden */}
      <div className="grid grid-cols-2 gap-2">
        {/* iCloud-Speichern Button */}
        <button
          type="button"
          onClick={handleExportClick}
          disabled={syncing || (safeHoldings.length === 0 && watchlist.items.length === 0)}
          className="w-full flex items-center justify-center rounded-2xl bg-green-600 text-white px-4 py-4 shadow-lg shadow-green-600/20 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
        >
          <div className="flex items-center gap-2">
            {syncing ? (
              <Loader2 size={20} className="animate-spin shrink-0" />
            ) : syncDone ? (
              <CheckCircle2 size={20} className="shrink-0" />
            ) : (
              <CloudUpload size={20} className="shrink-0" />
            )}
            <span className="text-sm font-semibold whitespace-nowrap">
              {syncing ? 'Sichert…' : syncDone ? 'Gesichert!' : 'iCloud-Speichern'}
            </span>
          </div>
        </button>

        {/* iCloud-Laden Button (Native iOS Label) */}
        <label
          className={`w-full flex items-center justify-center rounded-2xl bg-gray-500 text-white px-4 py-4 shadow-lg shadow-gray-500/20 active:scale-[0.98] transition-transform cursor-pointer select-none ${
            loadState === 'loading' ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="sr-only"
            disabled={loadState === 'loading'}
          />
          <div className="flex items-center gap-2">
            {loadState === 'loading' ? (
              <Loader2 size={20} className="animate-spin shrink-0" />
            ) : loadState === 'done' ? (
              <CheckCircle2 size={20} className="shrink-0" />
            ) : loadState === 'error' ? (
              <AlertCircle size={20} className="shrink-0 text-red-200" />
            ) : (
              <CloudDownload size={20} className="shrink-0" />
            )}
            <span className="text-sm font-semibold whitespace-nowrap">
              {loadState === 'loading'
                ? 'Lädt…'
                : loadState === 'done'
                ? 'Geladen!'
                : loadState === 'error'
                ? loadError || 'Fehler!'
                : 'iCloud-Laden'}
            </span>
          </div>
        </label>
      </div>

      {!hasApiKey && safeHoldings.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3.5 py-3">
          <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Bitte trage in den Einstellungen einen kostenlosen API-Schlüssel ein, um Live-Kurse zu aktivieren.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3.5 py-3">
          <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
        </div>
      )}

      {/* Total Value Card (Ultra-Kompakt) */}
<div className="rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 p-3.5 text-white shadow-md">
  {/* Zeile 1: Label mit Icon & Gesamtwert-Betrag */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1.5 text-gray-300">
      <Wallet size={16} className="text-gray-400" />
      <span className="text-sm font-medium">Gesamtwert</span>
    </div>
    <p className="text-2xl font-bold tracking-tight">{formatCurrency(safeSummary.totalValue)}</p>
  </div>

  {/* Zeile 2: P/L & Sekundärinfos */}
  <div className="mt-2 flex items-center justify-between pt-2 border-t border-white/10 text-xs">
    {/* Gewinn / Verlust */}
    <div className="flex items-center gap-1">
      {plPositive ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-red-400" />}
      <span className={`font-semibold ${plPositive ? 'text-green-400' : 'text-red-400'}`}>
        {formatCurrency(Math.abs(safeSummary.totalPL))}
      </span>
      <span className={plPositive ? 'text-green-400' : 'text-red-400'}>
        ({formatPercent(safeSummary.totalPLPercent)})
      </span>
    </div>

    {/* Investiert & Positionen */}
    <div className="flex items-center gap-2 text-gray-400">
      <span>Inv: <strong className="text-white font-medium">{formatCurrency(safeSummary.totalInvested)}</strong></span>
      <span>•</span>
      <span>Pos: <strong className="text-white font-medium">{safeHoldings.length}</strong></span>
    </div>
  </div>
</div>

      {/* Segmented Section: Alle Positionen & Watchlisten */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4">
          {/* Segmented Tab Switcher */}
          <div className="inline-flex items-center p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            <button
              type="button"
              onClick={() => setSectionTab('positions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                sectionTab === 'positions'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Alle Positionen ({safeHoldings.length})
            </button>
            <button
              type="button"
              onClick={() => setSectionTab('watchlist')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                sectionTab === 'watchlist'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Bookmark size={13} className={sectionTab === 'watchlist' ? 'text-amber-500 fill-amber-500/20' : ''} />
              <span>Watchlisten ({watchlist.items.length})</span>
            </button>
          </div>

          {sectionTab === 'positions' ? (
            /* Sortier-Optionen */
            safeHoldings.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as PositionSortKey)}
                  className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="marketValue">Gesamtwert</option>
                  <option value="dailyChangePercent">Tages- %</option>
                  <option value="plPercent">+-%</option>
                  <option value="currentPrice">Aktuell</option>
                  <option value="avgBuyPrice">Kaufkurs</option>
                </select>

                <button
                  onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="p-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-semibold"
                  title={sortOrder === 'asc' ? 'Aufsteigend' : 'Absteigend'}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            )
          ) : (
            /* Watchlist Toolbar */
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {watchlist.items.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={watchlistSortBy}
                    onChange={(e) => setWatchlistSortBy(e.target.value as WatchlistSortKey)}
                    className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Watchlist sortieren nach"
                  >
                    <option value="perfSinceAdded">Performance seit Einstieg</option>
                    <option value="dailyChange">Tages-%</option>
                    <option value="name">Name / Symbol</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setWatchlistSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="p-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-semibold"
                    title={watchlistSortOrder === 'asc' ? 'Aufsteigend' : 'Absteigend'}
                    aria-label={watchlistSortOrder === 'asc' ? 'Aufsteigend sortieren' : 'Absteigend sortieren'}
                  >
                    {watchlistSortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => watchlist.refreshQuotes()}
                disabled={watchlist.refreshing || watchlist.items.length === 0}
                className="p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                title="Watchlist-Kurse aktualisieren"
              >
                <RefreshCw size={14} className={watchlist.refreshing ? 'animate-spin text-blue-500' : ''} />
              </button>
              <button
                type="button"
                onClick={() => onOpenTransactionModal ? onOpenTransactionModal('watchlist') : undefined}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors shadow-xs"
              >
                <Plus size={13} />
                <span>Hinzufügen</span>
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: ALLE POSITIONEN */}
        {sectionTab === 'positions' && (
          <>
            {safeHoldings.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {sortedHoldings.map((h, idx) => {
                  if (!h) return null;
                  const quantity = Math.round(h.quantity || 0);
                  const price =
                    typeof h.currentPrice === 'number' && !isNaN(h.currentPrice)
                      ? h.currentPrice
                      : typeof h.price === 'number' && !isNaN(h.price)
                      ? h.price
                      : 0;
                  const totalValue =
                    quantity > 0 && price > 0
                      ? (quantity * price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
                      : '—';
                  const symbol = h.symbol || '—';
                  const name = h.name || symbol;
                  const rawBuyPrice =
                    typeof h.avgBuyPrice === 'number' && !isNaN(h.avgBuyPrice)
                      ? h.avgBuyPrice
                      : parseFloat(String(h.avgBuyPrice || 0)) || 0;
                  const buyPrice = Math.max(0, rawBuyPrice);
                  const priceDiff = price > 0 && buyPrice > 0 ? price - buyPrice : 0;
                  const pctChange = buyPrice > 0 && price > 0 ? ((price - buyPrice) / buyPrice) * 100 : 0;
                  const priceColorClass =
                    priceDiff > 0.0001
                      ? 'text-green-600 dark:text-green-400 font-semibold'
                      : priceDiff < -0.0001
                      ? 'text-red-600 dark:text-red-400 font-semibold'
                      : 'text-gray-500 dark:text-gray-400 font-medium';

                  return (
                    <div
                      key={h.symbol ? `${h.symbol}-${idx}` : `pos-${idx}`}
                      onClick={() => {
                        if (onEditHolding) {
                          onEditHolding(h);
                        } else {
                          setEditingHolding(h);
                        }
                      }}
                      className={`space-y-2 cursor-pointer hover:border-gray-300 dark:hover:border-gray-700 transition-colors p-2.5 -mx-2.5 rounded-xl hover:bg-gray-50/70 dark:hover:bg-gray-800/40 active:scale-[0.99] ${
                        idx > 0 ? 'pt-3.5 mt-3.5 border-t border-gray-100 dark:border-gray-800' : ''
                      }`}
                    >
                      {/* 1. THE ASSET BLOCK (Top Line) */}
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {formatNumber(quantity, 0)} Stk. · {symbol} · {name}
                      </p>

                      {/* 2. THE NUMERIC FINANCIAL GRID (Bottom Line) */}
                      <div className="grid grid-cols-[1fr_1fr_0.85fr_0.85fr_1.3fr] gap-1 sm:gap-2 text-left items-center">
                        {/* Kaufkurs */}
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">Kaufkurs</span>
                          <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 block mt-0.5 truncate">
                            {formatCurrency(buyPrice)}
                          </span>
                        </div>

                        {/* Aktuell */}
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">Aktuell</span>
                          <span className={`text-xs sm:text-sm block mt-0.5 truncate ${priceColorClass}`}>
                            {price > 0 ? formatCurrency(price) : '—'}
                          </span>
                        </div>

                        {/* Total % (+-%) */}
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">+-%</span>
                          <div className="text-xs sm:text-sm mt-0.5 h-5 flex items-baseline truncate">
                            {pctChange > 0.001 ? (
                              <span className="flex items-baseline gap-0.5 font-semibold text-green-600 dark:text-green-400">
                                <span className="text-[9px] sm:text-xs font-bold self-center">↑</span>
                                <span>{formatNumber(Math.abs(pctChange), 2)}</span>
                              </span>
                            ) : pctChange < -0.001 ? (
                              <span className="flex items-baseline gap-0.5 font-semibold text-red-600 dark:text-red-400">
                                <span className="text-[9px] sm:text-xs font-bold self-center">↓</span>
                                <span>{formatNumber(Math.abs(pctChange), 2)}</span>
                              </span>
                            ) : (
                              <span className="font-medium text-gray-400 dark:text-gray-500">0,00</span>
                            )}
                          </div>
                        </div>

                        {/* Daily % (Tages- %) */}
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">Tages- %</span>
                          <div className="text-xs sm:text-sm mt-0.5 h-5 flex items-baseline truncate">
                            {(() => {
                              const dailyChangePct = typeof h.dailyChangePercent === 'number' ? h.dailyChangePercent : 0;
                              return dailyChangePct > 0.001 ? (
                                <span className="flex items-baseline gap-0.5 font-semibold text-green-600 dark:text-green-400">
                                  <span className="text-[9px] sm:text-xs font-bold self-center">↑</span>
                                  <span>{formatNumber(Math.abs(dailyChangePct), 2)}</span>
                                </span>
                              ) : dailyChangePct < -0.001 ? (
                                <span className="flex items-baseline gap-0.5 font-semibold text-red-600 dark:text-red-400">
                                  <span className="text-[9px] sm:text-xs font-bold self-center">↓</span>
                                  <span>{formatNumber(Math.abs(dailyChangePct), 2)}</span>
                                </span>
                              ) : (
                                <span className="font-medium text-gray-400 dark:text-gray-500">—</span>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Gesamtwert */}
                        <div className="min-w-0 text-right">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">Gesamtwert</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white block mt-0.5 truncate">
                            {totalValue}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <Wallet size={24} className="text-gray-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-semibold text-sm">Noch keine Positionen</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Erfasse deine erste Transaktion, um deinen Portfolio-Wert zu tracken.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenTransactionModal ? onOpenTransactionModal('buy') : undefined}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors shadow-xs"
                >
                  <Plus size={14} />
                  <span>Position hinzufügen</span>
                </button>
              </div>
            )}
          </>
        )}

        {/* TAB 2: WATCHLISTEN */}
        {sectionTab === 'watchlist' && (
          <>
            {watchlist.items.length > 0 ? (
              <div className="space-y-3">
                {/* Kategorie-Filter (Alle | Aktien | ETFs) */}
                <div className="flex items-center gap-1.5 pb-1 overflow-x-auto scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setWatchlistCategory('all')}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                      watchlistCategory === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Alle ({watchlist.items.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWatchlistCategory('stock')}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                      watchlistCategory === 'stock'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Aktien ({stockCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setWatchlistCategory('etf')}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                      watchlistCategory === 'etf'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    ETFs ({etfCount})
                  </button>
                </div>

                {sortedWatchlist.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {sortedWatchlist.map((item, idx) => {
                      const quote = watchlist.quotes.get(item.symbol) || watchlist.quotes.get(item.symbol.toUpperCase());
                      const currentPrice = quote && quote.price > 0 ? quote.price : item.lastPrice || 0;
                      const dailyChangePct =
                        quote && typeof quote.changePercent === 'number'
                          ? quote.changePercent
                          : item.lastChangePercent || 0;

                      const addedPrice = typeof item.addedPrice === 'number' && item.addedPrice > 0 ? item.addedPrice : 0;
                      const hasAddedPrice = addedPrice > 0 && currentPrice > 0;
                      const perfDiff = hasAddedPrice ? currentPrice - addedPrice : 0;
                      const perfPct = hasAddedPrice ? ((currentPrice - addedPrice) / addedPrice) * 100 : 0;
                      const assetType = getWatchlistItemAssetType(item);

                      return (
                        <div
                          key={`${item.symbol}-${idx}`}
                          className={`space-y-2 p-3 -mx-2.5 rounded-xl hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors ${
                            idx > 0 ? 'pt-3.5 mt-2 border-t border-gray-100 dark:border-gray-800' : ''
                          }`}
                        >
                          {/* Zeile 1: Ticker, Name, Badges & Aktionen (Kaufen, Löschen) */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-sm text-gray-900 dark:text-white">
                                {item.symbol}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px] sm:max-w-xs">
                                · {item.name || item.symbol}
                              </span>
                              <span
                                className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                                  assetType === 'etf'
                                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                                    : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                }`}
                              >
                                {assetType === 'etf' ? 'ETF' : 'Aktie'}
                              </span>
                              {item.isin && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono">
                                  {item.isin}
                                </span>
                              )}
                            </div>

                        {/* Buttons: Kaufen & Löschen */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenTransactionModal?.('buy', {
                                symbol: item.symbol,
                                name: item.name,
                                price: currentPrice > 0 ? currentPrice : undefined,
                                isin: item.isin,
                                wkn: item.wkn,
                                notes: item.notes,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 text-xs font-semibold flex items-center gap-1 transition-colors active:scale-95"
                            title="Ins Portfolio übernehmen (Kaufen)"
                          >
                            <Plus size={12} />
                            <span className="hidden xs:inline">Kaufen</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => watchlist.removeItem(item.symbol)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Aus Watchliste entfernen"
                            aria-label={`${item.symbol} aus Watchliste entfernen`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Zeile 2: Financial Grid: Einstieg | Aktuell | Seit Einstieg | Tages- % */}
                      <div className="grid grid-cols-[1fr_1fr_1.3fr_0.8fr] gap-1 sm:gap-2 text-left items-center pt-0.5">
                        {/* Einstiegspreis */}
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">
                            Einstieg
                          </span>
                          <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 block mt-0.5 truncate">
                            {addedPrice > 0 ? formatCurrency(addedPrice) : '—'}
                          </span>
                        </div>

                        {/* Aktueller Kurs */}
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">
                            Aktuell
                          </span>
                          <span
                            className={`text-xs sm:text-sm block mt-0.5 truncate ${
                              perfDiff > 0.0001
                                ? 'text-green-600 dark:text-green-400 font-semibold'
                                : perfDiff < -0.0001
                                ? 'text-red-600 dark:text-red-400 font-semibold'
                                : 'text-gray-900 dark:text-white font-medium'
                            }`}
                          >
                            {currentPrice > 0 ? formatCurrency(currentPrice) : '—'}
                          </span>
                        </div>

                        {/* Performance seit Hinzufügen (Differenz & %) */}
                        <div className="min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">
                            Seit Einstieg
                          </span>
                          <div className="text-xs sm:text-sm mt-0.5 h-5 flex items-baseline truncate">
                            {hasAddedPrice ? (
                              perfDiff > 0.001 ? (
                                <span className="flex items-baseline gap-0.5 font-semibold text-green-600 dark:text-green-400">
                                  <span className="text-[9px] sm:text-xs font-bold self-center">↑</span>
                                  <span>
                                    +{formatCurrency(perfDiff)} ({formatNumber(perfPct, 2)}%)
                                  </span>
                                </span>
                              ) : perfDiff < -0.001 ? (
                                <span className="flex items-baseline gap-0.5 font-semibold text-red-600 dark:text-red-400">
                                  <span className="text-[9px] sm:text-xs font-bold self-center">↓</span>
                                  <span>
                                    {formatCurrency(perfDiff)} ({formatNumber(perfPct, 2)}%)
                                  </span>
                                </span>
                              ) : (
                                <span className="font-medium text-gray-400 dark:text-gray-500">0,00 € (0,00%)</span>
                              )
                            ) : (
                              <span className="font-medium text-gray-400 dark:text-gray-500">—</span>
                            )}
                          </div>
                        </div>

                        {/* Tages- % */}
                        <div className="min-w-0 text-right">
                          <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 block truncate">
                            Tages- %
                          </span>
                          <div className="text-xs sm:text-sm mt-0.5 h-5 flex items-baseline justify-end truncate">
                            {dailyChangePct > 0.001 ? (
                              <span className="flex items-baseline gap-0.5 font-semibold text-green-600 dark:text-green-400">
                                <span className="text-[9px] sm:text-xs font-bold self-center">↑</span>
                                <span>{formatNumber(Math.abs(dailyChangePct), 2)}%</span>
                              </span>
                            ) : dailyChangePct < -0.001 ? (
                              <span className="flex items-baseline gap-0.5 font-semibold text-red-600 dark:text-red-400">
                                <span className="text-[9px] sm:text-xs font-bold self-center">↓</span>
                                <span>{formatNumber(Math.abs(dailyChangePct), 2)}%</span>
                              </span>
                            ) : (
                              <span className="font-medium text-gray-400 dark:text-gray-500">0,00%</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Optionale Notiz */}
                      {item.notes && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate italic pt-0.5">
                          „{item.notes}“
                        </p>
                      )}
                    </div>
                  );
                })}
                  </div>
                ) : (
                  <div className="text-center py-10 px-4">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Keine {watchlistCategory === 'stock' ? 'Aktien' : 'ETFs'} gefunden
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      In dieser Kategorie befinden sich aktuell keine beobachteten Titel.
                    </p>
                    <button
                      type="button"
                      onClick={() => setWatchlistCategory('all')}
                      className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      Alle Einträge anzeigen ({watchlist.items.length})
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 px-4">
                <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-500 flex items-center justify-center mx-auto mb-3">
                  <Bookmark size={24} />
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Deine Watchliste ist leer</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
                  Beobachte Aktien oder ETFs unverbindlich, um deren Kursentwicklung live zu verfolgen.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenTransactionModal ? onOpenTransactionModal('watchlist') : undefined}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors shadow-xs"
                >
                  <Plus size={14} />
                  <span>Wertpapier beobachten</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Holding Modal */}
      <HoldingEditModal
        open={!!editingHolding}
        holding={editingHolding}
        onClose={() => setEditingHolding(null)}
        onSave={handleUpdateHolding}
        onDelete={onDeleteHolding ? handleDeleteHolding : undefined}
      />
    </div>
  );
}
