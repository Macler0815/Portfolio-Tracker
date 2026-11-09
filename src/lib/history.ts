export interface HistoryEntry {
  date: string; // "YYYY-MM-DD"
  price: number;
  buyPrice: number;
  pctChange: number;
  dailyChangePercent: number;
  totalValue: number;
}

export type PortfolioHistory = Record<string, HistoryEntry[]>;

export const HISTORY_STORAGE_KEY = 'portfolio_history';
export const HISTORY_EVENT = 'portfolio_history_updated';

export function getPortfolioHistory(): PortfolioHistory {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as PortfolioHistory;
    }
    return {};
  } catch (err) {
    console.error('Error reading portfolio_history from localStorage:', err);
    return {};
  }
}

export function savePortfolioHistory(history: PortfolioHistory): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: history }));
  } catch (err) {
    console.error('Error saving portfolio_history to localStorage:', err);
  }
}

export function getHistoryForSymbol(
  history: PortfolioHistory,
  symbol?: string,
  isin?: string
): HistoryEntry[] {
  if (!symbol && !isin) return [];
  const cleanSym = symbol ? symbol.trim().toUpperCase() : '';
  const cleanIsin = isin ? isin.trim().toUpperCase() : '';

  let rawEntries: HistoryEntry[] = [];
  if (cleanSym && Array.isArray(history[cleanSym]) && history[cleanSym].length > 0) {
    rawEntries = history[cleanSym];
  } else if (cleanIsin && Array.isArray(history[cleanIsin]) && history[cleanIsin].length > 0) {
    rawEntries = history[cleanIsin];
  }

  return rawEntries.map((e) => {
    const buyPrice = typeof e.buyPrice === 'number' && !isNaN(e.buyPrice) ? e.buyPrice : 0;
    const price = typeof e.price === 'number' && !isNaN(e.price) ? e.price : 0;
    const pctChange =
      typeof e.pctChange === 'number' && !isNaN(e.pctChange)
        ? e.pctChange
        : buyPrice > 0 && price > 0
        ? ((price - buyPrice) / buyPrice) * 100
        : 0;
    const dailyChangePercent =
      typeof e.dailyChangePercent === 'number' && !isNaN(e.dailyChangePercent)
        ? e.dailyChangePercent
        : 0;
    const totalValue =
      typeof e.totalValue === 'number' && !isNaN(e.totalValue) ? e.totalValue : 0;

    return {
      date: e.date,
      price,
      buyPrice,
      pctChange,
      dailyChangePercent,
      totalValue,
    };
  });
}

export function recordHoldingsSnapshot(
  holdings: Array<{
    symbol: string;
    quantity?: number;
    isin?: string;
    avgBuyPrice?: number;
    buyPrice?: number;
    currentPrice?: number;
    price?: number;
    dailyChangePercent?: number;
  }>,
  quotes?: Map<string, { price: number; changePercent?: number }>
): PortfolioHistory {
  if (!holdings || holdings.length === 0) {
    return getPortfolioHistory();
  }

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const history = { ...getPortfolioHistory() };
  let hasChanges = false;

  for (const h of holdings) {
    if (!h.symbol) continue;
    const cleanSym = h.symbol.trim().toUpperCase();

    // Determine price
    let price = 0;
    let dailyChangePercent = 0;

    if (quotes) {
      const q = quotes.get(cleanSym) || quotes.get(h.symbol);
      if (q && typeof q.price === 'number' && q.price > 0) {
        price = q.price;
        dailyChangePercent = typeof q.changePercent === 'number' ? q.changePercent : 0;
      }
    }

    if (price <= 0) {
      price =
        typeof h.currentPrice === 'number' && h.currentPrice > 0
          ? h.currentPrice
          : typeof h.price === 'number' && h.price > 0
          ? h.price
          : 0;
      dailyChangePercent = typeof h.dailyChangePercent === 'number' ? h.dailyChangePercent : 0;
    }

    // Only record if we have a valid positive live price
    if (price <= 0) continue;

    const quantity = Math.max(0, h.quantity || 0);
    const totalValue = quantity * price;

    const rawBuyPrice =
      typeof h.avgBuyPrice === 'number' && !isNaN(h.avgBuyPrice)
        ? h.avgBuyPrice
        : typeof h.buyPrice === 'number' && !isNaN(h.buyPrice)
        ? h.buyPrice
        : 0;
    const buyPrice = Math.max(0, rawBuyPrice);
    const pctChange = buyPrice > 0 && price > 0 ? ((price - buyPrice) / buyPrice) * 100 : 0;

    const newEntry: HistoryEntry = {
      date: today,
      price,
      buyPrice,
      pctChange,
      dailyChangePercent,
      totalValue,
    };

    const keys = [cleanSym];
    if (h.isin && h.isin.trim()) {
      const cleanIsin = h.isin.trim().toUpperCase();
      if (!keys.includes(cleanIsin)) keys.push(cleanIsin);
    }

    for (const key of keys) {
      const existingEntries = Array.isArray(history[key]) ? [...history[key]] : [];
      const existingIdx = existingEntries.findIndex((e) => e.date === today);

      if (existingIdx >= 0) {
        // Update today's entry (deduplication)
        existingEntries[existingIdx] = newEntry;
      } else {
        // Append new entry
        existingEntries.push(newEntry);
      }

      // Sort chronologically ascending
      existingEntries.sort((a, b) => a.date.localeCompare(b.date));
      history[key] = existingEntries;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    savePortfolioHistory(history);
  }

  return history;
}
