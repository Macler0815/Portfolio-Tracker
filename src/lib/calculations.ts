import type { Transaction, Holding, PortfolioSummary } from './types';

export function computeHoldings(transactions: Transaction[], prices: Map<string, { price: number; fetchedAt: number; changePercent?: number }>, manualPrices: Map<string, { price: number; setAt: number }>): Holding[] {
  const map = new Map<string, Holding>();

  // Chronologisch aufsteigend sortieren (älteste Transaktionen zuerst),
  // damit Käufe vor Verkäufen verbucht werden und Verkäufe die Stückzahl korrekt reduzieren
  const sortedTransactions = [...(transactions || [])]
    .filter((t) => t && typeof t.symbol === 'string' && t.symbol.trim().length > 0)
    .sort((a, b) => {
      const dComp = (a.date || '').localeCompare(b.date || '');
      if (dComp !== 0) return dComp;
      const aType = (a.type || '').toLowerCase();
      const bType = (b.type || '').toLowerCase();
      if (aType !== bType) {
        return aType === 'buy' ? -1 : 1;
      }
      return 0;
    });

  for (const t of sortedTransactions) {
    const key = t.symbol.toUpperCase().trim();
    if (!map.has(key)) {
      map.set(key, {
        symbol: key,
        name: t.name || key,
        assetType: t.assetType || 'stock',
        quantity: 0,
        avgBuyPrice: 0,
        invested: 0,
        fees: 0,
        currentPrice: 0,
        price: 0,
        marketValue: 0,
        pl: 0,
        plPercent: 0,
        allocation: 0,
        priceSource: 'missing',
        currency: 'EUR',
      });
    }
    const h = map.get(key)!;
    const qty = typeof t.quantity === 'number' && !isNaN(t.quantity) ? t.quantity : parseFloat(String(t.quantity)) || 0;
    const price = typeof t.price === 'number' && !isNaN(t.price) ? t.price : parseFloat(String(t.price)) || 0;
    const fee = typeof t.fee === 'number' && !isNaN(t.fee) ? t.fee : 0;
    const isSell = (t.type || '').toLowerCase() === 'sell';

    if (!isSell) {
      // 1. BUY: Stückzahl und investierten Betrag addieren
      const newInvested = h.invested + qty * price + fee;
      const newQty = h.quantity + qty;
      h.avgBuyPrice = newQty > 0 ? newInvested / newQty : 0;
      h.invested = newInvested;
      h.quantity = newQty;
      h.fees += fee;
      if (t.name) h.name = t.name;
      if (t.assetType) h.assetType = t.assetType;
      if (t.broker || t.bank) {
        h.broker = t.broker || t.bank;
        h.bank = h.broker;
      }
      if (t.isin) h.isin = t.isin;
      if (t.wkn) h.wkn = t.wkn;
      if (t.notes || t.note) {
        h.notes = t.notes || t.note;
        h.note = h.notes;
      }
    } else {
      // 2. SELL: Stückzahl subtrahieren
      const sellQty = Math.min(qty, h.quantity);
      h.quantity -= sellQty;
      h.invested = Math.max(0, h.invested - sellQty * h.avgBuyPrice);
      h.fees += fee;

      // Wenn die Gesamtstückzahl nach dem Verkauf 0 erreicht
      if (h.quantity <= 0.0000001) {
        h.quantity = 0;
        h.invested = 0;
        h.avgBuyPrice = 0;
      }
    }
  }

  // Nur Positionen mit verbleibender Stückzahl > 0 behalten (0-Stück-Positionen sauber entfernen)
  const holdings = Array.from(map.values()).filter((h) => h.quantity > 0.0000001);

  let totalValue = 0;
  for (const h of holdings) {
    const manual = manualPrices.get(h.symbol);
    const live = prices.get(h.symbol);
    if (manual) {
      h.currentPrice = manual.price;
      h.priceSource = 'manual';
    } else if (live) {
      h.currentPrice = live.price;
      h.priceSource = 'live';
      h.dailyChangePercent = live.changePercent;
    } else {
      h.currentPrice = h.avgBuyPrice;
      h.priceSource = 'missing';
    }
    h.price = h.currentPrice;
    h.marketValue = h.quantity * h.currentPrice;
    h.pl = h.marketValue - h.invested;
    h.plPercent = h.invested > 0 ? (h.pl / h.invested) * 100 : 0;
    totalValue += h.marketValue;
  }

  for (const h of holdings) {
    h.allocation = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
  }

  holdings.sort((a, b) => b.marketValue - a.marketValue);
  return holdings;
}

export function computeSummary(holdings: Holding[]): PortfolioSummary {
  const totalValue = holdings.reduce((s, h) => s + h.marketValue, 0);
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const totalPL = totalValue - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  return { totalValue, totalInvested, totalPL, totalPLPercent, holdings };
}

export function getAllocationByType(holdings: Holding[]): { stocks: number; etfs: number } {
  let stocks = 0;
  let etfs = 0;
  for (const h of holdings) {
    if (h.assetType === 'stock') stocks += h.marketValue;
    else etfs += h.marketValue;
  }
  return { stocks, etfs };
}

export function getTopAllocations(holdings: Holding[], limit: number): { symbol: string; name: string; value: number; percent: number; color: string }[] {
  const total = holdings.reduce((s, h) => s + h.marketValue, 0);
  return holdings.slice(0, limit).map((h, i) => ({
    symbol: h.symbol,
    name: h.name,
    value: h.marketValue,
    percent: total > 0 ? (h.marketValue / total) * 100 : 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

export const CHART_COLORS = [
  '#1d8643', '#2563eb', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#ca8a04', '#db2777', '#059669', '#4f46e5',
  '#ea580c', '#0d9488',
];
