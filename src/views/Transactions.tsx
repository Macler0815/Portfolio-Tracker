import { useState } from 'react';
import { Trash2, ArrowUpRight, ArrowDownRight, ChevronDown, Clock, Maximize2 } from 'lucide-react';
import type { Transaction } from '@/lib/types';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import { getHistoryForSymbol, type HistoryEntry } from '@/lib/history';
import { HistoryModal } from '@/components/HistoryModal';

interface TransactionsViewProps {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}

export function TransactionsView({ transactions, onEdit, onDelete }: TransactionsViewProps) {
  const history = usePortfolioHistory();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [modalState, setModalState] = useState<{
    open: boolean;
    symbol: string;
    name?: string;
    entries: HistoryEntry[];
  } | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDateDE = (d: string) => {
    const parts = d.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return d;
  };

  if (transactions.length === 0) {
    return (
      <div className="px-4 pt-2 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">Verlauf</h1>
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400 font-medium">Noch keine Transaktionen</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Tippe auf das + um eine Transaktion hinzuzufügen</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">Verlauf</h1>
      <div className="space-y-2.5">
        {transactions.map((t) => {
          const isBuy = t.type === 'buy';
          const total = t.quantity * t.price;
          const isExpanded = expandedIds.has(t.id);
          const entries = getHistoryForSymbol(history, t.symbol, t.isin);

          return (
            <div
              key={t.id}
              className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 transition-all shadow-xs"
            >
              {/* Hauptzeile: Transaktion */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isBuy
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  }`}
                >
                  {isBuy ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                </div>

                <button onClick={() => onEdit(t)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white truncate">{t.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{t.symbol}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    <span>{formatDate(t.date)}</span>
                    <span>·</span>
                    <span>
                      {formatNumber(t.quantity, 0)} × {formatCurrency(t.price)}
                    </span>
                    {t.note && (
                      <>
                        <span>·</span>
                        <span className="truncate">{t.note}</span>
                      </>
                    )}
                    {t.bank && (
                      <>
                        <span>·</span>
                        <span>{t.bank}</span>
                      </>
                    )}
                  </div>
                </button>

                <div className="text-right shrink-0">
                  <p
                    className={`font-semibold text-sm ${
                      isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {isBuy ? '+' : '−'}
                    {formatCurrency(total)}
                  </p>
                </div>

                {/* Kurshistory Trigger (kleines Dreieck / Chevron) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(t.id);
                  }}
                  className={`shrink-0 p-2 rounded-xl transition-all ${
                    isExpanded
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 rotate-180'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  title={isExpanded ? 'Kurshistorie einklappen' : 'Kurshistorie anzeigen'}
                  aria-label={`${t.symbol} Kurshistorie ein-/ausblenden`}
                >
                  <ChevronDown size={17} />
                </button>

                {/* Löschen Button */}
                <button
                  onClick={() => onDelete(t.id)}
                  className="shrink-0 p-2 text-gray-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                  title="Transaktion löschen"
                  aria-label="Transaktion löschen"
                >
                  <Trash2 size={17} />
                </button>
              </div>

              {/* Aufgeklappte Kurshistorie (nur im Verlauf) */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs px-0.5">
                    <div className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-300">
                      <Clock size={13} className="text-blue-500" />
                      <span>Kurshistorie ({t.symbol})</span>
                      {entries.length > 0 && (
                        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          {entries.length} {entries.length === 1 ? 'Tag' : 'Tage'}
                        </span>
                      )}
                    </div>
                    {entries.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setModalState({
                            open: true,
                            symbol: t.symbol,
                            name: t.name,
                            entries,
                          })
                        }
                        className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <Maximize2 size={12} />
                        <span>Im Modal öffnen</span>
                      </button>
                    )}
                  </div>

                  {entries.length > 0 ? (
                    <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden text-xs bg-gray-50/60 dark:bg-gray-850/50">
                      <div className="grid grid-cols-[1.05fr_1fr_1fr_0.95fr_0.95fr] gap-1 px-2.5 py-1.5 bg-gray-100/70 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                        <span>Datum</span>
                        <span className="text-right">Kurs</span>
                        <span className="text-right">Kaufkurs</span>
                        <span className="text-right">+-%</span>
                        <span className="text-right">Tages-%</span>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                        {[...entries]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .slice(0, 5)
                          .map((e, idx) => {
                            const isPosTotal = e.pctChange > 0.001;
                            const isNegTotal = e.pctChange < -0.001;
                            const isPosDay = e.dailyChangePercent > 0.001;
                            const isNegDay = e.dailyChangePercent < -0.001;
                            return (
                              <div
                                key={`${e.date}-${idx}`}
                                className="grid grid-cols-[1.05fr_1fr_1fr_0.95fr_0.95fr] gap-1 px-2.5 py-1.5 items-center text-[11px] hover:bg-gray-50 dark:hover:bg-gray-800/40"
                              >
                                <span className="text-gray-600 dark:text-gray-400 font-mono truncate">
                                  {formatDateDE(e.date)}
                                </span>
                                <span className="text-right font-medium text-gray-900 dark:text-white truncate">
                                  {formatCurrency(e.price)}
                                </span>
                                <span className="text-right text-gray-600 dark:text-gray-300 font-medium truncate">
                                  {e.buyPrice > 0 ? formatCurrency(e.buyPrice) : '—'}
                                </span>
                                <span className="text-right truncate">
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
                                </span>
                                <span className="text-right truncate">
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
                                </span>
                              </div>
                            );
                          })}
                      </div>
                      {entries.length > 5 && (
                        <div className="px-2.5 py-1 text-center bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800">
                          <button
                            type="button"
                            onClick={() =>
                              setModalState({
                                open: true,
                                symbol: t.symbol,
                                name: t.name,
                                entries,
                              })
                            }
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >
                            Alle {entries.length} Einträge im Modal anzeigen →
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-gray-50/70 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 text-center">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Noch keine Kurshistorie für{' '}
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                          {t.symbol}
                        </span>{' '}
                        aufgezeichnet.
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        Tägliche Schnappschüsse werden automatisch bei jeder Kursaktualisierung angelegt.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* History Modal (wenn angefordert) */}
      {modalState && (
        <HistoryModal
          open={modalState.open}
          onClose={() => setModalState(null)}
          symbol={modalState.symbol}
          name={modalState.name}
          entries={modalState.entries}
        />
      )}
    </div>
  );
}
