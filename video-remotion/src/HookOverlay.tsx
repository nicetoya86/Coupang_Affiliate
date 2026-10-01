import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { clampHookText } from './text-utils';

export const HookOverlay: React.FC<{ hookText: string }> = ({ hookText }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [4, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const displayText = clampHookText(hookText, 40);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '32px 40px 40px',
        background: 'rgba(0, 0, 0, 0.62)',
        opacity: t,
        transform: `translateY(${(1 - t) * 24}px)`,
      }}
    >
      <div
        style={{
          color: '#FFE600',
          fontWeight: 800,
          fontSize: 52,
          lineHeight: 1.25,
          fontFamily: 'sans-serif',
          textShadow: '0 3px 10px rgba(0,0,0,0.85)',
          WebkitTextStroke: '2px rgba(0,0,0,0.9)',
          paintOrder: 'stroke fill',
        }}
      >
        {displayText}
      </div>
    </div>
  );
};
