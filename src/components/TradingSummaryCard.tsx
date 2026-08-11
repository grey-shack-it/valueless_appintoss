import { ListRow, Paragraph } from '@toss/tds-mobile';
import { formatAmount, formatChangeRate } from '../utils/status';

interface TradingSummaryCardProps {
  accumulatedAmount: number;
  changeRate: number;
  isFallback: boolean;
  isMarketClosed: boolean;
}

export function TradingSummaryCard({
  accumulatedAmount,
  changeRate,
  isFallback,
  isMarketClosed,
}: TradingSummaryCardProps) {
  const changeColor =
    changeRate > 0 ? '#F04452' : changeRate < 0 ? '#3182F6' : '#8B95A1';

  return (
    <div style={{ padding: '0 16px' }}>
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #E5E8EB',
          overflow: 'hidden',
        }}
      >
        <ListRow
          contents={
            <ListRow.Texts
              type="2RowTypeA"
              top="누적 거래대금"
              topProps={{ color: '#8B95A1', fontWeight: 'medium' }}
              bottom={formatAmount(accumulatedAmount)}
              bottomProps={{ color: '#191F28', fontWeight: 'bold' }}
            />
          }
        />
        <ListRow
          contents={
            <ListRow.Texts
              type="2RowTypeA"
              top="전일 동시간 대비"
              topProps={{ color: '#8B95A1', fontWeight: 'medium' }}
              bottom={formatChangeRate(changeRate)}
              bottomProps={{ color: changeColor, fontWeight: 'bold' }}
            />
          }
        />
        {(isFallback || isMarketClosed) && (
          <Paragraph typography="t7">
            <Paragraph.Text color="#8B95A1" style={{ padding: '8px 24px 0' }}>
              {isMarketClosed
                ? '장 마감 — 마지막 데이터를 표시합니다.'
                : '실시간 연결 실패 — 캐시 데이터를 표시합니다.'}
            </Paragraph.Text>
          </Paragraph>
        )}
        <Paragraph typography="t7">
          <Paragraph.Text color="#878d94" style={{ padding: '8px 24px 16px' }}>
            본 정보는 참고용이며, 투자 판단의 근거로 사용할 수 없습니다.
          </Paragraph.Text>
        </Paragraph>
      </div>
    </div>
  );
}
