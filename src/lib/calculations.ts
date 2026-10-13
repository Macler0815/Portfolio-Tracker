import type { Transaction, Holding, PortfolioSummary, AssetType } from './types';

export function computeHoldings(transactions: Transaction[], prices: Map<string, { price: number; fetchedAt: number }>, manualPrices: Map<string, { price: number; setAt: number }>): Holding[] {
  const map = new Map<string, Holding>();

  for (const t of transactions) {
    const key = t.symbol;
    if (!map.has(key)) {
      map.set(key, {
        symbol: t.symbol,
        name: t.name || t.symbol,
        assetType: t.assetType,
        quantity: 0,
        avgBuyPrice: 0,
        invested: 0,
        fees: 0,
        currentPrice: 0,
        marketValue: 0,
        pl: 0,
        plPercent: 0,
        allocation: 0,
        priceSource: 'missing',
        currency: 'EUR',
      });
    }
    const h = map.get(key)!;

    if (t.type === 'buy') {
      const newInvested = h.invested + t.quantity * t.price + (t.fee || 0);
      const newQty = h.quantity + t.quantity;
      h.avgBuyPrice = newQty > 0 ? newInvested / newQty : 0;
      h.invested = newInvested;
      h.quantity = newQty;
      h.fees += t.fee || 0;
    } else {
      const sellQty = Math.min(t.quantity, h.quantity);
      h.quantity -= sellQty;
      h.invested -= sellQty * h.avgBuyPrice;
      h.fees += t.fee || 0;
      if (h.quantity <= 0.0000001) {
        h.quantity = 0;
        h.invested = 0;
      }
    }
  }

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
    } else {
      h.currentPrice = h.avgBuyPrice;
      h.priceSource = 'missing';
    }
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
