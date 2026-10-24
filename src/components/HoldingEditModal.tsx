import { useState, useEffect } from 'react';
import { X, Trash2, Edit } from 'lucide-react';
import type { Holding } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

interface HoldingEditModalProps {
  open: boolean;
  holding: Holding | null;
  onClose: () => void;
  onSave: (oldSymbol: string, updated: { symbol: string; name: string; quantity: number; avgBuyPrice: number }) => Promise<void> | void;
  onDelete?: (symbol: string) => Promise<void> | void;
}

export function HoldingEditModal({ open, holding, onClose, onSave, onDelete }: HoldingEditModalProps) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgBuyPrice, setAvgBuyPrice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && holding) {
      setSymbol(holding.symbol || '');
      setName(holding.name || '');
      setQuantity(String(holding.quantity || 0));
      setAvgBuyPrice(String(holding.avgBuyPrice || 0));
      setConfirmDelete(false);
      setSaving(false);
    }
  }, [open, holding]);

  if (!open || !holding) return null;

  const parsedQty = parseFloat(quantity);
  const parsedPrice = parseFloat(avgBuyPrice);
  const isValid = symbol.trim().length > 0 && !isNaN(parsedQty) && parsedQty > 0 && !isNaN(parsedPrice) && parsedPrice >= 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    try {
      await onSave(holding!.symbol, {
        symbol: symbol.trim().toUpperCase(),
        name: name.trim() || symbol.trim().toUpperCase(),
        quantity: parsedQty,
        avgBuyPrice: parsedPrice,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !holding) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await onDelete(holding.symbol);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Edit size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Position bearbeiten</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Stammdaten & Kaufwerte anpassen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Current status summary card */}
        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 mb-4 text-xs flex items-center justify-between">
          <div>
            <span className="text-gray-400 dark:text-gray-500 block">Aktueller Kurs</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(holding.currentPrice || 0)}</span>
          </div>
          <div className="text-right">
            <span className="text-gray-400 dark:text-gray-500 block">Aktueller Wert</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(holding.marketValue || 0)}</span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          {/* Symbol & Name */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="z.B. AAPL"
                required
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Unternehmensname"
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Quantity & Buy Price */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Menge (Stück)</label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                required
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Ø Kaufkurs (€)</label>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={avgBuyPrice}
                onChange={(e) => setAvgBuyPrice(e.target.value)}
                placeholder="0.00"
                required
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-between gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  confirmDelete
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
                }`}
                title={confirmDelete ? 'Klicke erneut zum Bestätigen' : 'Position löschen'}
              >
                <Trash2 size={15} />
                <span>{confirmDelete ? 'Wirklich löschen?' : 'Löschen'}</span>
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!isValid || saving}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {saving ? 'Speichert...' : 'Speichern'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
