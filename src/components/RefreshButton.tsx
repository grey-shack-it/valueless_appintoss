import { BottomCTA } from '@toss/tds-mobile';

interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
}

export function RefreshButton({ onClick, loading }: RefreshButtonProps) {
  return (
    <BottomCTA.Single
      onClick={onClick}
      disabled={loading}
      hasSafeAreaPadding
    >
      {loading ? '조회 중...' : '🔄 형! 다시 알아봐줘!'}
    </BottomCTA.Single>
  );
}
