import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, View } from 'react-native';

// Sur le web, Skia (CanvasKit) se télécharge avant d'afficher le jeu.
// canvaskit.wasm est copié dans public/ par `npm run web:setup`.

export function SkiaReady({ getComponent }: { getComponent: () => ComponentType }) {
  const [Component, setComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    LoadSkiaWeb({ locateFile: (file: string) => file }).then(() => {
      setComponent(() => getComponent());
    });
  }, [getComponent]);

  if (!Component) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1E5B3A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFD25A" size="large" />
      </View>
    );
  }
  return <Component />;
}
