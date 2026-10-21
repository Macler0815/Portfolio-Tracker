import { useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, RefreshCw, AlertCircle, CloudUpload, CloudDownload, CheckCircle2, Loader2, Info, ArrowUp, ArrowDown } from 'lucide-react';
import type { PortfolioSummary, Holding } from '@/lib/types';
import { formatCurrency, formatPercent, formatNumber, timeAgo } from '@/lib/format';

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
}

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

      {/* Alle Positionen */}
      {safeHoldings.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Alle Positionen</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {safeHoldings.map((h, idx) => {
              if (!h) return null;
              const quantity = Math.round(h.quantity || 0);
              const price = typeof h.currentPrice === 'number' && !isNaN(h.currentPrice)
                ? h.currentPrice
                : typeof h.price === 'number' && !isNaN(h.price)
                ? h.price
                : 0;
              const totalValue = (quantity > 0 && price > 0)
                ? (quantity * price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
                : '—';
              const symbol = h.symbol || '—';
              const name = h.name || symbol;
              const buyPrice = h.avgBuyPrice || 0;
              const priceDiff = price > 0 && buyPrice > 0 ? price - buyPrice : 0;
              const pctChange = buyPrice > 0 && price > 0 ? ((price - buyPrice) / buyPrice) * 100 : 0;
              const priceColorClass =
                priceDiff > 0.0001
                  ? 'text-green-600 dark:text-green-400 font-semibold'
                  : priceDiff < -0.0001
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : 'text-gray-500 dark:text-gray-400 font-medium';

              return (
                <div key={h.symbol ? `${h.symbol}-${idx}` : `pos-${idx}`} className={`space-y-2 ${idx > 0 ? 'pt-3.5 mt-3.5' : ''}`}>
                  {/* 1. THE ASSET BLOCK (Top Line) */}
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {symbol} · {name}
                  </p>

                  {/* 2. THE NUMERIC FINANCIAL GRID (Bottom Line) */}
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-left">
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Menge</span>
                      <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white block mt-0.5 truncate">
                        {formatNumber(quantity, 0)} Stk.
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Kaufkurs</span>
                      <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 block mt-0.5 truncate">
                        {formatCurrency(buyPrice)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Aktuell</span>
                      <span className={`text-xs sm:text-sm block mt-0.5 truncate ${priceColorClass}`}>
                        {price > 0 ? formatCurrency(price) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">+-%</span>
                      <div className="mt-0.5">
                        {pctChange > 0.001 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs sm:text-sm font-semibold text-green-600 dark:text-green-400 truncate">
                            <ArrowUp size={12} className="shrink-0" />
                            {formatNumber(Math.abs(pctChange), 2)}%
                          </span>
                        ) : pctChange < -0.001 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400 truncate">
                            <ArrowDown size={12} className="shrink-0" />
                            {formatNumber(Math.abs(pctChange), 2)}%
                          </span>
                        ) : (
                          <span className="text-xs sm:text-sm font-medium text-gray-400 dark:text-gray-500 block truncate">
                            0,00%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Gesamtwert</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white block mt-0.5 truncate">
                        {totalValue}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {safeHoldings.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Wallet size={28} className="text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Noch keine Positionen</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Tippe auf das + um deine erste Transaktion hinzuzufügen</p>
        </div>
      )}
    </div>
  );
}
