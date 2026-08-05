import type { CachedMarketData, MarketTab } from '../types/market';

const STORAGE_KEY = 'market-data-cache';

type CacheStore = Partial<Record<MarketTab, CachedMarketData>>;

export function saveMarketCache(tab: MarketTab, data: CachedMarketData): void {
  try {
    const store = loadAllCache();
    store[tab] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage unavailable
  }
}

export function loadMarketCache(tab: MarketTab): CachedMarketData | null {
  try {
    const store = loadAllCache();
    return store[tab] ?? null;
  } catch {
    return null;
  }
}

function loadAllCache(): CacheStore {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  return JSON.parse(raw) as CacheStore;
}

export function saveSameTimeSnapshot(
  tab: MarketTab,
  amount: number,
  timeKey: string,
): void {
  try {
    const key = `same-time-${tab}-${timeKey.slice(0, 4)}`;
    const raw = localStorage.getItem(key);
    const store: Record<string, number> = raw ? JSON.parse(raw) : {};
    store[timeKey] = amount;
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function loadSameTimeSnapshot(
  tab: MarketTab,
  timeKey: string,
): number | null {
  try {
    const key = `same-time-${tab}-${timeKey.slice(0, 4)}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const store: Record<string, number> = JSON.parse(raw);
    return store[timeKey] ?? null;
  } catch {
    return null;
  }
}

export function saveYesterdayAmount(
  tab: MarketTab,
  date: string,
  amount: number,
): void {
  try {
    const key = `yesterday-amount-${tab}`;
    const raw = localStorage.getItem(key);
    const store: Record<string, number> = raw ? JSON.parse(raw) : {};
    store[date] = amount;
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function loadYesterdayAmount(
  tab: MarketTab,
  date: string,
): number | null {
  try {
    const key = `yesterday-amount-${tab}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const store: Record<string, number> = JSON.parse(raw);
    return store[date] ?? null;
  } catch {
    return null;
  }
}
