import { useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, RefreshCw, AlertCircle, CloudUpload, CloudDownload, CheckCircle2, Loader2, Info, Bookmark, Trash2, Plus } from 'lucide-react';
import type { PortfolioSummary, Holding } from '@/lib/types';
import { formatCurrency, formatPercent, formatNumber, timeAgo } from '@/lib/format';
import { HoldingEditModal } from '@/components/HoldingEditModal';
import { useWatchlist } from '@/hooks/useWatchlist';

interface DashboardProps {
  summary: PortfolioSummary;
  holdings: Holding[];
  transactions: import('@/lib/types').Transaction[];
  currentPrices: Map<string, number>;
  refreshing: boolean;
  lastRefresh: number | null;
  error: string | null;
  onRefresh: () => void;
  onICloudSync: () => void;
  onICloudLoad?: (data: import('@/lib/types').PortfolioExport) => Promise<void> | void;
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

export function Dashboard({
  summary,
  holdings,
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
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.transactions)) {
        throw new Error('Ungültiges Portfolio-Format');
      }
      if (onICloudLoad) {
        await onICloudLoad(data);
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
          onClick={onICloudSync}
          disabled={syncing || safeHoldings.length === 0}
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
            <div className="flex items-center gap-1.5">
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
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {watchlist.items.map((item, idx) => {
                  const quote = watchlist.quotes.get(item.symbol);
                  const price = quote && quote.price > 0 ? quote.price : item.lastPrice || 0;
                  const changePct = quote && typeof quote.changePercent === 'number' ? quote.changePercent : item.lastChangePercent || 0;

                  return (
                    <div
                      key={`${item.symbol}-${idx}`}
                      className={`p-2.5 -mx-2.5 rounded-xl hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors flex items-center justify-between gap-3 ${
                        idx > 0 ? 'pt-3.5 mt-2 border-t border-gray-100 dark:border-gray-800' : ''
                      }`}
                    >
                      {/* Linke Seite: Symbol & Name & Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white">
                            {item.symbol}
                          </span>
                          {item.isin && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-mono">
                              {item.isin}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {item.name || item.symbol}
                        </p>
                        {item.notes && (
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5 italic">
                            "{item.notes}"
                          </p>
                        )}
                      </div>

                      {/* Rechte Seite: Live Kurs & Tages-% & Aktionen */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white block">
                            {price > 0 ? formatCurrency(price) : '—'}
                          </span>
                          <div className="text-xs flex items-center justify-end gap-0.5 mt-0.5">
                            {changePct > 0.001 ? (
                              <span className="flex items-center gap-0.5 font-semibold text-green-600 dark:text-green-400">
                                <span className="text-[10px] font-bold">↑</span>
                                <span>{formatNumber(Math.abs(changePct), 2)}%</span>
                              </span>
                            ) : changePct < -0.001 ? (
                              <span className="flex items-center gap-0.5 font-semibold text-red-600 dark:text-red-400">
                                <span className="text-[10px] font-bold">↓</span>
                                <span>{formatNumber(Math.abs(changePct), 2)}%</span>
                              </span>
                            ) : (
                              <span className="font-medium text-gray-400 dark:text-gray-500">0,00%</span>
                            )}
                          </div>
                        </div>

                        {/* Kaufen Button */}
                        <button
                          type="button"
                          onClick={() =>
                            onOpenTransactionModal?.('buy', {
                              symbol: item.symbol,
                              name: item.name,
                              price: price > 0 ? price : undefined,
                              isin: item.isin,
                              wkn: item.wkn,
                              notes: item.notes,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 text-xs font-semibold flex items-center gap-1 transition-colors active:scale-95"
                          title="Ins Portfolio übernehmen (Kaufen)"
                        >
                          <Plus size={12} />
                          <span className="hidden xs:inline">Kaufen</span>
                        </button>

                        {/* Löschen Button */}
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
                  );
                })}
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
