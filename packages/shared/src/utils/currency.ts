/** Format an amount in EGP using Egyptian locale conventions. */
export function formatEGP(amount: number): string {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format an amount in USD. */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format price per square meter shorthand (e.g., "55K EGP/m²"). */
export function formatPricePerSqm(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M EGP/m²`;
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)}K EGP/m²`;
  }
  return `${amount} EGP/m²`;
}

/** Format large numbers with shorthand (e.g., "5M", "3.5B"). */
export function formatCompact(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K`;
  }
  return String(amount);
}

/** Convert EGP to USD at a given rate. */
export function egpToUsd(egp: number, rate = 50): number {
  return Math.round(egp / rate);
}
