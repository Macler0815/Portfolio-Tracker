import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X, Check, Loader2, Building2, TrendingUp, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Transaction, TransactionType, AssetType } from '@/lib/types';
import {
  searchSymbol,
  fetchSingleQuote,
  lookupSecurityByIsin,
  extractWknFromIsin,
  getApiKeyConfig,
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
  const [priceFetching, setPriceFetching] = useState(false);
  const [priceFetched, setPriceFetched] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [isin, setIsin] = useState('');
  const [wkn, setWkn] = useState('');
  const [bank, setBank] = useState('');

  const [isinLookingUp, setIsinLookingUp] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      // Parse combined "ISIN - WKN" from stored isin field
      const rawIsin = editing.isin || '';
      const parts = rawIsin.split(' - ');
      setIsin(parts[0] || '');
      setWkn(parts[1] || '');
      setBank(editing.bank || '');
      setPriceFetched(true);
      setLookupFeedback(null);
      setIsinLookingUp(false);
    } else {
      setStep('details');
      setSelected(null);
      setSearchQuery('');
      setSearchResults([]);
      setTxType('buy');
      setAssetType('stock');
      setQuantity('');
      setPrice('');
      setPriceFetching(false);
      setPriceFetched(false);
      setDate(todayISO());
      setNote('');
      setName('');
      setSymbol('');
      setIsin('');
      setWkn('');
      setBank('');
      setLookupFeedback(null);
      setIsinLookingUp(false);
    }
  }, [open, editing]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (priceTimer.current) clearTimeout(priceTimer.current);
      if (isinTimer.current) clearTimeout(isinTimer.current);
    };
  }, []);

  const performLookup = useCallback(async (query: string, explicit = false) => {
    if (!query || typeof query !== 'string') return;
    const clean = query.trim().toUpperCase();
    if (!clean || clean.length < 5) return;

    // Immediately deduce German WKN if applicable
    const immediateWkn = extractWknFromIsin(clean);
    if (immediateWkn) {
      setWkn((prev) => prev || immediateWkn);
    }

    setIsinLookingUp(true);
    setLookupFeedback(null);

    let config = null;
    try {
      config = await getApiKeyConfig();
    } catch (err) {
      console.warn('Failed to get API config:', err);
    }

    if (!config?.apiKey) {
      if (explicit || clean.length === 12) {
        setLookupFeedback({
          type: 'info',
          text: 'Kein API-Key hinterlegt. Bitte erstelle unter Einstellungen einen kostenlosen Finnhub-Key für automatische Live-Kurse.',
        });
      }
      setIsinLookingUp(false);
      return;
    }

    setPriceFetching(true);
    try {
      const result = await lookupSecurityByIsin(clean);
      if (result && (result.symbol || result.name || (typeof result.price === 'number' && result.price > 0))) {
        // 1. "Symbol / Ticker": Replace typed ISIN with actual fetched Finnhub ticker (e.g. 'IKOR.L')
        if (result.symbol) {
          setSymbol(result.symbol);
        }
        if (clean.length === 12) {
          setIsin(clean);
        }
        // 2. "Name": Asset Name
        if (result.name) {
          setName(result.name);
        }
        if (result.wkn) {
          setWkn(result.wkn);
        }
        if (result.assetType) {
          setAssetType(result.assetType);
        }
        // 3. "Current Price" / "Price": Live price
        if (typeof result.price === 'number' && result.price > 0) {
          setPrice(result.price.toString());
          setPriceFetched(true);
          const formattedPrice = result.price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          setLookupFeedback({
            type: 'success',
            text: `Finnhub: ${result.name || result.symbol || clean} (${result.symbol || clean}) gefunden · Live-Kurs: ${formattedPrice} € eingetragen`,
          });
        } else {
          setLookupFeedback({
            type: 'success',
            text: `Finnhub: ${result.name || result.symbol || clean} (${result.symbol || clean}) gefunden · Bitte Kurs manuell eingeben.`,
          });
        }
      } else {
        // 4. If API fails or doesn't find the ISIN, keep typed ISIN and let user fill out name and price manually
        if (clean.length === 12) {
          setIsin(clean);
        }
        if (explicit || clean.length === 12) {
          setLookupFeedback({
            type: 'info',
            text: `Keine Daten für ISIN "${clean}" bei Finnhub gefunden. Du kannst Name und Kurs manuell eintragen.`,
          });
        }
      }
    } catch (err) {
      console.error('Lookup failed in modal:', err);
      // Keep typed ISIN and allow manual entry
      if (clean.length === 12) {
        setIsin(clean);
      }
      if (explicit || clean.length === 12) {
        setLookupFeedback({
          type: 'error',
          text: 'Finnhub-Abfrage fehlgeschlagen. Du kannst Name und Kurs manuell eintragen.',
        });
      }
    } finally {
      setIsinLookingUp(false);
      setPriceFetching(false);
    }
  }, []);

  function handleIsinChange(val: string) {
    if (typeof val !== 'string') return;
    const clean = val.toUpperCase().trim();
    setIsin(clean);

    const extracted = extractWknFromIsin(clean);
    if (extracted && !wkn) {
      setWkn(extracted);
    }

    if (isinTimer.current) clearTimeout(isinTimer.current);

    // If 12-char ISIN entered, auto-query Finnhub
    if (clean.length === 12) {
      isinTimer.current = setTimeout(() => {
        performLookup(clean, false);
      }, 300);
    }
  }

  function handleSymbolChange(val: string) {
    if (typeof val !== 'string') return;
    const clean = val.toUpperCase().trim();
    setSymbol(clean);

    // If user enters a 12-char ISIN into the Symbol / Ticker field
    const isIsin = clean.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(clean);

    if (isIsin) {
      setIsin(clean);
      const extracted = extractWknFromIsin(clean);
      if (extracted && !wkn) {
        setWkn(extracted);
      }
      if (isinTimer.current) clearTimeout(isinTimer.current);
      isinTimer.current = setTimeout(() => {
        performLookup(clean, false);
      }, 300);
    }
  }

  function handleWknChange(val: string) {
    if (typeof val !== 'string') return;
    const clean = val.toUpperCase().trim();
    setWkn(clean);

    if (clean.length === 6 && !symbol && !isin) {
      if (isinTimer.current) clearTimeout(isinTimer.current);
      isinTimer.current = setTimeout(() => {
        performLookup(clean, false);
      }, 400);
    }
  }

  // Debounced search (only when modal is open and in search step)
  useEffect(() => {
    if (!open || step !== 'search') return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchSymbol(searchQuery);
        setSearchResults(Array.isArray(results) ? results : []);
      } catch (err) {
        console.error('Search error in modal:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, step, open]);

  // Auto-fetch current price when symbol changes (details step, only when open and not editing)
  useEffect(() => {
    if (!open || step !== 'details' || editing) return;
    if (!symbol || !symbol.trim()) return;
    if (isinLookingUp) return;
    // Don't refetch if user already has a price and is editing it manually
    if (priceFetched && price) return;
    // Skip if symbol is still an ISIN (will be resolved by ISIN lookup)
    if (symbol.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(symbol)) return;

    if (priceTimer.current) clearTimeout(priceTimer.current);
    setPriceFetching(true);
    priceTimer.current = setTimeout(async () => {
      try {
        const quote = await fetchSingleQuote(symbol);
        if (quote && typeof quote.price === 'number' && quote.price > 0) {
          setPrice(quote.price.toString());
          setPriceFetched(true);
        }
      } catch (err) {
        console.error('Quote error in modal:', err);
      } finally {
        setPriceFetching(false);
      }
    }, 600);
    return () => {
      if (priceTimer.current) clearTimeout(priceTimer.current);
    };
  }, [symbol, step, editing, priceFetched, price, isinLookingUp, open]);

  // Focus first input on details step only when open
  useEffect(() => {
    if (open && step === 'details' && !editing) {
      const t = setTimeout(() => firstInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step, editing, open]);

  if (!open) return null;

  function selectResult(r: SearchResult) {
    setSelected(r);
    setSymbol(r.symbol);
    setName(r.name);
    setAssetType(r.type === 'etf' ? 'etf' : 'stock');
    setPriceFetched(false);
    setPrice('');
    setLookupFeedback(null);

    const cleanQuery = searchQuery.trim().toUpperCase();
    if (cleanQuery.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(cleanQuery)) {
      setIsin(cleanQuery);
      const extracted = extractWknFromIsin(cleanQuery);
      if (extracted) setWkn(extracted);
    }
    setStep('details');
  }

  function handleManualEntry() {
    setSelected(null);
    const input = searchQuery.trim().toUpperCase();
    setSymbol(input);
    setName('');
    setPriceFetched(false);
    setPrice('');
    setLookupFeedback(null);
    setStep('details');

    if (input.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(input)) {
      setIsin(input);
      const extracted = extractWknFromIsin(input);
      if (extracted) setWkn(extracted);
      setTimeout(() => {
        performLookup(input, true);
      }, 100);
    }
  }

  function handleSave() {
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    if (!symbol || !qty || !prc || !date) return;

    const combinedIsin = [isin.trim(), wkn.trim()].filter(Boolean).join(' - ');

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
      isin: combinedIsin || undefined,
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
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Transaktion bearbeiten' : 'Neue Transaktion'}
              </h2>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setStep(step === 'details' ? 'search' : 'details')}
                  className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                >
                  {step === 'details' ? (
                    <>
                      <Search size={12} />
                      <span>Wertpapier-Suche</span>
                    </>
                  ) : (
                    <span>Direkt-Formular</span>
                  )}
                </button>
              )}
            </div>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
                    Symbol / Ticker <span className="text-red-500">*</span>
                  </label>
                  {isinLookingUp ? (
                    <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium animate-pulse">
                      <Loader2 size={13} className="animate-spin text-green-600 dark:text-green-400" />
                      <span>Finnhub lädt Daten…</span>
                    </span>
                  ) : priceFetched && price && symbol ? (
                    <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
                      <CheckCircle2 size={12} />
                      <span>Finnhub-Daten geladen</span>
                    </span>
                  ) : null}
                </div>
                <div className="relative">
                  <input
                    ref={firstInputRef}
                    type="text"
                    value={symbol}
                    onChange={(e) => handleSymbolChange(e.target.value)}
                    onBlur={() => {
                      const clean = symbol.toUpperCase().trim();
                      if (clean.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(clean)) {
                        performLookup(clean, false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const clean = symbol.toUpperCase().trim();
                        if (clean.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(clean)) {
                          e.preventDefault();
                          performLookup(clean, true);
                        }
                      }
                    }}
                    placeholder="Ticker oder ISIN (z.B. AAPL, IKOR.L, IE0008471009)"
                    className={`w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono ${
                      isinLookingUp ? 'pr-10 ring-1 ring-green-500/50' : ''
                    }`}
                  />
                  {isinLookingUp && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-sans font-medium">
                      <Loader2 size={15} className="animate-spin text-green-600 dark:text-green-400" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  Tippe einen Ticker ein oder gib eine 12-stellige ISIN ein — Finnhub ersetzt die ISIN automatisch durch den Ticker und füllt Name &amp; Live-Kurs aus.
                </p>
              </div>

              {/* ISIN / WKN mit Finnhub Live-Abfrage */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
                    ISIN &amp; WKN <span className="text-gray-400 font-normal">(Live-Datenabfrage)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => performLookup(isin || symbol, true)}
                    disabled={isinLookingUp || (!isin.trim() && !symbol.trim())}
                    className="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isinLookingUp ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Finnhub fragt ab…
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        Finnhub Live-Abfrage
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
                      placeholder="ISIN (z.B. IE00B4L5Y983)"
                      maxLength={12}
                      className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono tracking-wider text-xs"
                    />
                    {isinLookingUp && (
                      <Loader2 size={13} className="animate-spin text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    )}
                  </div>
                  <span className="text-gray-400 dark:text-gray-500 text-sm font-medium">-</span>
                  <input
                    type="text"
                    value={wkn}
                    onChange={(e) => handleWknChange(e.target.value)}
                    placeholder="WKN (z.B. A1JX52)"
                    maxLength={6}
                    className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono tracking-wider text-xs"
                  />
                </div>

                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Sobald eine 12-stellige ISIN eingegeben wird, ermittelt Finnhub Ticker, Name, WKN und den aktuellen Live-Kurs automatisch.
                </p>

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
                    {lookupFeedback.type === 'success' && <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-green-600 dark:text-green-400" />}
                    {lookupFeedback.type === 'error' && <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />}
                    {lookupFeedback.type === 'info' && <AlertCircle size={15} className="shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />}
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
              </div>

              {/* Wertpapiername */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                  Name (Asset Name)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Apple Inc. oder iShares Core FTSE 100"
                  className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              {/* Quantity & Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Stückzahl <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="10"
                    className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      Kurs / Preis in € <span className="text-red-500">*</span>
                      {priceFetching && <Loader2 size={12} className="animate-spin text-gray-400" />}
                    </span>
                    {priceFetched && !priceFetching && price && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-md">
                        <TrendingUp size={10} />
                        Live-Kurs
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => { setPrice(e.target.value); setPriceFetched(true); }}
                    placeholder={priceFetching ? 'Lade…' : '150.00'}
                    className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
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
