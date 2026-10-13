import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t, type TranslationKey } from '../i18n';
import { CHARACTERS, CHARACTER_IDS } from '../modes/refuge/data';
import type { RefugeSetup } from '../modes/refuge/sim';
import type { CharacterId, RefugeRole } from '../modes/refuge/types';
import { FONT } from '../ui/fonts';

// Avant une partie de Refuges : choisir son camp (survivant ou Démon), puis son personnage.

interface Props {
  initial: RefugeSetup;
  onStart: (setup: RefugeSetup) => void;
  onBack: () => void;
}

const ROLES: { role: RefugeRole; icon: string; color: string; dark: string }[] = [
  { role: 'survivor', icon: '🏮', color: '#FFD25A', dark: '#B88A1E' },
  { role: 'demon', icon: '😈', color: '#FF6B6B', dark: '#B83A3A' },
];

export function RefugeLobby({ initial, onStart, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<RefugeRole>(initial.role);
  const [character, setCharacter] = useState<CharacterId>(initial.character);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}>
        <Pressable onPress={onBack} accessibilityRole="button" style={styles.back}>
          <Text style={styles.backText}>‹ {t('lobby.back')}</Text>
        </Pressable>
        <Animated.Text entering={ZoomIn.springify().damping(11)} style={styles.title}>
          🚪 {t('mode.refuge')}
        </Animated.Text>

        <Text style={styles.section}>{t('lobby.role')}</Text>
        <View style={styles.row}>
          {ROLES.map((r, i) => {
            const on = role === r.role;
            return (
              <Animated.View key={r.role} entering={ZoomIn.delay(100 + i * 80).springify().damping(12)} style={styles.flex}>
                <Pressable
                  onPress={() => setRole(r.role)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [styles.roleCard, { backgroundColor: on ? r.color : '#3A2E52', borderBottomColor: on ? r.dark : '#2B2238' }, pressed && styles.pressed]}
                >
                  <Text style={styles.roleIcon}>{r.icon}</Text>
                  <Text style={[styles.roleName, !on && styles.textLight]}>{t(`lobby.${r.role}` as TranslationKey)}</Text>
                  <Text style={[styles.roleDesc, !on && styles.textDim]}>{t(`lobby.${r.role}.desc` as TranslationKey)}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {role === 'survivor' ? (
          <>
            <Text style={styles.section}>{t('lobby.character')}</Text>
            {CHARACTER_IDS.map((id, i) => {
              const c = CHARACTERS[id];
              const on = character === id;
              return (
                <Animated.View key={id} entering={FadeInDown.delay(80 * i)}>
                  <Pressable
                    onPress={() => setCharacter(id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [styles.charCard, on && { borderColor: c.shirt, backgroundColor: '#4A3B66' }, pressed && styles.pressed]}
                  >
                    <View style={[styles.charIcon, { backgroundColor: c.shirt }]}>
                      <Text style={styles.charEmoji}>{c.icon}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.charName}>{t(`char.${id}` as TranslationKey)}</Text>
                      <Text style={styles.charDesc}>{t(`char.${id}.desc` as TranslationKey)}</Text>
                    </View>
                    {on && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                </Animated.View>
              );
            })}
          </>
        ) : (
          <Animated.View entering={FadeInDown} style={styles.demonBox}>
            <Text style={styles.demonText}>{t('lobby.demon.howto')}</Text>
          </Animated.View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => onStart({ role, character })} accessibilityRole="button" style={({ pressed }) => [styles.play, pressed && styles.pressed]}>
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
  title: { color: '#E6C8FF', fontSize: 34, fontFamily: FONT.bold, textAlign: 'center', marginBottom: 4 },
  section: { color: '#FFD25A', fontSize: 20, fontFamily: FONT.bold, marginTop: 8 },
  row: { flexDirection: 'row', gap: 12 },
  roleCard: { borderRadius: 22, borderWidth: 4, borderColor: '#2B2238', borderBottomWidth: 9, padding: 14, alignItems: 'center', gap: 4, minHeight: 170 },
  roleIcon: { fontSize: 42 },
  roleName: { fontSize: 20, color: '#2B2238', fontFamily: FONT.bold },
  roleDesc: { fontSize: 13, color: '#2B2238', fontFamily: FONT.semi, textAlign: 'center' },
  textLight: { color: '#FFFFFF' },
  textDim: { color: '#C9C2D8' },
  charCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#3A2E52', borderRadius: 18, borderWidth: 4, borderColor: '#2B2238', padding: 12 },
  charIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#2B2238' },
  charEmoji: { fontSize: 28 },
  charName: { color: '#FFFFFF', fontSize: 19, fontFamily: FONT.bold },
  charDesc: { color: '#D8D0E8', fontSize: 14, fontFamily: FONT.semi },
  check: { color: '#7BD35A', fontSize: 28, fontFamily: FONT.bold },
  demonBox: { backgroundColor: '#3A2E52', borderRadius: 18, borderWidth: 4, borderColor: '#2B2238', padding: 16, marginTop: 8 },
  demonText: { color: '#FFFFFF', fontSize: 16, fontFamily: FONT.semi, lineHeight: 24 },
  footer: { position: 'absolute', left: 18, right: 18, bottom: 0 },
  play: { backgroundColor: '#7BD35A', borderRadius: 22, borderWidth: 4, borderColor: '#2B2238', borderBottomWidth: 9, paddingVertical: 14, alignItems: 'center' },
  playText: { fontSize: 26, color: '#2B2238', fontFamily: FONT.bold },
  pressed: { transform: [{ translateY: 3 }] },
});
