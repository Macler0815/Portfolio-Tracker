import { useEffect, useRef, useState } from 'react';
import { Search, X, Check, Loader2, Building2 } from 'lucide-react';
import type { Transaction, TransactionType, AssetType } from '@/lib/types';
import { searchSymbol, type SearchResult } from '@/lib/api';
import { todayISO } from '@/lib/format';

interface TransactionModalProps {
  open: boolean;
  editing: Transaction | null;
  onClose: () => void;
  onSave: (t: Omit<Transaction, 'id'> | Transaction) => void;
  knownBanks: string[];
}

type Step = 'search' | 'details';

export function TransactionModal({ open, editing, onClose, onSave, knownBanks }: TransactionModalProps) {
  const [step, setStep] = useState<Step>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);

  const [txType, setTxType] = useState<TransactionType>('buy');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [isin, setIsin] = useState('');
  const [bank, setBank] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset or load editing transaction
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStep('details');
      setSelected(null);
      setTxType(editing.type);
      setAssetType(editing.assetType);
      setQuantity(String(editing.quantity));
      setPrice(String(editing.price));
      setDate(editing.date);
      setNote(editing.note || '');
      setName(editing.name);
      setSymbol(editing.symbol);
      setIsin(editing.isin || '');
      setBank(editing.bank || '');
    } else {
      setStep('search');
      setSelected(null);
      setSearchQuery('');
      setSearchResults([]);
      setTxType('buy');
      setAssetType('stock');
      setQuantity('');
      setPrice('');
      setDate(todayISO());
      setNote('');
      setName('');
      setSymbol('');
      setIsin('');
      setBank('');
    }
  }, [open, editing]);

  // Debounced search
  useEffect(() => {
    if (step !== 'search') return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = await searchSymbol(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, step]);

  // Focus first input on details step
  useEffect(() => {
    if (step === 'details' && !editing) {
      setTimeout(() => firstInputRef.current?.focus(), 100);
    }
  }, [step, editing]);

  if (!open) return null;

  function selectResult(r: SearchResult) {
    setSelected(r);
    setSymbol(r.symbol);
    setName(r.name);
    setAssetType(r.type === 'etf' ? 'etf' : 'stock');
    setStep('details');
  }

  function handleManualEntry() {
    setSelected(null);
    const input = searchQuery.trim().toUpperCase();
    setSymbol(input);
    setName('');
    setStep('details');
  }

  function handleSave() {
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (!symbol || !qty || !prc || !date) return;

    const data = {
      symbol: symbol.toUpperCase(),
      name: name || symbol,
      type: txType,
      assetType,
      quantity: qty,
      price: prc,
      date,
      fee: 0,
      note: note.trim() || undefined,
      bank: bank.trim() || undefined,
      ticker: symbol.toUpperCase(),
      isin: isin.trim() || undefined,
    };

    if (editing) {
      onSave({ ...data, id: editing.id });
    } else {
      onSave(data);
    }
    onClose();
  }

  const canSave = symbol && parseFloat(quantity) > 0 && parseFloat(price) > 0 && date;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mt-auto rounded-t-3xl bg-white dark:bg-gray-900 max-h-[90vh] overflow-y-auto safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 pt-3 pb-2 z-10">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700 mx-auto mb-2" />
          <div className="flex items-center justify-between px-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editing ? 'Transaktion bearbeiten' : step === 'search' ? 'Wertpapier suchen' : 'Neue Transaktion'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-8">
          {step === 'search' && !editing && (
            <>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ticker oder Name (z.B. AAPL, EUNL.DE)"
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 pl-10 pr-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
                  autoFocus
                />
              </div>

              {searching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="mt-3 space-y-1">
                  {searchResults.map((r) => (
                    <button
                      key={`${r.symbol}-${r.exchange}`}
                      onClick={() => selectResult(r)}
                      className="w-full flex items-center justify-between rounded-xl px-3 py-3 text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {r.symbol} · {r.exchange} · {r.type === 'etf' ? 'ETF' : 'Aktie'}
                        </p>
                      </div>
                      <Check size={18} className="text-gray-300 dark:text-gray-600 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {!searching && searchQuery.trim() && searchResults.length === 0 && (
                <div className="mt-6 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Keine Ergebnisse gefunden</p>
                  <button
                    onClick={handleManualEntry}
                    className="rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-transform"
                  >
                    Manuell erfassen: {searchQuery.toUpperCase()}
                  </button>
                </div>
              )}

              {!searching && !searchQuery.trim() && (
                <div className="mt-6 text-center py-8">
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Suche nach Ticker (AAPL, EUNL.DE) oder Name um Live-Kurse zu erhalten
                  </p>
                </div>
              )}
            </>
          )}

          {step === 'details' && (
            <div className="space-y-4 mt-2">
              {/* Selected asset info */}
              {selected && (
                <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3.5 py-2.5">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">{selected.name}</p>
                  <p className="text-xs text-green-600 dark:text-green-400">{selected.symbol} · {selected.exchange}</p>
                </div>
              )}

              {/* Buy/Sell toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setTxType('buy')}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${
                    txType === 'buy'
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Kauf
                </button>
                <button
                  onClick={() => setTxType('sell')}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${
                    txType === 'sell'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Verkauf
                </button>
              </div>

              {/* Asset type */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAssetType('stock')}
                  className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
                    assetType === 'stock'
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Aktie
                </button>
                <button
                  onClick={() => setAssetType('etf')}
                  className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
                    assetType === 'etf'
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  ETF
                </button>
              </div>

              {/* Symbol / Ticker (required) */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                  Symbol / Ticker <span className="text-red-500">*</span>
                </label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="z.B. AAPL oder EUNL.DE"
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
                />
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  Tipp für ETFs: Nutze das Tickersymbol mit Endung, z.B. &apos;EUNL.DE&apos; für den iShares MSCI World (Xetra) oder &apos;VUSA.DE&apos; für S&amp;P 500.
                </p>
              </div>

              {/* ISIN / WKN (optional, documentation only) */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                  ISIN / WKN <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={isin}
                  onChange={(e) => setIsin(e.target.value.toUpperCase())}
                  placeholder="z.B. IE00B4L5Y983 oder A1JX51"
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
                />
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  Nur zur Dokumentation — wird nicht für die Kursabfrage verwendet.
                </p>
              </div>

              {/* Wertpapiername */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Wertpapiername</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Apple Inc. oder iShares MSCI World"
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              {/* Quantity & Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Stückzahl</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="10"
                    className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Kurs in €</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="150.00"
                    className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              </div>

              {/* Bank */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Bank</label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    list="bank-list"
                    placeholder="z.B. Trade Republic, ING"
                    className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 pl-10 pr-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
                  />
                  <datalist id="bank-list">
                    {knownBanks.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Kaufdatum</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Notizen</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optionale Notizen zu dieser Transaktion"
                  rows={3}
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none resize-none"
                />
              </div>

              {/* Total preview */}
              {parseFloat(quantity) > 0 && parseFloat(price) > 0 && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Gesamtwert</span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {(parseFloat(quantity) * parseFloat(price)).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              )}

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="w-full rounded-xl bg-green-600 text-white py-3.5 text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100"
              >
                {editing ? 'Speichern' : 'Transaktion hinzufügen'}
              </button>

              {/* Back button when not editing */}
              {!editing && (
                <button
                  onClick={() => setStep('search')}
                  className="w-full text-center text-sm text-gray-500 dark:text-gray-400 font-medium"
                >
                  Zurück zur Suche
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
