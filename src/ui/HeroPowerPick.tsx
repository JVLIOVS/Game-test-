import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { t, type TranslationKey } from '../i18n';
import { HERO_POWERS } from '../modes/refuge/heroPowers';
import type { HeroPower } from '../modes/refuge/types';
import { FONT } from './fonts';

// Survivant : régulièrement, choisir un pouvoir (nouveau, ou plus fort). Il reste jusqu'à la fin.

interface Props {
  options: HeroPower[];
  owned: Partial<Record<HeroPower, number>>;
  onPick: (power: HeroPower) => void;
}

export function HeroPowerPick({ options, owned, onPick }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <Animated.Text entering={ZoomIn.springify().damping(10)} style={styles.title}>
        {t('hero.title')}
      </Animated.Text>
      <Text style={styles.sub}>{t('hero.sub')}</Text>
      {options.map((p, i) => {
        const next = (owned[p] ?? 0) + 1;
        const active = HERO_POWERS[p].active;
        return (
          <Animated.View key={p} entering={ZoomIn.delay(120 + i * 90).springify().damping(13)} style={styles.full}>
            <Pressable onPress={() => onPick(p)} accessibilityRole="button" style={({ pressed }) => [styles.card, active && styles.cardActive, pressed && styles.pressed]}>
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>{HERO_POWERS[p].icon}</Text>
              </View>
              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text style={styles.name}>{t(`hero.${p}` as TranslationKey)}</Text>
                  <Text style={styles.tag}>{next === 1 ? t('card.new') : t('power.level', { n: next })}</Text>
                </View>
                <Text style={styles.desc}>{t(`hero.${p}.desc` as TranslationKey)}</Text>
                <Text style={styles.kind}>{active ? t('hero.active') : t('power.passive')}</Text>
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,14,30,0.82)', alignItems: 'center', justifyContent: 'center', padding: 18, gap: 10 },
  title: { fontSize: 30, color: '#FFD25A', fontFamily: FONT.bold, textAlign: 'center', textShadowColor: '#2B2238', textShadowRadius: 6 },
  sub: { fontSize: 15, color: '#D8E6FF', fontFamily: FONT.semi, textAlign: 'center', marginBottom: 4 },
  full: { width: '100%', maxWidth: 380 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#2E5AAE', borderRadius: 20, borderWidth: 4, borderColor: '#2B2238', borderBottomWidth: 9, padding: 12 },
  cardActive: { backgroundColor: '#2E8A6A' },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 6 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 32 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { color: '#FFFFFF', fontSize: 19, fontFamily: FONT.bold, flexShrink: 1 },
  tag: { color: '#FFD25A', fontSize: 13, fontFamily: FONT.bold },
  desc: { color: '#EAF2FF', fontSize: 14, fontFamily: FONT.semi },
  kind: { color: '#BFE0FF', fontSize: 12, fontFamily: FONT.bold },
});
