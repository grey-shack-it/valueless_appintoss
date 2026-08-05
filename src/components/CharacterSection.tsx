import { STATUS_IMAGES } from '../constants/messages';
import type { MarketStatus } from '../types/market';

interface CharacterSectionProps {
  status: MarketStatus;
}

export function CharacterSection({ status }: CharacterSectionProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px 0',
      }}
    >
      <img
        src={STATUS_IMAGES[status]}
        alt={`캐릭터 - ${status}`}
        style={{
          width: 200,
          height: 200,
          objectFit: 'contain',
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
}
