import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { CARD_ICONS, PERK_PHASES, PERK_SLOTS, perkStars } from '../game/data/perks';
import type { CardId } from '../game/types';
import { t, type TranslationKey } from '../i18n';
import { FONT } from './fonts';

interface Props {
  level: number;
  cards: CardId[];
  levels: number[];
  ownedCount: number;
  rerolls: number;
  onReroll: () => void;
  onPick: (card: CardId) => void;
}

const TONES: Record<CardId, { bg: string; dark: string }> = {
  bow: { bg: '#FF7A5A', dark: '#C8452A' },
  orbit: { bg: '#F2A93B', dark: '#B87A1E' },
  bomb: { bg: '#B05BD6', dark: '#7E3AA3' },
  lightning: { bg: '#5B8DEF', dark: '#3A63B8' },
  engineer: { bg: '#4FB8B0', dark: '#2E8A84' },
  frost: { bg: '#6FB7F0', dark: '#3E86C2' },
  poison: { bg: '#7FBF3F', dark: '#55882A' },
  wolf: { bg: '#8E979E', dark: '#5E666E' },
  heal: { bg: '#7BD35A', dark: '#4E9A35' },
  woodBag: { bg: '#C88A4E', dark: '#94622F' },
};

function Card({ card, current, index, onPick }: { card: CardId; current: number; index: number; onPick: () => void }) {
  const instant = card === 'heal' || card === 'woodBag';
  const tone = TONES[card];
  const next = instant ? 1 : current + 1;
  const star = !instant && next > PERK_PHASES;
  const phase = Math.min(next, PERK_PHASES);
  const tag = instant
    ? t('card.instant')
    : current === 0
      ? t('card.new')
      : star
        ? t('card.star', { n: perkStars(next) })
        : t('card.phase', { n: next });

  return (
    <Animated.View entering={ZoomIn.delay(120 + index * 90).springify().damping(13)}>
      <Pressable
        onPress={onPick}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, { backgroundColor: tone.bg, borderBottomColor: tone.dark }, pressed && styles.pressed]}
      >
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{CARD_ICONS[card]}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {t(`perk.${card}.name${phase}` as TranslationKey)}
            </Text>
            <Text style={styles.tag}>{tag}</Text>
          </View>
          <Text style={styles.desc}>{star ? t('perk.star.desc') : t(`perk.${card}.${phase}` as TranslationKey)}</Text>
          {!instant && !star && (
            <View style={styles.pips}>
              {[1, 2, 3].map((n) => (
                <View key={n} style={[styles.pip, n <= current && styles.pipOn, n === next && styles.pipNext]} />
              ))}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function LevelUp({ level, cards, levels, ownedCount, rerolls, onReroll, onPick }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <Animated.Text entering={ZoomIn.springify().damping(10)} style={styles.title}>
        {t('levelup.title', { n: level })}
      </Animated.Text>
      <Text style={styles.sub}>
        {ownedCount >= PERK_SLOTS ? t('card.slotsFull') : `${t('levelup.sub')} · ${t('card.slots', { n: ownedCount, max: PERK_SLOTS })}`}
      </Text>
      <View style={styles.list}>
        {cards.map((card, i) => (
          <Card key={`${card}-${i}`} card={card} current={levels[i] ?? 0} index={i} onPick={() => onPick(card)} />
        ))}
      </View>
      {rerolls > 0 && (
        <Pressable onPress={onReroll} accessibilityRole="button" style={({ pressed }) => [styles.reroll, pressed && styles.pressed]}>
          <Text style={styles.rerollText}>🎲 {t('card.reroll', { n: rerolls })}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18,14,30,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 40,
    color: '#FFD25A',
    fontFamily: FONT.bold,
    textShadowColor: '#2B2238',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 3 },
  },
  sub: { fontSize: 17, color: '#FFFFFF', fontFamily: FONT.semi, marginBottom: 18, textAlign: 'center' },
  list: { width: '100%', maxWidth: 420, gap: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: '#2B2238',
    borderBottomWidth: 9,
    padding: 12,
  },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 6 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 3,
    borderColor: '#2B2238',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 36 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flexShrink: 1, fontSize: 21, color: '#FFFFFF', fontFamily: FONT.bold, textShadowColor: '#2B2238', textShadowRadius: 3 },
  tag: {
    fontSize: 12,
    color: '#2B2238',
    fontFamily: FONT.bold,
    backgroundColor: '#FFD25A',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  desc: { fontSize: 15, color: '#FFFFFF', fontFamily: FONT.semi },
  pips: { flexDirection: 'row', gap: 6, marginTop: 2 },
  pip: { width: 22, height: 8, borderRadius: 4, backgroundColor: 'rgba(43,34,56,0.35)' },
  pipOn: { backgroundColor: '#FFD25A' },
  pipNext: { backgroundColor: '#FFFFFF' },
  reroll: {
    marginTop: 16,
    backgroundColor: '#5B8DEF',
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#2B2238',
    borderBottomWidth: 7,
    paddingVertical: 8,
    paddingHorizontal: 22,
  },
  rerollText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 18 },
});
