import { TrendingUp, TrendingDown, Wallet, PiggyBank, RefreshCw, AlertCircle, CloudUpload, CheckCircle2, Loader2, Info } from 'lucide-react';
import type { PortfolioSummary, Holding } from '@/lib/types';
import { formatCurrency, formatPercent, timeAgo } from '@/lib/format';

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
  syncing: boolean;
  syncDone: boolean;
  hasApiKey: boolean;
}

export function Dashboard({ summary, holdings, refreshing, lastRefresh, error, onRefresh, onICloudSync, syncing, syncDone, hasApiKey }: DashboardProps) {
  const plPositive = summary.totalPL >= 0;

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

      {/* iCloud Sync Button */}
      <button
        onClick={onICloudSync}
        disabled={syncing || holdings.length === 0}
        className="w-full flex items-center justify-between rounded-2xl bg-green-600 text-white px-5 py-4 shadow-lg shadow-green-600/20 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
      >
        <div className="flex items-center gap-3">
          {syncing ? (
            <Loader2 size={22} className="animate-spin" />
          ) : syncDone ? (
            <CheckCircle2 size={22} />
          ) : (
            <CloudUpload size={22} />
          )}
          <div className="text-left">
            <p className="text-sm font-semibold">
              {syncing ? 'Backup wird erstellt…' : syncDone ? 'Gesichert!' : 'iCloud-Backup'}
            </p>
            <p className="text-xs text-green-100">
              {syncDone ? 'portfolio.json bereitgestellt' : 'Tippe hier, um deine Daten für iPad/Mac in der iCloud bereitzustellen.'}
            </p>
          </div>
        </div>
        {!syncing && !syncDone && (
          <span className="text-xs font-medium text-green-100 bg-white/20 rounded-full px-2.5 py-1 shrink-0">
            iCloud
          </span>
        )}
      </button>

      {!hasApiKey && holdings.length > 0 && (
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

      {/* Total Value Card */}
      <div className="rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-800 dark:to-gray-900 p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-gray-400 mb-1">
          <Wallet size={16} />
          <span className="text-sm font-medium">Gesamtwert</span>
        </div>
        <p className="text-4xl font-bold tracking-tight">{formatCurrency(summary.totalValue)}</p>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            {plPositive ? <TrendingUp size={18} className="text-green-400" /> : <TrendingDown size={18} className="text-red-400" />}
            <span className={`text-lg font-semibold ${plPositive ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(Math.abs(summary.totalPL))}
            </span>
            <span className={`text-sm ${plPositive ? 'text-green-400' : 'text-red-400'}`}>
              {formatPercent(summary.totalPLPercent)}
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
          <div>
            <div className="flex items-center gap-1.5 text-gray-400 mb-0.5">
              <PiggyBank size={14} />
              <span className="text-xs">Investiert</span>
            </div>
            <p className="text-sm font-semibold">{formatCurrency(summary.totalInvested)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400 block mb-0.5">Positionen</span>
            <p className="text-sm font-semibold">{holdings.length}</p>
          </div>
        </div>
      </div>

      {/* Alle Positionen */}
      {holdings.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Alle Positionen</h2>
          <div className="space-y-3">
            {holdings.map((h, idx) => {
              const quantity = Math.round(h?.quantity || 0);
              const price = typeof h?.currentPrice === 'number' && !isNaN(h.currentPrice) ? h.currentPrice : 0;
              const totalValue = (quantity && price && price > 0)
                ? (quantity * price).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
                : '—';
              const rowKey = h?.symbol ? `${h.symbol}-${idx}` : `pos-${idx}`;

              return (
                <div key={rowKey} className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {h?.name || h?.symbol || 'Position'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {h?.symbol || '—'} · {quantity.toLocaleString('de-DE', { maximumFractionDigits: 0 })} Stück
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 text-right shrink-0">
                    <div>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 block">Kaufkurs</span>
                      <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                        {formatCurrency(h?.avgBuyPrice || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 block">Aktuell</span>
                      <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white">
                        {price > 0 ? formatCurrency(price) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 block">Gesamtwert</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
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

      {holdings.length === 0 && (
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
