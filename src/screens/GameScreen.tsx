import { Canvas, Picture, Skia, useFont, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { createGame, step } from '../game/simulation';
import { t } from '../i18n';
import { createJoystick, joystickEnd, joystickMove, joystickStart, readInput } from '../input/joystick';
import { haptics } from '../platform/haptics';
import { drawWorld } from '../render/drawWorld';
import { Hint } from '../ui/Hint';
import { Hud } from '../ui/Hud';

const MAX_DT = 1 / 30;

function emptyPicture(): SkPicture {
  const recorder = Skia.PictureRecorder();
  recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return recorder.finishRecordingAsPicture();
}

export function GameScreen() {
  const { width, height } = useWindowDimensions();
  const font = useFont(require('@expo-google-fonts/fredoka/700Bold/Fredoka_700Bold.ttf'), 22);
  const picture = useSharedValue<SkPicture>(emptyPicture());

  const game = useRef(createGame()).current;
  const joystick = useRef(createJoystick()).current;
  const keys = useRef(new Set<string>()).current;

  const [wood, setWood] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);

  // Clavier pour tester dans un navigateur d'ordinateur.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (e: KeyboardEvent) => keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const up = (e: KeyboardEvent) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [keys]);

  // Boucle de jeu : simulation puis enregistrement d'une image Skia.
  useEffect(() => {
    const recorder = Skia.PictureRecorder();
    const bounds = Skia.XYWHRect(0, 0, width, height);
    const previous: SkPicture[] = [];
    let last = 0;
    let raf = 0;
    let moved = false;

    const frame = (now: number) => {
      const dt = last === 0 ? 1 / 60 : Math.min(MAX_DT, (now - last) / 1000);
      last = now;

      const input = readInput(joystick, keys);
      if (!moved && (input.moveX !== 0 || input.moveY !== 0)) {
        moved = true;
        setHasMoved(true);
      }
      step(game, input, dt);

      for (const ev of game.events) {
        if (ev.type === 'treeHit') haptics.light();
        else if (ev.type === 'treeFelled') haptics.heavy();
        else if (ev.type === 'resourceGained') setWood(game.inventory.wood);
      }
      game.events.length = 0;

      const canvas = recorder.beginRecording(bounds);
      drawWorld(canvas, game, { width, height }, font, joystick);
      const pic = recorder.finishRecordingAsPicture();
      picture.value = pic;

      // Sur le web, la mémoire de CanvasKit doit être libérée à la main.
      if (Platform.OS === 'web') {
        previous.push(pic);
        if (previous.length > 3) previous.shift()?.dispose();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, font, game, joystick, keys, picture]);

  const onStart = (e: GestureResponderEvent) => joystickStart(joystick, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onMove = (e: GestureResponderEvent) => joystickMove(joystick, e.nativeEvent.pageX, e.nativeEvent.pageY);
  const onEnd = () => joystickEnd(joystick);

  const hint = !hasMoved ? t('hint.move') : wood === 0 ? t('hint.chop') : null;

  return (
    <View
      style={styles.root}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={onStart}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Picture picture={picture} />
        </Canvas>
      </View>
      <Hud wood={wood} />
      <Hint text={hint} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1E5B3A' },
});
