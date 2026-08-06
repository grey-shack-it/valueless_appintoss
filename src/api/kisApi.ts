import type { MarketTab } from '../types/market';

interface ApiTradingData {
  indexCode: string;
  accumulatedAmount: number;
  yesterdaySameTimeAmount: number;
}

interface TradingDataResponse {
  kospi?: ApiTradingData;
  kosdaq?: ApiTradingData;
  error?: string;
}

type MarketResponseKey = 'kospi' | 'kosdaq';

const RESPONSE_KEYS: Record<MarketTab, MarketResponseKey> = {
  KOSPI: 'kospi',
  KOSDAQ: 'kosdaq',
};

export async function fetchMarketTradingData(tab: MarketTab): Promise<{
  accumulatedAmount: number;
  yesterdaySameTimeAmount: number;
}> {
const API_BASE_URL = 'https://valueless-appintoss.vercel.app';

const res = await fetch(`${API_BASE_URL}/api/trading-data?ts=${Date.now()}`, {
  method: 'GET',
  cache: 'no-store',
  headers: {
    Accept: 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

  if (!res.ok) {
    throw new Error('거래대금 데이터를 불러오지 못했습니다.');
  }

  const data = (await res.json()) as TradingDataResponse;
  const marketData = data[RESPONSE_KEYS[tab]];

  if (!marketData) {
    throw new Error(`${tab} 거래대금 응답 데이터가 없습니다.`);
  }

  if (
    typeof marketData.accumulatedAmount !== 'number' ||
    typeof marketData.yesterdaySameTimeAmount !== 'number'
  ) {
    throw new Error(`${tab} 거래대금 응답 데이터가 올바르지 않습니다.`);
  }

  return {
    accumulatedAmount: marketData.accumulatedAmount,
    yesterdaySameTimeAmount: marketData.yesterdaySameTimeAmount,
  };
}