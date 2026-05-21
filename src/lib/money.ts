// Currency formatting. Symbol comes from platform_settings; cached at runtime.

let cachedSymbol = '₹';

export function setCurrencySymbol(symbol: string) {
  if (symbol && symbol.length <= 3) cachedSymbol = symbol;
}

export function getCurrencySymbol(): string {
  return cachedSymbol;
}

export function fmtCurrency(value: number | null | undefined): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${cachedSymbol}${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtNumber(value: number | null | undefined, fractionDigits = 0): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
