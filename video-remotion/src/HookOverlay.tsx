import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { clampHookText } from './text-utils';

export const HookOverlay: React.FC<{ hookText: string }> = ({ hookText }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [8, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const displayText = clampHookText(hookText, 40);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '32px 40px 40px',
        background: 'rgba(0, 0, 0, 0.55)',
        opacity: t,
        transform: `translateY(${(1 - t) * 24}px)`,
      }}
    >
      <div
        style={{
          color: '#ffffff',
          fontWeight: 800,
          fontSize: 52,
          lineHeight: 1.25,
          fontFamily: 'sans-serif',
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        {displayText}
      </div>
    </div>
  );
};
