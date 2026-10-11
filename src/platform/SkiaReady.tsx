import type { ComponentType } from 'react';

// Sur iPhone, Skia est disponible immédiatement.
export function SkiaReady({ getComponent }: { getComponent: () => ComponentType }) {
  const Component = getComponent();
  return <Component />;
}
