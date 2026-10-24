export type TransactionType = 'buy' | 'sell';

export type AssetType = 'stock' | 'etf';

export interface Transaction {
  id: string;
  symbol: string;
  name: string;
  type: TransactionType;
  assetType: AssetType;
  quantity: number;
  price: number;
  date: string;
  fee?: number;
  bank?: string;
  broker?: string;
  note?: string;
  notes?: string;
  ticker?: string;
  yahooTicker?: string;
  isin?: string;
  wkn?: string;
}

export interface PriceQuote {
  symbol: string;
  price: number;
  currency: string;
  name?: string;
  exchange?: string;
  changePercent?: number;
  fetchedAt: number;
}

export interface ManualPrice {
  symbol: string;
  price: number;
  setAt: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  totalPL: number;
  totalPLPercent: number;
  holdings: Holding[];
}

export interface Holding {
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  avgBuyPrice: number;
  invested: number;
  fees: number;
  currentPrice: number;
  price?: number;
  marketValue: number;
  pl: number;
  plPercent: number;
  allocation: number;
  priceSource: 'live' | 'manual' | 'missing';
  currency: string;
  dailyChangePercent?: number;
  broker?: string;
  bank?: string;
  isin?: string;
  wkn?: string;
  notes?: string;
  note?: string;
}

export interface PortfolioExport {
  version: 1;
  exportedAt: number;
  transactions: Transaction[];
  manualPrices: ManualPrice[];
}
