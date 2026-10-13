import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { t, type TranslationKey } from '../i18n';
import { DEMON_POWERS } from '../modes/refuge/data';
import type { DemonPower } from '../modes/refuge/types';
import { FONT } from './fonts';

// Rôle Démon : à chaque niveau, choisir un pouvoir (nouveau, ou plus fort).

interface Props {
  level: number;
  options: DemonPower[];
  owned: Partial<Record<DemonPower, number>>;
  onPick: (power: DemonPower) => void;
}

export function DemonPowerPick({ level, options, owned, onPick }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <Animated.Text entering={ZoomIn.springify().damping(10)} style={styles.title}>
        {t('power.title', { n: level })}
      </Animated.Text>
      <Text style={styles.sub}>{t('power.sub')}</Text>
      {options.map((p, i) => {
        const next = (owned[p] ?? 0) + 1;
        const active = DEMON_POWERS[p].active;
        return (
          <Animated.View key={p} entering={ZoomIn.delay(120 + i * 90).springify().damping(13)} style={styles.full}>
            <Pressable onPress={() => onPick(p)} accessibilityRole="button" style={({ pressed }) => [styles.card, active && styles.cardActive, pressed && styles.pressed]}>
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>{DEMON_POWERS[p].icon}</Text>
              </View>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.name}>{t(`power.${p}` as TranslationKey)}</Text>
                  <Text style={styles.tag}>{next === 1 ? t('card.new') : t('power.level', { n: next })}</Text>
                </View>
                <Text style={styles.desc}>{t(`power.${p}.desc` as TranslationKey)}</Text>
                <Text style={styles.kind}>{active ? t('power.active') : t('power.passive')}</Text>
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,6,12,0.8)', alignItems: 'center', justifyContent: 'center', padding: 18, gap: 10 },
  title: { fontSize: 30, color: '#FF6B6B', fontFamily: FONT.bold, textAlign: 'center', textShadowColor: '#2B2238', textShadowRadius: 6 },
  sub: { fontSize: 15, color: '#E6C8FF', fontFamily: FONT.semi, textAlign: 'center', marginBottom: 4 },
  full: { width: '100%', maxWidth: 380 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#7E1830', borderRadius: 20, borderWidth: 4, borderColor: '#2B2238', borderBottomWidth: 9, padding: 12 },
  cardActive: { backgroundColor: '#5A2A86' },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 6 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 32 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { color: '#FFFFFF', fontSize: 19, fontFamily: FONT.bold, flexShrink: 1 },
  tag: { color: '#FFD25A', fontSize: 13, fontFamily: FONT.bold },
  desc: { color: '#F3E6FF', fontSize: 14, fontFamily: FONT.semi },
  kind: { color: '#FFB0B0', fontSize: 12, fontFamily: FONT.bold },
});
