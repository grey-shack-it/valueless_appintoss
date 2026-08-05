import type { MarketTab } from '../types/market';

export async function fetchMarketTradingData(tab: MarketTab): Promise<{
  accumulatedAmount: number;
  yesterdaySameTimeAmount: number;
}> {
  const params = new URLSearchParams({ tab });

  const res = await fetch(`/api/trading-data?${params.toString()}`);

  if (!res.ok) {
    throw new Error('거래대금 데이터를 불러오지 못했습니다.');
  }

  const data = (await res.json()) as {
    accumulatedAmount?: number;
    yesterdaySameTimeAmount?: number;
  };

  if (
    typeof data.accumulatedAmount !== 'number' ||
    typeof data.yesterdaySameTimeAmount !== 'number'
  ) {
    throw new Error('거래대금 응답 데이터가 올바르지 않습니다.');
  }

  return {
    accumulatedAmount: data.accumulatedAmount,
    yesterdaySameTimeAmount: data.yesterdaySameTimeAmount,
  };
}