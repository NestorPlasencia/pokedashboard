export const REPORT_COLORS = ['#5b75dc', '#169c7f', '#cd873d', '#aa6cdb', '#dc6589', '#2199c6'];
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
export const signedPercent = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
