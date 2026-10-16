import { AlertTriangle, Edit3 } from 'lucide-react';
import type { Holding, Transaction } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/format';
import { PerformanceChart } from '@/components/PerformanceChart';

interface HoldingsViewProps {
  holdings: Holding[];
  transactions: Transaction[];
  currentPrices: Map<string, number>;
  onEditPrice: (holding: Holding) => void;
}

export function HoldingsView({ holdings, transactions, currentPrices, onEditPrice }: HoldingsViewProps) {
  if (holdings.length === 0) {
    return (
      <div className="px-4 pt-2 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">Positionen</h1>
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400 font-medium">Keine Positionen vorhanden</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">Positionen</h1>

      <div className="space-y-3">
        {holdings.map((h, idx) => {
          const plPositive = (h?.pl || 0) >= 0;
          const quantity = Math.round(h?.quantity || 0);
          const rowKey = h?.symbol ? `${h.symbol}-${idx}` : `holding-${idx}`;
          return (
            <div key={rowKey} className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">{h?.name || h?.symbol || 'Position'}</h3>
                    {h?.priceSource === 'missing' && (
                      <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                    )}
                    {h?.priceSource === 'manual' && (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0">manuell</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {h?.symbol || '—'} · {quantity.toLocaleString('de-DE', { maximumFractionDigits: 0 })} Stück
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(h?.marketValue || 0)}</p>
                  <p className={`text-sm font-medium ${plPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(Math.abs(h?.pl || 0))} ({formatPercent(h?.plPercent || 0)})
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-400 dark:text-gray-500 block">Ø Kaufkurs</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(h.avgBuyPrice)}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500 block">Aktuell</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(h.currentPrice)}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500 block">Anteil</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{h.allocation.toFixed(1)}%</span>
                </div>
              </div>

              {h.priceSource === 'missing' && (
                <button
                  onClick={() => onEditPrice(h)}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 active:scale-[0.98] transition-transform"
                >
                  <Edit3 size={14} />
                  Kurs manuell erfassen
                </button>
              )}
              {h.priceSource === 'manual' && (
                <button
                  onClick={() => onEditPrice(h)}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-medium"
                >
                  Kurs bearbeiten
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Performance Chart */}
      {transactions.length > 0 && (
        <div className="mt-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
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
    </div>
  );
}
