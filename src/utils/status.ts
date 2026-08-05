import type { MarketStatus } from '../types/market';

export function calcChangeRate(today: number, yesterday: number): number {
  if (yesterday === 0) return 0;
  return ((today - yesterday) / yesterday) * 100;
}

export function calcStatus(changeRate: number): MarketStatus {
  if (changeRate >= 25) return 'top';
  if (changeRate >= 10) return 'up';
  if (changeRate > -10) return 'avg';
  if (changeRate > -25) return 'down';
  return 'bottom';
}

export function formatAmount(amount: number): string {
  const trillion = Math.floor(amount / 10_000);
  const hundredMillion = Math.floor(amount % 10_000);

  if (trillion > 0) {
    return `${trillion}조 ${hundredMillion.toLocaleString('ko-KR')}억원`;
  }
  return `${Math.floor(amount).toLocaleString('ko-KR')}억원`;
}

export function formatChangeRate(rate: number): string {
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(1)}%`;
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;
  const open = 9 * 60;
  const close = 15 * 60 + 30;

  return time >= open && time <= close;
}

export function getYesterdayDateString(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function getCurrentTimeHHMMSS(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}${m}${s}`;
}

export function pickRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}
