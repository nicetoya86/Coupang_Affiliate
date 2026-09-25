import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { HookOverlay } from './HookOverlay';
import { SHOT1_DURATION_IN_FRAMES, getShot1Scale, getShotForFrame } from './shots';

export type ImpactVideoProps = {
  productImageUrl: string;
  price: string;
  hookText: string;
  variant: 'jumpcut-closeup' | 'zoomout-reveal';
};

export const ImpactVideo: React.FC<ImpactVideoProps> = ({
  productImageUrl,
  price,
  hookText,
  variant,
}) => {
  const frame = useCurrentFrame();

  let scale: number;
  let translateXPercent: number;
  let translateYPercent: number;

  if (frame < SHOT1_DURATION_IN_FRAMES) {
    scale = getShot1Scale(variant, frame);
    translateXPercent = 0;
    translateYPercent = 0;
  } else {
    const { preset } = getShotForFrame(frame);
    scale = preset.scale;
    translateXPercent = preset.translateXPercent;
    translateYPercent = preset.translateYPercent;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', filter: 'saturate(1.18)' }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translate(${translateXPercent}%, ${translateYPercent}%)` }}>
        <Img src={productImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <HookOverlay hookText={hookText} price={price} />
    </AbsoluteFill>
  );
};
