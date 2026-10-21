export function formatCurrency(value: number, currency = 'EUR', compact = false): string {
  const safeVal = typeof value === 'number' && !isNaN(value) ? value : 0;
  const opts: Intl.NumberFormatOptions = compact
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  try {
    return new Intl.NumberFormat('de-DE', { ...opts, style: 'currency', currency }).format(safeVal);
  } catch {
    return `${safeVal.toFixed(2)} ${currency}`;
  }
}

export function formatPercent(value: number, withSign = true): string {
  const safeVal = typeof value === 'number' && !isNaN(value) ? value : 0;
  const sign = withSign && safeVal > 0 ? '+' : '';
  return `${sign}${safeVal.toFixed(2)}%`;
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatNumber(value: number, decimals = 2): string {
  const safeVal = typeof value === 'number' && !isNaN(value) ? value : 0;
  try {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(safeVal);
  } catch {
    return safeVal.toFixed(decimals).replace('.', ',');
  }
}

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function formatDateTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d > 1 ? 'en' : ''}`;
}
