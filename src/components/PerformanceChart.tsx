import { useMemo } from 'react';
import type { Transaction } from '@/lib/types';

interface PerformanceChartProps {
  transactions: Transaction[];
  currentPrices: Map<string, number>;
  height?: number;
}

interface Point {
  date: string;
  invested: number;
  value: number;
}

export function PerformanceChart({ transactions, currentPrices, height = 200 }: PerformanceChartProps) {
  const { points, maxValue, minValue } = useMemo(() => {
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return { points: [] as Point[], maxValue: 0, minValue: 0 };
    }
    const sorted = [...transactions]
      .filter((t) => t && typeof t.date === 'string')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (sorted.length === 0) return { points: [] as Point[], maxValue: 0, minValue: 0 };

    const pts: Point[] = [];
    let invested = 0;
    const quantities = new Map<string, number>();

    for (const t of sorted) {
      const q = typeof t.quantity === 'number' && !isNaN(t.quantity) ? t.quantity : 0;
      const p = typeof t.price === 'number' && !isNaN(t.price) ? t.price : 0;
      if (t.type === 'buy') {
        invested += q * p + (t.fee || 0);
        quantities.set(t.symbol, (quantities.get(t.symbol) || 0) + q);
      } else {
        const currentQty = quantities.get(t.symbol) || 0;
        const sold = Math.min(q, currentQty);
        const totalQty = [...quantities.values()].reduce((a, b) => a + b, 0);
        if (totalQty > 0.0001) {
          invested -= sold * (invested / totalQty);
        }
        quantities.set(t.symbol, Math.max(0, currentQty - sold));
      }
      let value = 0;
      for (const [sym, qty] of quantities) {
        const curPrice = currentPrices?.get(sym);
        const fallbackPrice = sorted.find((x) => x.symbol === sym)?.price || 0;
        const validPrice = typeof curPrice === 'number' && !isNaN(curPrice) ? curPrice : fallbackPrice;
        value += qty * validPrice;
      }
      pts.push({ date: t.date, invested: Math.max(0, invested), value: Math.max(0, value) });
    }

    // Add current point
    let currentValue = 0;
    for (const [sym, qty] of quantities) {
      const curPrice = currentPrices?.get(sym);
      if (typeof curPrice === 'number' && !isNaN(curPrice)) {
        currentValue += qty * curPrice;
      }
    }
    if (currentValue > 0 || pts.length > 0) {
      pts.push({ date: new Date().toISOString().slice(0, 10), invested: Math.max(0, invested), value: currentValue || invested });
    }

    const allVals = pts
      .flatMap((p) => [p.value, p.invested])
      .filter((v) => typeof v === 'number' && !isNaN(v) && isFinite(v));

    return {
      points: pts,
      maxValue: allVals.length > 0 ? Math.max(...allVals, 1) : 1,
      minValue: allVals.length > 0 ? Math.min(...allVals, 0) : 0,
    };
  }, [transactions, currentPrices]);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400 dark:text-gray-500" style={{ height }}>
        Noch nicht genügend Daten für den Performance-Verlauf
      </div>
    );
  }

  const width = 100; // viewBox width (will scale)
  const range = maxValue - minValue || 1;
  const pad = range * 0.1;
  const top = maxValue + pad;
  const bottom = minValue - pad;
  const chartRange = top - bottom;

  const xStep = width / (points.length - 1);
  const valuePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * xStep} ${height - ((p.value - bottom) / chartRange) * height}`).join(' ');
  const investedPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * xStep} ${height - ((p.invested - bottom) / chartRange) * height}`).join(' ');
  const areaPath = `${valuePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="perfGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d8643" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#1d8643" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#perfGradient)" />
      <path d={investedPath} fill="none" stroke="#9ca3af" strokeWidth={0.5} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      <path d={valuePath} fill="none" stroke="#1d8643" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
