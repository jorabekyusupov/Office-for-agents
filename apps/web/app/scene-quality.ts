export type GraphicsQuality = 'high' | 'balanced' | 'low';

export type GraphicsProfile = {
  dpr: [number, number];
  shadows: boolean;
  antialias: boolean;
  effects: boolean;
};

export function graphicsProfileFor(quality: GraphicsQuality): GraphicsProfile {
  if (quality === 'high') return { dpr: [1, 2], shadows: true, antialias: true, effects: true };
  if (quality === 'low') return { dpr: [1, 1], shadows: false, antialias: false, effects: false };
  return { dpr: [1, 1.5], shadows: true, antialias: true, effects: false };
}

export function defaultGraphicsQuality(prefersReducedMotion: boolean): GraphicsQuality {
  return prefersReducedMotion ? 'low' : 'balanced';
}
