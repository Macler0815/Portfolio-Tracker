import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Loader2, Building2, TrendingUp, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Transaction, TransactionType, AssetType } from '@/lib/types';
import {
  searchSymbol,
  lookupSecurityByIsin,
  extractWknFromIsin,
  fetchSecurityDetails,
  fetchSingleQuote,
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

export function TransactionModal({ open, editing, onClose, onSave, knownBanks }: TransactionModalProps) {
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

  // Autocomplete search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Status & Feedback
  const [priceFetching, setPriceFetching] = useState(false);
  const [priceFetched, setPriceFetched] = useState(false);
  const [isinLookingUp, setIsinLookingUp] = useState(false);
  const [lookupFeedback, setLookupFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Refs
  const firstInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchQueryRef = useRef<string>('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset or load editing transaction & handle INITIAL FOCUS (Symbol/Ticker)
  useEffect(() => {
    if (!open) return;

    if (editing) {
      setTxType(editing.type);
      setAssetType(editing.assetType);
      setSymbol(editing.symbol);
      searchQueryRef.current = editing.symbol;
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
      setShowDropdown(false);
      setSearchResults([]);
      setLookupFeedback(null);
      setIsinLookingUp(false);
      setPriceFetching(false);
    } else {
      setTxType('buy');
      setAssetType('stock');
      setSymbol('');
      searchQueryRef.current = '';
      setName('');
      setIsin('');
      setWkn('');
      setQuantity('');
      setPrice('');
      setDate(todayISO());
      setBank('');
      setNote('');
      setPriceFetched(false);
      setShowDropdown(false);
      setSearchResults([]);
      setLookupFeedback(null);
      setIsinLookingUp(false);
      setPriceFetching(false);

      // FIX INITIAL FOCUS (Symbol/Ticker):
      // As soon as the modal opens in 'new transaction' mode, automatically focus the cursor
      // inside the "Symbol / Ticker" input field using firstInputRef.
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [open, editing]);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (isinTimer.current) clearTimeout(isinTimer.current);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        firstInputRef.current &&
        !firstInputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Perform ISIN / WKN lookup
  const performIsinLookup = useCallback(async (query: string, explicit = false) => {
    if (!query || typeof query !== 'string') return;
    const clean = query.trim().toUpperCase();
    if (!clean || clean.length < 5) return;

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
          text: 'Kein API-Key hinterlegt. Bitte erstelle unter Einstellungen einen Finnhub-Key für automatische Live-Kurse.',
        });
      }
      setIsinLookingUp(false);
      return;
    }

    setPriceFetching(true);
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
          const formatted = result.price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          setLookupFeedback({
            type: 'success',
            text: `Finnhub: ${result.name || result.symbol || clean} (${result.symbol || clean}) · Live-Kurs: ${formatted} €`,
          });
        } else {
          setLookupFeedback({
            type: 'success',
            text: `Finnhub: ${result.name || result.symbol || clean} gefunden · Bitte Kurs manuell eingeben.`,
          });
        }
      } else {
        if (clean.length === 12) setIsin(clean);
        if (explicit || clean.length === 12) {
          setLookupFeedback({
            type: 'info',
            text: `Keine Daten für "${clean}" bei Finnhub gefunden. Du kannst Name und Kurs manuell eintragen.`,
          });
        }
      }
    } catch (err) {
      console.error('ISIN Lookup failed in modal:', err);
      if (clean.length === 12) setIsin(clean);
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

  // Live Finnhub search when typing in "Symbol / Ticker"
  const handleSymbolChange = (val: string) => {
    const clean = val.toUpperCase();
    setSymbol(clean);
    searchQueryRef.current = val;

    if (searchTimer.current) clearTimeout(searchTimer.current);

    // If empty, close dropdown
    if (!val.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Check if input is a 12-char ISIN
    const isIsinFormat = clean.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(clean);
    if (isIsinFormat) {
      setIsin(clean);
      const extracted = extractWknFromIsin(clean);
      if (extracted && !wkn) setWkn(extracted);
      setShowDropdown(false);
      performIsinLookup(clean, false);
      return;
    }

    setSearching(true);
    setShowDropdown(true);
    setHighlightedIndex(-1);

    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchSymbol(val.trim());
        const validResults = Array.isArray(results) ? results : [];
        setSearchResults(validResults);
        setShowDropdown(validResults.length > 0);
      } catch (err) {
        console.error('Finnhub symbol search error:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  };

  // selectResult function:
  // - Populate "Symbol / Ticker" (r.symbol), "Name" (r.name), deduce "AssetType" ('etf' | 'stock')
  // - If search query was a 12-char ISIN, preserve that ISIN in ISIN field & auto-populate WKN via extractWknFromIsin(searchQuery)
  // - When fetching live price, if regional exchange (.DU, .HM, .SG, etc.) returns NO price (0 or undefined),
  //   automatically try fallback fetch for main German tickers (.DE or .F) of same asset.
  //   If all fail, leave price field blank but fully editable.
  // - Immediately after dropdown closes & fields are filled, shift active keyboard cursor into "Stückzahl" using quantityInputRef.current?.focus()
  const selectResult = async (r: SearchResult) => {
    // 1. Immediately close dropdown and clear search
    setShowDropdown(false);
    setSearchResults([]);

    const chosenSymbol = r.symbol.toUpperCase();
    const query = searchQueryRef.current.trim().toUpperCase();
    const is12CharIsinQuery = query.length === 12 && /^[A-Z]{2}[A-Z0-9]{10}$/.test(query);

    // Populate Symbol / Ticker
    setSymbol(chosenSymbol);

    // Populate Name
    setName(r.name || chosenSymbol);

    // Deduce AssetType ('etf' or 'stock')
    const deducedType: AssetType =
      r.type === 'etf' || /etf|ucits|ishares|vanguard|xtrackers|amundi/i.test(r.name || '')
        ? 'etf'
        : 'stock';
    setAssetType(deducedType);

    // Preserve ISIN & WKN if user had entered an ISIN
    if (is12CharIsinQuery) {
      setIsin(query);
      const derivedWkn = extractWknFromIsin(query);
      if (derivedWkn) setWkn(derivedWkn);
    }

    // FIX AFTER-SELECTION FOCUS (Stückzahl):
    // Immediately after a result is selected and dropdown closes, shift focus directly to "Stückzahl"
    setTimeout(() => {
      quantityInputRef.current?.focus();
    }, 30);

    // Prepare loading state
    setPriceFetching(true);
    setIsinLookingUp(true);
    setLookupFeedback(null);

    try {
      // Fetch security details (profile & quote)
      const details = await fetchSecurityDetails(chosenSymbol);

      // Populate ISIN & WKN if not already set by ISIN search
      if (!is12CharIsinQuery && details?.isin) {
        setIsin(details.isin);
        const wknFromIsin = details.wkn || extractWknFromIsin(details.isin);
        if (wknFromIsin) setWkn(wknFromIsin);
      } else if (!is12CharIsinQuery && details?.wkn) {
        setWkn(details.wkn);
      }

      // Improve name if details has a better company name
      if (details?.name && (!r.name || r.name === chosenSymbol)) {
        setName(details.name);
      }

      // Check price & execute German fallback (.DE or .F) if no price returned
      let resolvedPrice: number | undefined = undefined;
      if (typeof details?.price === 'number' && details.price > 0) {
        resolvedPrice = details.price;
      }

      // PRICE FALLBACK: If regional exchange (like .DU, .HM, .SG, .BE, .MU) returns NO price (0 or undefined),
      // automatically try fallback fetch for main German tickers (.DE or .F)
      if (!resolvedPrice) {
        const baseSymbol = chosenSymbol.includes('.') ? chosenSymbol.split('.')[0] : chosenSymbol;

        // Try .DE (XETRA)
        if (baseSymbol) {
          try {
            const deQuote = await fetchSingleQuote(`${baseSymbol}.DE`);
            if (deQuote?.price && deQuote.price > 0) {
              resolvedPrice = deQuote.price;
            }
          } catch {
            // ignore and try next fallback
          }
        }

        // Try .F (Frankfurt)
        if (!resolvedPrice && baseSymbol) {
          try {
            const fQuote = await fetchSingleQuote(`${baseSymbol}.F`);
            if (fQuote?.price && fQuote.price > 0) {
              resolvedPrice = fQuote.price;
            }
          } catch {
            // ignore and try next fallback
          }
        }

        // Try base symbol directly if it was regional (e.g. US main ticker)
        if (!resolvedPrice && baseSymbol && baseSymbol !== chosenSymbol) {
          try {
            const baseQuote = await fetchSingleQuote(baseSymbol);
            if (baseQuote?.price && baseQuote.price > 0) {
              resolvedPrice = baseQuote.price;
            }
          } catch {
            // ignore
          }
        }
      }

      if (resolvedPrice && resolvedPrice > 0) {
        setPrice(resolvedPrice.toString());
        setPriceFetched(true);
        const formatted = resolvedPrice.toLocaleString('de-DE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        setLookupFeedback({
          type: 'success',
          text: `Ausgewählt: ${details?.name || r.name || chosenSymbol} · Live-Kurs: ${formatted} €`,
        });
      } else {
        // If all fail, leave the price field blank but fully editable
        setPrice('');
        setPriceFetched(false);
        setLookupFeedback({
          type: 'info',
          text: `Ausgewählt: ${details?.name || r.name || chosenSymbol} · Kein Live-Kurs gefunden, bitte Kurs manuell eingeben.`,
        });
      }
    } catch (err) {
      console.error('Error fetching security details after selection:', err);
      // Leave price blank but editable on error
      setPrice('');
      setPriceFetched(false);
    } finally {
      setPriceFetching(false);
      setIsinLookingUp(false);
      // Ensure focus remains on Stückzahl
      setTimeout(() => {
        quantityInputRef.current?.focus();
      }, 50);
    }
  };

  // Keyboard navigation for dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        e.preventDefault();
        selectResult(searchResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleIsinChange = (val: string) => {
    const clean = val.toUpperCase().trim();
    setIsin(clean);

    const extracted = extractWknFromIsin(clean);
    if (extracted && !wkn) {
      setWkn(extracted);
    }

    if (isinTimer.current) clearTimeout(isinTimer.current);

    if (clean.length === 12) {
      isinTimer.current = setTimeout(() => {
        performIsinLookup(clean, false);
      }, 300);
    }
  };

  const handleWknChange = (val: string) => {
    const clean = val.toUpperCase().trim();
    setWkn(clean);

    if (clean.length === 6 && !symbol && !isin) {
      if (isinTimer.current) clearTimeout(isinTimer.current);
      isinTimer.current = setTimeout(() => {
        performIsinLookup(clean, false);
      }, 400);
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
        {/* Header - Simple and direct */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 pt-3 pb-2 z-20 border-b border-gray-100 dark:border-gray-800">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700 mx-auto mb-2" />
          <div className="flex items-center justify-between px-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editing ? 'Transaktion bearbeiten' : 'Neue Transaktion'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Schließen"
            >
              <X size={20} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Transaction Form - Loaded directly */}
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

          {/* 1. INPUT: Symbol / Ticker with INLINE AUTOCOMPLETE DROPDOWN */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                <span>Symbol / Ticker</span>
                <span className="text-red-500">*</span>
              </label>
              {searching ? (
                <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Finnhub sucht…</span>
                </span>
              ) : isinLookingUp ? (
                <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Lade Details…</span>
                </span>
              ) : priceFetched && price && symbol ? (
                <span className="flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle2 size={12} />
                  <span>Finnhub verknüpft</span>
                </span>
              ) : null}
            </div>

            <div className="relative">
              <input
                ref={firstInputRef}
                type="text"
                value={symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ticker oder Name tippen (z.B. AAPL, MSFT, EUNL.DE)"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                autoCapitalize="off"
                className={`w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono ${
                  searching || isinLookingUp ? 'pr-9' : ''
                }`}
              />
              {(searching || isinLookingUp) && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-green-600 dark:text-green-400">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              )}
            </div>

            {/* Inline Autocomplete Dropdown Menu */}
            {showDropdown && searchResults.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute left-0 right-0 top-full mt-1.5 z-40 max-h-60 overflow-y-auto rounded-2xl bg-white dark:bg-gray-850 shadow-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800"
              >
                <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800/80 text-[11px] font-medium text-gray-500 dark:text-gray-400 flex items-center justify-between">
                  <span>Finnhub Suchergebnisse ({searchResults.length})</span>
                  <span className="text-[10px]">Klick wählt &amp; füllt Felder</span>
                </div>
                {searchResults.map((r, index) => {
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <button
                      key={`${r.symbol}-${r.exchange}-${index}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectResult(r);
                      }}
                      className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors ${
                        isHighlighted
                          ? 'bg-green-50 dark:bg-green-950/50'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-sm text-gray-900 dark:text-white">
                            {r.symbol}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {r.type === 'etf' ? 'ETF' : 'Aktie'}
                          </span>
                          {r.exchange && (
                            <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
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
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Beim Tippen erscheint automatisch das Finnhub-Suchmenü. Ein Klick befüllt Ticker, Name, ISIN, WKN und Live-Kurs und springt direkt zur Stückzahl.
            </p>
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

          {/* 2. INPUT: Name (Wertpapiername) */}
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Name (Wertpapiername)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Apple Inc. oder iShares Core MSCI World"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              autoCapitalize="off"
              className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          {/* 3. INPUT & 4. INPUT: ISIN & WKN fields */}
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
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  autoCapitalize="off"
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
                onChange={(e) => handleWknChange(e.target.value)}
                placeholder="WKN (z.B. 865985)"
                maxLength={6}
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                autoCapitalize="off"
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3 py-2.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none uppercase font-mono tracking-wider"
              />
            </div>
          </div>

          {/* 5. INPUT: Stückzahl & 6. INPUT: Kurs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Stückzahl <span className="text-red-500">*</span>
              </label>
              <input
                ref={quantityInputRef}
                type="number"
                step="any"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="10"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                autoCapitalize="off"
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
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                autoCapitalize="off"
                className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 border-0 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-green-500 outline-none font-mono"
              />
            </div>
          </div>

          {/* 7. INPUT: Bank / Broker */}
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
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                autoCapitalize="off"
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
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              autoCapitalize="off"
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
      </div>
    </div>
  );
}
