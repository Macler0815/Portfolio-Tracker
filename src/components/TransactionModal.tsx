import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X, Check, Loader2, Building2, TrendingUp, Sparkles, CheckCircle2, AlertCircle, Bookmark } from 'lucide-react';
import type { Transaction, TransactionType, AssetType, Holding } from '@/lib/types';
import {
  searchSymbol,
  fetchSingleQuote,
  lookupSecurityByIsin,
  extractWknFromIsin,
  getApiKeyConfig,
  type SearchResult,
} from '@/lib/api';
import { todayISO } from '@/lib/format';
import { addToWatchlist } from '@/lib/watchlist';

interface TransactionModalProps {
  open: boolean;
  editing: Transaction | null;
  editingHolding?: Holding | null;
  initialTab?: 'buy' | 'sell' | 'watchlist';
  initialData?: {
    symbol?: string;
    name?: string;
    price?: number;
    isin?: string;
    wkn?: string;
    notes?: string;
  } | null;
  onClose: () => void;
  onSave: (t: Omit<Transaction, 'id'> | Transaction) => void;
  onSaveHolding?: (oldSymbol: string, updated: {
    symbol: string;
    name: string;
    quantity: number;
    avgBuyPrice: number;
    broker?: string;
    isin?: string;
    wkn?: string;
    notes?: string;
  }) => Promise<void> | void;
  onAddToWatchlist?: (item: {
    symbol: string;
    name: string;
    isin?: string;
    wkn?: string;
    notes?: string;
    lastPrice?: number;
    lastChangePercent?: number;
  }) => void;
  knownBanks: string[];
}

export function TransactionModal({
  open,
  editing,
  editingHolding,
  initialTab = 'buy',
  initialData,
  onClose,
  onSave,
  onSaveHolding,
  onAddToWatchlist,
  knownBanks,
}: TransactionModalProps) {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [modalTab, setModalTab] = useState<'buy' | 'sell' | 'watchlist'>('buy');
  const [txType, setTxType] = useState<TransactionType>('buy');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [priceFetching, setPriceFetching] = useState(false);
  const [priceFetched, setPriceFetched] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [isin, setIsin] = useState('');
  const [wkn, setWkn] = useState('');
  const [bank, setBank] = useState('');
  const [symbol, setSymbol] = useState('');
  const [isinLookingUp, setIsinLookingUp] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const symbolInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;

    if (editingHolding) {
      setModalTab('buy');
      setTxType('buy');
      setAssetType(editingHolding.assetType || 'stock');
      setSymbol(editingHolding.symbol || '');
      setName(editingHolding.name || '');
      setIsin(editingHolding.isin || '');
      setWkn(editingHolding.wkn || '');
      setQuantity(String(editingHolding.quantity || ''));
      setPrice(String(editingHolding.avgBuyPrice || ''));
      setDate(todayISO());
      setBank(editingHolding.broker || editingHolding.bank || '');
      setNote(editingHolding.notes || editingHolding.note || '');
      setPriceFetched(true);
      setSearchResults([]);
      setShowDropdown(false);
      setSearching(false);
      setLookupFeedback(null);
    } else if (editing) {
      setModalTab(editing.type === 'sell' ? 'sell' : 'buy');
      setTxType(editing.type);
      setAssetType(editing.assetType);
      setSymbol(editing.symbol);
      setName(editing.name);
      const rawIsin = editing.isin || '';
      const parts = rawIsin.split(' - ');
      setIsin(parts[0] || editing.isin || '');
      setWkn(parts[1] || editing.wkn || '');
      setQuantity(String(editing.quantity));
      setPrice(String(editing.price));
      setDate(editing.date);
      setBank(editing.broker || editing.bank || '');
      setNote(editing.notes || editing.note || '');
      setPriceFetched(true);
      setSearchResults([]);
      setShowDropdown(false);
      setSearching(false);
      setLookupFeedback(null);
    } else {
      setModalTab(initialTab || 'buy');
      setTxType(initialTab === 'sell' ? 'sell' : 'buy');
      setAssetType('stock');
      setSymbol(initialData?.symbol || '');
      setName(initialData?.name || '');
      setIsin(initialData?.isin || '');
      setWkn(initialData?.wkn || '');
      setQuantity('');
      setPrice(initialData?.price ? String(initialData.price) : '');
      setDate(todayISO());
      setBank('');
      setNote(initialData?.notes || '');
      setPriceFetched(Boolean(initialData?.price));
      setSearchResults([]);
      setShowDropdown(false);
      setSearching(false);
      setLookupFeedback(null);
    }
  }, [open, editing, editingHolding, initialTab, initialData]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        symbolInputRef.current &&
        !symbolInputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clean up search timer on unmount and check API config
  useEffect(() => {
    if (open) {
      getApiKeyConfig().catch(() => null);
    }
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [open]);

  // Live search handler for Symbol / Ticker input + background price fetcher on ticker edit
  const handleSymbolChange = useCallback((val: string) => {
    const upper = val.toUpperCase();
    setSymbol(upper);

    if (searchTimer.current) clearTimeout(searchTimer.current);

    const query = val.trim();
    if (!query) {
      setSearchResults([]);
      setSearching(false);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    setShowDropdown(true);

    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchSymbol(query);
        setSearchResults(Array.isArray(results) ? results : []);
      } catch (err) {
        console.error('Symbol search error:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }

      // If user typed/toggled a specific ticker ending with exchange suffix (e.g. .DE, .F, .DU, etc.)
      // trigger background quote fetch
      const trimmedUpper = upper.trim();
      if (/\.[A-Z]{1,4}$/.test(trimmedUpper)) {
        try {
          setPriceFetching(true);
          const quote = await fetchSingleQuote(trimmedUpper);
          if (quote && quote.price && quote.price > 0) {
            setPrice(String(quote.price));
            setPriceFetched(true);
            const formatted = quote.price.toLocaleString('de-DE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            setLookupFeedback({
              type: 'success',
              text: `Finnhub: ${trimmedUpper} · Live-Kurs: ${formatted} €`,
            });
          }
        } catch {
          // ignore background quote fetch error
        } finally {
          setPriceFetching(false);
        }
      }
    }, 300);
  }, []);

  const handleSelectSearchResult = async (result: SearchResult) => {
    setSymbol(result.symbol);
    setName(result.name);
    setAssetType(result.type === 'etf' ? 'etf' : 'stock');
    setShowDropdown(false);
    setSearchResults([]);

    // Fetch live price for the selected symbol
    setPriceFetching(true);
    setPriceFetched(false);
    setLookupFeedback(null);

    try {
      const quote = await fetchSingleQuote(result.symbol);
      if (quote && quote.price > 0) {
        setPrice(quote.price.toString());
        setPriceFetched(true);
        const formatted = quote.price.toLocaleString('de-DE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        setLookupFeedback({
          type: 'success',
          text: `Finnhub: ${result.name} · Live-Kurs: ${formatted} €`,
        });
      } else {
        setLookupFeedback({
          type: 'info',
          text: `${result.name} ausgewählt. Bitte Kurs manuell prüfen.`,
        });
      }
    } catch {
      setLookupFeedback({
        type: 'info',
        text: `${result.name} ausgewählt. Kurs konnte nicht automatisch geladen werden.`,
      });
    } finally {
      setPriceFetching(false);
    }
  };

  const performIsinLookup = async (query: string, explicit = false) => {
    const clean = query.trim().toUpperCase();
    if (clean.length < 5) return;

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

    const derivedWkn = extractWknFromIsin(clean);
    if (derivedWkn && !wkn) {
      setWkn(derivedWkn);
    }

    if (clean.length === 12) {
      performIsinLookup(clean, false);
    }
  };

  const handleWknChange = (val: string) => {
    const clean = val.toUpperCase().trim();
    setWkn(clean);
    if (clean.length === 6) {
      performIsinLookup(clean, false);
    }
  };

  const handleSave = async () => {
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) return;

    // 1. WATCHLIST MODE
    if (modalTab === 'watchlist') {
      const watchItem = {
        symbol: cleanSymbol,
        name: name.trim() || cleanSymbol,
        isin: isin.trim() || undefined,
        wkn: wkn.trim() || undefined,
        notes: note.trim() || undefined,
        lastPrice: parseFloat(price) > 0 ? parseFloat(price) : undefined,
      };

      if (onAddToWatchlist) {
        onAddToWatchlist(watchItem);
      } else {
        addToWatchlist(watchItem);
      }

      onClose();
      return;
    }

    // 2. EDITING HOLDING MODE
    if (editingHolding) {
      const qty = parseFloat(quantity);
      const prc = parseFloat(price);
      if (isNaN(qty) || qty <= 0 || isNaN(prc) || prc < 0) return;

      if (onSaveHolding) {
        await onSaveHolding(editingHolding.symbol, {
          symbol: cleanSymbol,
          name: name.trim() || cleanSymbol,
          quantity: qty,
          avgBuyPrice: prc,
          broker: bank.trim() || undefined,
          isin: isin.trim() || undefined,
          wkn: wkn.trim() || undefined,
          notes: note.trim() || undefined,
        });
      }
      onClose();
      return;
    }

    // 3. TRANSACTION MODE (Buy/Sell)
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (!cleanSymbol || !qty || !prc || !date) return;

    const combinedIsin = [isin.trim(), wkn.trim()].filter(Boolean).join(' - ');

    const data: Omit<Transaction, 'id'> = {
      symbol: cleanSymbol,
      name: name.trim() || cleanSymbol,
      type: txType,
      assetType,
      quantity: qty,
      price: prc,
      date,
      fee: 0,
      note: note.trim() || undefined,
      notes: note.trim() || undefined,
      bank: bank.trim() || undefined,
      broker: bank.trim() || undefined,
      ticker: cleanSymbol,
      isin: combinedIsin || undefined,
      wkn: wkn.trim() || undefined,
    };

    if (editing) {
      onSave({ ...data, id: editing.id });
    } else {
      onSave(data);
    }
    onClose();
  };

  if (!open) return null;

  const isWatchlist = modalTab === 'watchlist';
  const isEditing = Boolean(editing || editingHolding);

  const canSave = isWatchlist
    ? symbol.trim().length > 0
    : symbol.trim().length > 0 && parseFloat(quantity) > 0 && parseFloat(price) >= 0 && Boolean(date);

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
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingHolding
                  ? 'Position bearbeiten'
                  : editing
                  ? 'Transaktion bearbeiten'
                  : isWatchlist
                  ? 'Zur Watchlist hinzufügen'
                  : 'Neue Transaktion'}
              </h2>
              {isWatchlist && (
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                  Titel ohne Kauf zur Beobachtung vormerken
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Schließen"
            >
              <X size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Compact Header Tabs: Kauf / Verkauf / Watchlist */}
          {!isEditing && (
            <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setModalTab('buy');
                  setTxType('buy');
                }}
                className={`flex-1 rounded-lg py-1.5 px-2 text-xs font-semibold transition-all ${
                  modalTab === 'buy'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Kauf
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalTab('sell');
                  setTxType('sell');
                }}
                className={`flex-1 rounded-lg py-1.5 px-2 text-xs font-semibold transition-all ${
                  modalTab === 'sell'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Verkauf
              </button>
              <button
                type="button"
                onClick={() => setModalTab('watchlist')}
                className={`flex-1 rounded-lg py-1.5 px-2 text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                  modalTab === 'watchlist'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Bookmark size={12} />
                <span>Watchlist</span>
              </button>
            </div>
          )}

          {/* Asset type toggle (Aktie / ETF) */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAssetType('stock')}
              className={`flex-1 rounded-xl py-1.5 text-xs font-medium transition-all ${
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
              className={`flex-1 rounded-xl py-1.5 text-xs font-medium transition-all ${
                assetType === 'etf'
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              ETF
            </button>
          </div>

          {/* Symbol / Ticker input with inline autocomplete dropdown */}
          <div className="relative">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Symbol / Ticker <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Search
                size={16}
                className="text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                ref={symbolInputRef}
                type="text"
                value={symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                placeholder="z.B. AAPL oder EUNL.DE"
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 pl-9 pr-9 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono"
              />
              {searching && (
                <Loader2
                  size={16}
                  className="animate-spin text-green-600 dark:text-green-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                />
              )}
            </div>

            {/* Inline Dropdown */}
            {showDropdown && (searchResults.length > 0 || searching) && (
              <div
                ref={dropdownRef}
                className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-30 max-h-60 overflow-y-auto"
              >
                {searching && searchResults.length === 0 && (
                  <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Suche an Finnhub…</span>
                  </div>
                )}
                {searchResults.map((r) => (
                  <button
                    key={`${r.symbol}-${r.exchange}`}
                    type="button"
                    onClick={() => handleSelectSearchResult(r)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-750 border-b border-gray-100/60 dark:border-gray-700/60 last:border-b-0 transition-colors flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sm text-gray-900 dark:text-white">
                          {r.symbol}
                        </span>
                        {r.exchange && (
                          <span className="text-[10px] uppercase px-1.5 py-0.2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded font-medium">
                            {r.exchange}
                          </span>
                        )}
                        <span className="text-[10px] uppercase px-1.5 py-0.2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded font-medium">
                          {r.type.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {r.name}
                      </p>
                    </div>
                    <Sparkles size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name input */}
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Bezeichnung / Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Apple Inc. oder iShares Core MSCI World"
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          {/* ISIN & WKN Fields */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                ISIN
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={isin}
                  onChange={(e) => handleIsinChange(e.target.value)}
                  placeholder="US0378331005"
                  maxLength={12}
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono tracking-wider text-xs"
                />
                {isinLookingUp && (
                  <Loader2 size={14} className="animate-spin text-green-600 absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                WKN
              </label>
              <input
                type="text"
                value={wkn}
                onChange={(e) => handleWknChange(e.target.value)}
                placeholder="865985"
                maxLength={6}
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono tracking-wider text-xs"
              />
            </div>
          </div>

          {/* ISIN / Finnhub Lookup Feedback Banner */}
          {lookupFeedback && (
            <div
              className={`rounded-xl p-3 flex items-start gap-2.5 text-xs transition-all ${
                lookupFeedback.type === 'success'
                  ? 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800/50'
                  : lookupFeedback.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/50'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50'
              }`}
            >
              {lookupFeedback.type === 'success' ? (
                <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : lookupFeedback.type === 'error' ? (
                <AlertCircle size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              ) : (
                <Sparkles size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 font-medium">{lookupFeedback.text}</span>
            </div>
          )}

          {/* BUY/SELL ONLY FIELDS (Hidden in Watchlist mode) */}
          {!isWatchlist && (
            <>
              {/* Quantity & Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {editingHolding ? 'Menge (Stück)' : txType === 'sell' ? 'Verkaufte Stück' : 'Stückzahl'}{' '}
                    <span className="text-red-500">*</span>
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
                      {editingHolding ? 'Ø Kaufkurs (€)' : 'Kurs / Preis in €'}{' '}
                      <span className="text-red-500">*</span>
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
              {!editingHolding && (
                <div>
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {txType === 'sell' ? 'Verkaufsdatum' : 'Kaufdatum'}
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              )}
            </>
          )}

          {/* Notes (always available) */}
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Notizen (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isWatchlist ? 'Warum beobachtest du diesen Titel? Kursziel etc.' : 'Optionale Notizen zu dieser Position'}
              rows={2}
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none resize-none"
            />
          </div>

          {/* Total calculation preview (for buy/sell only) */}
          {!isWatchlist && parseFloat(quantity) > 0 && parseFloat(price) > 0 && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3.5 flex items-center justify-between border border-gray-100 dark:border-gray-800">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {editingHolding ? 'Positionswert (Kaufsumme)' : 'Gesamtwert (Volumen)'}
              </span>
              <span className="text-base font-bold text-gray-900 dark:text-white">
                {(parseFloat(quantity) * parseFloat(price)).toLocaleString('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                })}
              </span>
            </div>
          )}

          {/* Save / Submit Button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full rounded-xl text-white py-3.5 text-sm font-semibold transition-all disabled:opacity-40 disabled:active:scale-100 shadow-sm flex items-center justify-center gap-2 ${
              isWatchlist
                ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
                : txType === 'sell' && !editingHolding
                ? 'bg-red-600 hover:bg-red-700 active:scale-[0.98]'
                : 'bg-green-600 hover:bg-green-700 active:scale-[0.98]'
            }`}
          >
            {isWatchlist ? <Bookmark size={18} /> : <Check size={18} />}
            <span>
              {isWatchlist
                ? 'Zur Watchlist hinzufügen'
                : isEditing
                ? 'Änderungen speichern'
                : 'Transaktion hinzufügen'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
