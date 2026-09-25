import React from 'react';
import { Composition } from 'remotion';
import { ImpactVideo, ImpactVideoProps } from './ImpactVideo';
import { TOTAL_DURATION_IN_FRAMES } from './shots';

const FPS = 30;
const WIDTH = 1080;
const HEIGHT = 1080;

const SAMPLE_PROPS: ImpactVideoProps = {
  productImageUrl:
    'https://res.cloudinary.com/dqmdjn0o/image/upload/v1789005287/qmqsplv3i5oswhj3gd1f.png',
  price: '8,450원',
  hookText: '주차번호판 안 붙이면 벌금 문다는 거 알아?',
  variant: 'jumpcut-closeup',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="jumpcut-closeup"
        component={ImpactVideo}
        durationInFrames={TOTAL_DURATION_IN_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ ...SAMPLE_PROPS, variant: 'jumpcut-closeup' }}
      />
      <Composition
        id="zoomout-reveal"
        component={ImpactVideo}
        durationInFrames={TOTAL_DURATION_IN_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ ...SAMPLE_PROPS, variant: 'zoomout-reveal' }}
      />
    </>
  );
};
