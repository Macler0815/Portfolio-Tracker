import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { Holding } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

interface PriceEditModalProps {
  open: boolean;
  holding: Holding | null;
  onClose: () => void;
  onSave: (symbol: string, price: number) => void;
  onRemove: (symbol: string) => void;
}

export function PriceEditModal({ open, holding, onClose, onSave, onRemove }: PriceEditModalProps) {
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (open && holding) {
      setPrice(String(holding.currentPrice));
    }
  }, [open, holding]);

  if (!open || !holding) return null;

  function handleSave() {
    const p = parseFloat(price);
    if (p > 0) {
      onSave(holding!.symbol, p);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Kurs bearbeiten</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 mb-4">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{holding.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{holding.symbol} · {formatCurrency(holding.marketValue)} Marktwert</p>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Der Live-Kurs konnte nicht abgerufen werden. Gib den aktuellen Kurs manuell ein:
        </p>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Kurs in €</label>
          <input
            type="number"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            autoFocus
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
          />
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={handleSave}
            disabled={!parseFloat(price) || parseFloat(price) <= 0}
            className="w-full rounded-xl bg-green-600 text-white py-3 text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            Kurs speichern
          </button>
          {holding.priceSource === 'manual' && (
            <button
              onClick={() => {
                onRemove(holding.symbol);
                onClose();
              }}
              className="w-full text-sm text-gray-500 dark:text-gray-400 font-medium py-2"
            >
              Manuellen Kurs entfernen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
