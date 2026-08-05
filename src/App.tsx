import { useCallback, useEffect, useState } from 'react';
import { CharacterSection } from './components/CharacterSection';
import { Header } from './components/Header';
import { RefreshButton } from './components/RefreshButton';
import { SpeechBubble } from './components/SpeechBubble';
import { TabSwitch } from './components/TabSwitch';
import { TradingSummaryCard } from './components/TradingSummaryCard';
import { MESSAGES } from './constants/messages';
import { useMarketData } from './hooks/useMarketData';
import type { MarketTab } from './types/market';
import { pickRandomMessage } from './utils/status';

function App() {
  const [tab, setTab] = useState<MarketTab>('KOSPI');
  const [message, setMessage] = useState('');
  const { data, loading, error, refresh } = useMarketData(tab);

  const updateMessage = useCallback(() => {
    if (!data) return;
    const messages = MESSAGES[data.tab][data.status];
    setMessage(pickRandomMessage(messages));
  }, [data]);

  useEffect(() => {
    updateMessage();
  }, [updateMessage]);

  const handleRefresh = async () => {
    const newData = await refresh();
    if (newData) {
      const messages = MESSAGES[newData.tab][newData.status];
      setMessage(pickRandomMessage(messages));
    }
  };

  const handleTabChange = (newTab: MarketTab) => {
    setTab(newTab);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FFFFFF',
        paddingBottom: 100,
      }}
    >
      <Header />
      <TabSwitch selected={tab} onChange={handleTabChange} />

      {loading && !data && (
        <p style={{ textAlign: 'center', padding: 40, color: '#8B95A1' }}>
          형이 시장 살피는 중...
        </p>
      )}

      {error && !data && (
        <p style={{ textAlign: 'center', padding: 40, color: '#F04452' }}>
          {error}
        </p>
      )}

      {data && (
        <>
          <CharacterSection status={data.status} />
          <SpeechBubble message={message} />
          <TradingSummaryCard
            accumulatedAmount={data.accumulatedAmount}
            changeRate={data.changeRate}
            isFallback={data.isFallback}
            isMarketClosed={data.isMarketClosed}
          />
        </>
      )}

      <RefreshButton
        onClick={handleRefresh}
        loading={loading}
      />
    </div>
  );
}

export default App;
