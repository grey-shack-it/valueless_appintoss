interface SpeechBubbleProps {
  message: string;
}

export function SpeechBubble({ message }: SpeechBubbleProps) {
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div
        style={{
          position: 'relative',
          backgroundColor: '#F2F4F6',
          borderRadius: 16,
          padding: '16px 20px',
          fontSize: 16,
          lineHeight: 1.5,
          color: '#191F28',
          fontWeight: 500,
        }}
      >
        {message}
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: 16,
            height: 16,
            backgroundColor: '#F2F4F6',
          }}
        />
      </div>
    </div>
  );
}
