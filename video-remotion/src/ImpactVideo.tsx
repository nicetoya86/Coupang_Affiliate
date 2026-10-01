import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { HookOverlay } from './HookOverlay';
import { getCamera } from './shots';

export type ImpactVideoProps = {
  productImageUrl: string;
  price: string;
  hookText: string;
  variant: 'jumpcut-closeup' | 'zoomout-reveal';
};

export const ImpactVideo: React.FC<ImpactVideoProps> = ({
  productImageUrl,
  hookText,
  variant,
}) => {
  const frame = useCurrentFrame();

  const { scale, translateXPercent, translateYPercent, blurPx } = getCamera(variant, frame);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', filter: 'saturate(1.18)' }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translate(${translateXPercent}%, ${translateYPercent}%)`, filter: `blur(${blurPx}px)` }}>
        <Img src={productImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <HookOverlay hookText={hookText} />
    </AbsoluteFill>
  );
};
