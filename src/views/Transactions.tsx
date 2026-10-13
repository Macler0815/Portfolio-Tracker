import { Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { Transaction } from '@/lib/types';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

interface TransactionsViewProps {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => void;
}

export function TransactionsView({ transactions, onEdit, onDelete }: TransactionsViewProps) {
  if (transactions.length === 0) {
    return (
      <div className="px-4 pt-2 pb-24 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">Transaktionen</h1>
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400 font-medium">Noch keine Transaktionen</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Tippe auf das + um eine Transaktion hinzuzufügen</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 pb-24 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">Transaktionen</h1>
      <div className="space-y-2.5">
        {transactions.map((t) => {
          const isBuy = t.type === 'buy';
          const total = t.quantity * t.price;
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5"
            >
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
                  <span>{formatNumber(t.quantity)} × {formatCurrency(t.price)}</span>
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
                <p className={`font-semibold text-sm ${isBuy ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
                  {isBuy ? '−' : '+'}{formatCurrency(total)}
                </p>
              </div>
              <button
                onClick={() => onDelete(t.id)}
                className="shrink-0 p-2 text-gray-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={17} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
