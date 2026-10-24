import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, type TranslationKey } from '../i18n';
import { DIFFICULTIES, DIFFICULTY_IDS } from '../modes/epoch/data';
import type { EpochSetup } from '../modes/epoch/sim';
import type { Difficulty } from '../modes/epoch/types';
import { audio } from '../platform/audio';
import { FONT } from '../ui/fonts';

// Avant une partie d'Époques : contre l'ordinateur (et à quel niveau) ou en duel à deux sur le même téléphone.

interface Props {
  initial: EpochSetup;
  onStart: (setup: EpochSetup) => void;
  onBack: () => void;
}

type Opponent = 'bot' | 'duel';

const DIFF_COLORS: Record<Difficulty, string> = { easy: '#A8E08A', normal: '#9EC8FF', hard: '#FFB86B', hardcore: '#FF6B6B' };

export function EpochLobby({ initial, onStart, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [opponent, setOpponent] = useState<Opponent>(initial.aiSides.length ? 'bot' : 'duel');
  const [difficulty, setDifficulty] = useState<Difficulty>(initial.difficulty);

  const modes: { id: Opponent | 'online'; icon: string }[] = [
    { id: 'bot', icon: '🤖' },
    { id: 'duel', icon: '👥' },
    { id: 'online', icon: '🌍' },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}>
        <Pressable onPress={onBack} accessibilityRole="button" style={styles.back}>
          <Text style={styles.backText}>‹ {t('lobby.back')}</Text>
        </Pressable>
        <Animated.Text entering={ZoomIn.springify().damping(11)} style={styles.title}>
          ⏳ {t('mode.epoch')}
        </Animated.Text>

        <Text style={styles.section}>{t('epochLobby.mode')}</Text>
        <View style={styles.row}>
          {modes.map((m, i) => {
            const on = opponent === m.id;
            const soon = m.id === 'online';
            return (
              <Animated.View key={m.id} entering={ZoomIn.delay(100 + i * 80).springify().damping(12)} style={styles.flex}>
                <Pressable
                  disabled={soon}
                  onPress={() => {
                    audio.sfx('tap');
                    setOpponent(m.id as Opponent);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: soon }}
                  style={({ pressed }) => [styles.modeCard, on && styles.modeOn, soon && styles.soon, pressed && styles.pressed]}
                >
                  <Text style={styles.modeIcon}>{m.icon}</Text>
                  <Text style={[styles.modeName, on && styles.dark]}>{t(`epochLobby.${m.id}` as TranslationKey)}</Text>
                  <Text style={[styles.modeDesc, on && styles.dark]}>{t(`epochLobby.${m.id}.desc` as TranslationKey)}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {opponent === 'bot' && (
          <>
            <Text style={styles.section}>{t('epochLobby.difficulty')}</Text>
            {DIFFICULTY_IDS.map((id, i) => {
              const on = difficulty === id;
              return (
                <Animated.View key={id} entering={FadeInDown.delay(70 * i)}>
                  <Pressable
                    onPress={() => {
                      audio.sfx('tap');
                      setDifficulty(id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [styles.diffCard, on && { borderColor: DIFF_COLORS[id], backgroundColor: '#4A3B66' }, pressed && styles.pressed]}
                  >
                    <View style={[styles.diffIcon, { backgroundColor: DIFF_COLORS[id] }]}>
                      <Text style={styles.diffEmoji}>{DIFFICULTIES[id].icon}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.diffName}>{t(`diff.${id}` as TranslationKey)}</Text>
                      <Text style={styles.diffDesc}>{t(`diff.${id}.desc` as TranslationKey)}</Text>
                    </View>
                    {on && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={() => {
            audio.sfx('go');
            onStart({ difficulty, aiSides: opponent === 'bot' ? [1] : [] });
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.play, pressed && styles.pressed]}
        >
          <Text style={styles.playText}>{t('lobby.play')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1E1830' },
  content: { paddingHorizontal: 18, gap: 12 },
  flex: { flex: 1 },
  back: { alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 12 },
  backText: { color: '#C9C2D8', fontSize: 18, fontFamily: FONT.bold },
  title: { color: '#FFB86B', fontSize: 34, fontFamily: FONT.bold, textAlign: 'center', marginBottom: 4 },
  section: { color: '#FFD25A', fontSize: 20, fontFamily: FONT.bold, marginTop: 8 },
  row: { flexDirection: 'row', gap: 8 },
  modeCard: { backgroundColor: '#3A2E52', borderRadius: 20, borderWidth: 4, borderColor: '#2B2238', borderBottomWidth: 9, padding: 10, alignItems: 'center', gap: 4, minHeight: 160 },
  modeOn: { backgroundColor: '#FFB86B', borderBottomColor: '#B8752A' },
  soon: { opacity: 0.55 },
  modeIcon: { fontSize: 36 },
  modeName: { fontSize: 16, color: '#FFFFFF', fontFamily: FONT.bold, textAlign: 'center' },
  modeDesc: { fontSize: 12, color: '#C9C2D8', fontFamily: FONT.semi, textAlign: 'center' },
  dark: { color: '#2B2238' },
  diffCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#3A2E52', borderRadius: 18, borderWidth: 4, borderColor: '#2B2238', padding: 12 },
  diffIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#2B2238' },
  diffEmoji: { fontSize: 28 },
  diffName: { color: '#FFFFFF', fontSize: 19, fontFamily: FONT.bold },
  diffDesc: { color: '#D8D0E8', fontSize: 14, fontFamily: FONT.semi },
  check: { color: '#7BD35A', fontSize: 28, fontFamily: FONT.bold },
  footer: { position: 'absolute', left: 18, right: 18, bottom: 0 },
  play: { backgroundColor: '#7BD35A', borderRadius: 22, borderWidth: 4, borderColor: '#2B2238', borderBottomWidth: 9, paddingVertical: 14, alignItems: 'center' },
  playText: { fontSize: 26, color: '#2B2238', fontFamily: FONT.bold },
  pressed: { transform: [{ translateY: 3 }] },
});
