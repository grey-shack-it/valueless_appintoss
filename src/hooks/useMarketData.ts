import { useCallback, useEffect, useState } from 'react';
import { fetchMarketTradingData } from '../api/kisApi';
import type { CachedMarketData, MarketData, MarketTab } from '../types/market';
import { calcChangeRate, calcStatus, isMarketOpen } from '../utils/status';
import { loadMarketCache, saveMarketCache } from '../utils/storage';

interface UseMarketDataResult {
  data: MarketData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<MarketData | null>;
}

function buildMarketData(
  tab: MarketTab,
  accumulatedAmount: number,
  changeRate: number,
  isFallback: boolean,
): MarketData {
  return {
    tab,
    accumulatedAmount,
    changeRate,
    status: calcStatus(changeRate),
    fetchedAt: new Date().toISOString(),
    isFallback,
    isMarketClosed: !isMarketOpen(),
  };
}

function fromCache(cached: CachedMarketData): MarketData {
  return {
    ...cached,
    isFallback: true,
    isMarketClosed: !isMarketOpen(),
  };
}

export function useMarketData(tab: MarketTab): UseMarketDataResult {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<MarketData | null> => {
    setLoading(true);
    setError(null);

    try {
      const { accumulatedAmount, yesterdaySameTimeAmount } =
        await fetchMarketTradingData(tab);

      const changeRate = calcChangeRate(
        accumulatedAmount,
        yesterdaySameTimeAmount,
      );
      const marketData = buildMarketData(
        tab,
        accumulatedAmount,
        changeRate,
        false,
      );

      setData(marketData);
      saveMarketCache(tab, { ...marketData, cachedAt: marketData.fetchedAt });
      return marketData;
    } catch (err) {
      const cached = loadMarketCache(tab);
      if (cached) {
        const fallbackData = fromCache(cached);
        setData(fallbackData);
        setError('실시간 데이터를 불러오지 못해 마지막 데이터를 표시합니다.');
        return fallbackData;
      }
      setError(
        err instanceof Error ? err.message : '데이터를 불러올 수 없습니다.',
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
