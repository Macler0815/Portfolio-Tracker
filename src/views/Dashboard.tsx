import { TrendingUp, TrendingDown, Wallet, PiggyBank, RefreshCw, AlertCircle, CloudUpload, CheckCircle2, Loader2, Info } from 'lucide-react';
import type { PortfolioSummary, Holding } from '@/lib/types';
import { formatCurrency, formatPercent, timeAgo } from '@/lib/format';
import { DonutChart } from '@/components/DonutChart';
import { PerformanceChart } from '@/components/PerformanceChart';
import { getAllocationByType, getTopAllocations } from '@/lib/calculations';

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

export function Dashboard({ summary, holdings, transactions, currentPrices, refreshing, lastRefresh, error, onRefresh, onICloudSync, syncing, syncDone, hasApiKey }: DashboardProps) {
  const alloc = getAllocationByType(holdings);
  const topAllocations = getTopAllocations(holdings, 8);
  const plPositive = summary.totalPL >= 0;

  const donutSegments = [
    { label: 'Aktien', value: alloc.stocks, color: '#1d8643' },
    { label: 'ETFs', value: alloc.etfs, color: '#2563eb' },
  ];

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

      {/* Asset Allocation */}
      {holdings.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Asset Allocation</h2>
          <div className="flex items-center gap-6">
            <DonutChart
              segments={donutSegments}
              centerLabel="Total"
              centerValue={formatCurrency(summary.totalValue, 'EUR', true)}
              size={160}
            />
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#1d8643]" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Aktien</span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {summary.totalValue > 0 ? ((alloc.stocks / summary.totalValue) * 100).toFixed(1) : '0'}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#2563eb]" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">ETFs</span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {summary.totalValue > 0 ? ((alloc.etfs / summary.totalValue) * 100).toFixed(1) : '0'}%
                </span>
              </div>
            </div>
          </div>

          {topAllocations.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2.5">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Top Positionen</p>
              {topAllocations.map((a) => (
                <div key={a.symbol} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white shrink-0 ml-2">{a.percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Performance Chart */}
      {transactions.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Performance</h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <span className="w-4 h-0.5 bg-[#1d8643]" /> Portfolio
              </span>
              <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <span className="w-4 h-0.5 border-t border-dashed border-gray-400" /> Investiert
              </span>
            </div>
          </div>
          <PerformanceChart transactions={transactions} currentPrices={currentPrices} height={180} />
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
