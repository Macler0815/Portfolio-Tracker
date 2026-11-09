import { X, Calendar, Clock } from 'lucide-react';
import type { HistoryEntry } from '@/lib/history';
import { formatCurrency, formatNumber } from '@/lib/format';

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
  symbol: string;
  name?: string;
  entries: HistoryEntry[];
}

export function HistoryModal({
  open,
  onClose,
  symbol,
  name,
  entries,
}: HistoryModalProps) {
  if (!open) return null;

  // Sort descending by date (newest first)
  const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  // Helper to format "YYYY-MM-DD" as "DD.MM.YYYY"
  const formatDateDE = (d: string) => {
    const parts = d.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return d;
  };

  const prices = sortedEntries.map((e) => e.price).filter((p) => typeof p === 'number' && p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const latestPrice = sortedEntries[0]?.price || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <Clock size={16} />
              </span>
              <h2
                id="history-modal-title"
                className="text-base font-bold text-gray-900 dark:text-white truncate"
              >
                Kurshistorie
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-mono font-semibold">
                {symbol}
              </span>
            </div>
            {name && name !== symbol && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1 pl-8">
                {name}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats Summary Bar */}
        {sortedEntries.length > 0 && (
          <div className="grid grid-cols-3 gap-2 px-5 py-3 bg-gray-50/70 dark:bg-gray-850/40 border-b border-gray-100 dark:border-gray-800 text-xs shrink-0">
            <div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 block">Neuester Kurs</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {latestPrice > 0 ? formatCurrency(latestPrice) : '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 block">Tiefstkurs</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {minPrice > 0 ? formatCurrency(minPrice) : '—'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 block">Höchstkurs</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {maxPrice > 0 ? formatCurrency(maxPrice) : '—'}
              </span>
            </div>
          </div>
        )}

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {sortedEntries.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1.05fr_1fr_1fr_0.95fr_0.95fr] gap-1 px-3 py-2 bg-gray-50 dark:bg-gray-800/60 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                <span>Datum</span>
                <span className="text-right">Kurs</span>
                <span className="text-right">Kaufkurs</span>
                <span className="text-right">+-%</span>
                <span className="text-right">Tages-%</span>
              </div>

              {/* Rows */}
              {sortedEntries.map((e, idx) => {
                const isPosTotal = e.pctChange > 0.001;
                const isNegTotal = e.pctChange < -0.001;
                const isPosDay = e.dailyChangePercent > 0.001;
                const isNegDay = e.dailyChangePercent < -0.001;

                return (
                  <div
                    key={`${e.date}-${idx}`}
                    className="grid grid-cols-[1.05fr_1fr_1fr_0.95fr_0.95fr] gap-1 px-3 py-2.5 items-center text-xs hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 font-medium">
                      <Calendar size={13} className="text-gray-400 shrink-0 hidden xs:inline" />
                      <span>{formatDateDE(e.date)}</span>
                    </div>

                    <div className="text-right font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(e.price)}
                    </div>

                    <div className="text-right text-gray-600 dark:text-gray-300 font-medium">
                      {e.buyPrice > 0 ? formatCurrency(e.buyPrice) : '—'}
                    </div>

                    <div className="text-right">
                      {isPosTotal ? (
                        <span className="inline-flex items-baseline justify-end gap-0.5 font-semibold text-green-600 dark:text-green-400">
                          <span className="text-[9px] font-bold self-center">↑</span>
                          <span>+{formatNumber(Math.abs(e.pctChange), 2)}%</span>
                        </span>
                      ) : isNegTotal ? (
                        <span className="inline-flex items-baseline justify-end gap-0.5 font-semibold text-red-600 dark:text-red-400">
                          <span className="text-[9px] font-bold self-center">↓</span>
                          <span>{formatNumber(e.pctChange, 2)}%</span>
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 font-medium">0,00%</span>
                      )}
                    </div>

                    <div className="text-right">
                      {isPosDay ? (
                        <span className="inline-flex items-baseline justify-end gap-0.5 font-semibold text-green-600 dark:text-green-400">
                          <span className="text-[9px] font-bold self-center">↑</span>
                          <span>+{formatNumber(Math.abs(e.dailyChangePercent), 2)}%</span>
                        </span>
                      ) : isNegDay ? (
                        <span className="inline-flex items-baseline justify-end gap-0.5 font-semibold text-red-600 dark:text-red-400">
                          <span className="text-[9px] font-bold self-center">↓</span>
                          <span>{formatNumber(e.dailyChangePercent, 2)}%</span>
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 font-medium">0,00%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-500 flex items-center justify-center mx-auto mb-3">
                <Clock size={22} />
              </div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Noch keine Kurshistorie vorhanden
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
                Tägliche Schnappschüsse werden automatisch beim Abruf von Live-Kursen in Finnhub für diesen Titel aufgezeichnet.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 dark:bg-gray-850/60 border-t border-gray-100 dark:border-gray-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-xs font-semibold transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
