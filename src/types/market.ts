export type MarketTab = 'KOSPI' | 'KOSDAQ';

export type MarketStatus = 'top' | 'up' | 'avg' | 'down' | 'bottom';

export interface MarketData {
  tab: MarketTab;
  accumulatedAmount: number;
  changeRate: number;
  status: MarketStatus;
  fetchedAt: string;
  isFallback: boolean;
  isMarketClosed: boolean;
}

export interface CachedMarketData extends MarketData {
  cachedAt: string;
}

export const INDEX_CODES: Record<MarketTab, string> = {
  KOSPI: '0001',
  KOSDAQ: '1001',
};
