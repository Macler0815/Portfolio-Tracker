import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2, Building2, TrendingUp, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Transaction, TransactionType, AssetType } from '@/lib/types';
import {
  searchSymbol,
  fetchSingleQuote,
  lookupSecurityByIsin,
  extractWknFromIsin,
  type SearchResult,
} from '@/lib/api';
import { todayISO } from '@/lib/format';

interface TransactionModalProps {
  open: boolean;
  editing: Transaction | null;
  onClose: () => void;
  onSave: (t: Omit<Transaction, 'id'> | Transaction) => void;
  knownBanks: string[];
}

export function TransactionModal({ open, editing, onClose, onSave, knownBanks }: TransactionModalProps) {
  // Mode: Search view vs Form view
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Form state
  const [txType, setTxType] = useState<TransactionType>('buy');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [isin, setIsin] = useState('');
  const [wkn, setWkn] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(todayISO());
  const [bank, setBank] = useState('');
  const [note, setNote] = useState('');

  // Status & Feedback
  const [priceFetching, setPriceFetching] = useState(false);
  const [priceFetched, setPriceFetched] = useState(false);
  const [isinLookingUp, setIsinLookingUp] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Focus ref for Symbol / Ticker input
  const symbolInputRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset or load editing transaction & handle initial focus
  useEffect(() => {
    if (!open) return;

    if (editing) {
      setTxType(editing.type);
      setAssetType(editing.assetType);
      setSymbol(editing.symbol);
      setName(editing.name);
      const rawIsin = editing.isin || '';
      const parts = rawIsin.split(' - ');
      setIsin(parts[0] || '');
      setWkn(parts[1] || '');
      setQuantity(String(editing.quantity));
      setPrice(String(editing.price));
      setDate(editing.date);
      setBank(editing.bank || '');
      setNote(editing.note || '');
      setPriceFetched(true);
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      setLookupFeedback(null);
    } else {
      setTxType('buy');
      setAssetType('stock');
      setSymbol('');
      setName('');
      setIsin('');
      setWkn('');
      setQuantity('');
      setPrice('');
      setDate(todayISO());
      setBank('');
      setNote('');
      setPriceFetched(false);
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      setLookupFeedback(null);
    }

    // Auto-focus inside "Symbol / Ticker" field when modal opens (and not editing)
    if (!editing) {
      const timer = setTimeout(() => {
        symbolInputRef.current?.focus();
      }, 150);

      return () => clearTimeout(timer);
    }
  }, [open, editing]);

  // Clean up search timer
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  // Search handler in search view
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!q.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchSymbol(q);
        setSearchResults(Array.isArray(results) ? results : []);
      } catch (err) {
        console.error('Symbol search error:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  // Selecting a result from search view
  const handleSelectSearchResult = async (r: SearchResult) => {
    setSymbol(r.symbol.toUpperCase());
    setName(r.name || r.symbol.toUpperCase());
    setAssetType(r.type === 'etf' ? 'etf' : 'stock');
    setShowSearch(false);

    // Fetch quote
    setPriceFetching(true);
    try {
      const quote = await fetchSingleQuote(r.symbol);
      if (quote?.price && quote.price > 0) {
        setPrice(String(quote.price));
        setPriceFetched(true);
        const formatted = quote.price.toLocaleString('de-DE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        setLookupFeedback({
          type: 'success',
          text: `Live-Kurs für ${r.symbol}: ${formatted} €`,
        });
      }
    } catch {
      // ignore
    } finally {
      setPriceFetching(false);
    }
  };

  // ISIN lookup
  const performIsinLookup = async (query: string, explicit = false) => {
    if (!query || typeof query !== 'string') return;
    const clean = query.trim().toUpperCase();
    if (!clean || clean.length < 5) return;

    const immediateWkn = extractWknFromIsin(clean);
    if (immediateWkn) {
      setWkn((prev) => prev || immediateWkn);
    }

    setIsinLookingUp(true);
    setLookupFeedback(null);

    try {
      const result = await lookupSecurityByIsin(clean);
      if (result && (result.symbol || result.name || (typeof result.price === 'number' && result.price > 0))) {
        if (result.symbol) setSymbol(result.symbol);
        if (clean.length === 12) setIsin(clean);
        if (result.name) setName(result.name);
        if (result.wkn) setWkn(result.wkn);
        if (result.assetType) setAssetType(result.assetType);
        if (typeof result.price === 'number' && result.price > 0) {
          setPrice(result.price.toString());
          setPriceFetched(true);
          const formatted = result.price.toLocaleString('de-DE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          setLookupFeedback({
            type: 'success',
            text: `Finnhub: ${result.name || result.symbol || clean} · Live-Kurs: ${formatted} €`,
          });
        } else {
          setLookupFeedback({
            type: 'success',
            text: `Finnhub: ${result.name || result.symbol || clean} gefunden.`,
          });
        }
      } else if (explicit) {
        setLookupFeedback({
          type: 'info',
          text: `Keine Daten für "${clean}" gefunden.`,
        });
      }
    } catch {
      if (explicit) {
        setLookupFeedback({
          type: 'error',
          text: 'Abfrage fehlgeschlagen.',
        });
      }
    } finally {
      setIsinLookingUp(false);
    }
  };

  const handleIsinChange = (val: string) => {
    const clean = val.toUpperCase().trim();
    setIsin(clean);
    const extracted = extractWknFromIsin(clean);
    if (extracted && !wkn) {
      setWkn(extracted);
    }
  };

  const handleSave = () => {
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (!symbol || !qty || !prc || !date) return;

    const combinedIsin = [isin.trim(), wkn.trim()].filter(Boolean).join(' - ');

    const data = {
      symbol: symbol.toUpperCase(),
      name: name.trim() || symbol.toUpperCase(),
      type: txType,
      assetType,
      quantity: qty,
      price: prc,
      date,
      fee: 0,
      note: note.trim() || undefined,
      bank: bank.trim() || undefined,
      ticker: symbol.toUpperCase(),
      isin: combinedIsin || undefined,
    };

    if (editing) {
      onSave({ ...data, id: editing.id });
    } else {
      onSave(data);
    }
    onClose();
  };

  if (!open) return null;

  const canSave = symbol.trim() && parseFloat(quantity) > 0 && parseFloat(price) > 0 && date;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mt-auto rounded-t-3xl bg-white dark:bg-gray-900 max-h-[90vh] overflow-y-auto safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 pt-3 pb-2 z-20 border-b border-gray-100 dark:border-gray-800">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700 mx-auto mb-2" />
          <div className="flex items-center justify-between px-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {showSearch
                ? 'Wertpapier suchen'
                : editing
                ? 'Transaktion bearbeiten'
                : 'Neue Transaktion'}
            </h2>
            <div className="flex items-center gap-2">
              {!showSearch && (
                <button
                  type="button"
                  onClick={() => setShowSearch(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                >
                  <Search size={14} />
                  <span>Wertpapier-Suche</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Schließen"
              >
                <X size={20} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Content: Search Mode vs Form Mode */}
        {showSearch ? (
          <div className="px-5 py-4 space-y-4">
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Name, Ticker oder ISIN eingeben..."
                autoFocus
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 pl-10 pr-9 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
              />
              {searching && (
                <Loader2 size={16} className="animate-spin text-green-600 dark:text-green-400 absolute right-3 top-1/2 -translate-y-1/2" />
              )}
            </div>

            {/* Search results list */}
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {searchResults.map((r, idx) => (
                <button
                  key={`${r.symbol}-${idx}`}
                  type="button"
                  onClick={() => handleSelectSearchResult(r)}
                  className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-green-50 dark:hover:bg-green-950/30 border border-gray-100 dark:border-gray-800 transition-colors flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-gray-900 dark:text-white">
                        {r.symbol}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {r.type === 'etf' ? 'ETF' : 'Aktie'}
                      </span>
                      {r.exchange && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {r.exchange}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate mt-0.5">
                      {r.name}
                    </p>
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">
                    Wählen →
                  </span>
                </button>
              ))}
              {!searching && searchQuery.trim() && searchResults.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-6">Keine Ergebnisse gefunden</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowSearch(false)}
              className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Zurück zum Formular
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Buy/Sell toggle */}
            <div className="flex gap-2">
              <button
                type="button"
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
                type="button"
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

            {/* Asset type toggle */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAssetType('stock')}
                className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
                  assetType === 'stock'
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                Aktie
              </button>
              <button
                type="button"
                onClick={() => setAssetType('etf')}
                className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all ${
                  assetType === 'etf'
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                ETF
              </button>
            </div>

            {/* Symbol / Ticker input with auto-focus React useRef */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Symbol / Ticker <span className="text-red-500">*</span>
              </label>
              <input
                ref={symbolInputRef}
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="z.B. AAPL oder EUNL.DE"
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono"
              />
            </div>

            {/* Feedback message banner */}
            {lookupFeedback && (
              <div
                className={`flex items-start gap-2 p-2.5 rounded-xl text-xs transition-all ${
                  lookupFeedback.type === 'success'
                    ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/60'
                    : lookupFeedback.type === 'error'
                    ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60'
                    : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60'
                }`}
              >
                {lookupFeedback.type === 'success' && (
                  <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                )}
                {lookupFeedback.type === 'error' && (
                  <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                )}
                {lookupFeedback.type === 'info' && (
                  <AlertCircle size={15} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                )}
                <span className="flex-1">{lookupFeedback.text}</span>
                <button
                  type="button"
                  onClick={() => setLookupFeedback(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Name (Wertpapiername)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Apple Inc. oder iShares Core MSCI World"
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>

            {/* ISIN & WKN */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block">
                  ISIN &amp; WKN
                </label>
                <button
                  type="button"
                  onClick={() => performIsinLookup(isin || symbol, true)}
                  disabled={isinLookingUp || (!isin.trim() && !symbol.trim())}
                  className="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isinLookingUp ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Lade…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} />
                      <span>Finnhub Live-Abfrage</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <div className="relative">
                  <input
                    type="text"
                    value={isin}
                    onChange={(e) => handleIsinChange(e.target.value)}
                    placeholder="ISIN (z.B. US0378331005)"
                    maxLength={12}
                    className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono tracking-wider"
                  />
                  {isinLookingUp && (
                    <Loader2 size={13} className="animate-spin text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                  )}
                </div>
                <span className="text-gray-400 dark:text-gray-500 text-sm font-medium">-</span>
                <input
                  type="text"
                  value={wkn}
                  onChange={(e) => setWkn(e.target.value.toUpperCase().trim())}
                  placeholder="WKN (z.B. 865985)"
                  maxLength={6}
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono tracking-wider"
                />
              </div>
            </div>

            {/* Stückzahl & Kurs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Stückzahl <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="10"
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    Kurs / Preis in € <span className="text-red-500">*</span>
                    {priceFetching && <Loader2 size={12} className="animate-spin text-gray-400" />}
                  </span>
                  {priceFetched && !priceFetching && price && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-md">
                      <TrendingUp size={10} />
                      Live
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceFetched(true);
                  }}
                  placeholder={priceFetching ? 'Lade Kurs…' : '150.00'}
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none font-mono"
                />
              </div>
            </div>

            {/* Bank / Broker */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Bank / Broker
              </label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  list="bank-list"
                  placeholder="z.B. Trade Republic, Scalable, ING"
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 pl-10 pr-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
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
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Kaufdatum
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Notizen (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optionale Notizen zu dieser Transaktion"
                rows={2}
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none resize-none"
              />
            </div>

            {/* Total calculation preview */}
            {parseFloat(quantity) > 0 && parseFloat(price) > 0 && (
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3.5 flex items-center justify-between border border-gray-100 dark:border-gray-800">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Gesamtwert (Volumen)
                </span>
                <span className="text-base font-bold text-gray-900 dark:text-white">
                  {(parseFloat(quantity) * parseFloat(price)).toLocaleString('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              </div>
            )}

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="w-full rounded-xl bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white py-3.5 text-sm font-semibold transition-all disabled:opacity-40 disabled:active:scale-100 shadow-sm"
            >
              {editing ? 'Änderungen speichern' : 'Transaktion hinzufügen'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
