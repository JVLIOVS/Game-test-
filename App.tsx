import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SkiaReady } from './src/platform/SkiaReady';

// Chargé à la demande : sur le web, Skia doit être prêt avant d'importer le jeu.
const loadGame = () => require('./src/screens/Root').Root;

export default function App() {
  const [fontsLoaded] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold });

  return (
    <SafeAreaProvider>
      <StatusBar hidden />
      {fontsLoaded ? <SkiaReady getComponent={loadGame} /> : <View style={{ flex: 1, backgroundColor: '#1E5B3A' }} />}
    </SafeAreaProvider>
  );
}
