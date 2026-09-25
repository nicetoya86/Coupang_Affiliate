import React from 'react';
import { clampHookText } from './text-utils';

export const HookOverlay: React.FC<{ hookText: string; price: string }> = ({ hookText, price }) => {
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
      <div
        style={{
          marginTop: 12,
          color: '#ffe066',
          fontWeight: 700,
          fontSize: 34,
          fontFamily: 'sans-serif',
        }}
      >
        {price}
      </div>
    </div>
  );
};
