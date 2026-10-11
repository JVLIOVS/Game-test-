import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EQUIP_ICONS, EQUIP_TIER_COLORS } from '../game/data/equipment';
import { CARD_ICONS, PERK_SLOTS } from '../game/data/perks';
import type { CardId, EquipSlot } from '../game/types';
import { t, type TranslationKey } from '../i18n';
import { FONT } from './fonts';
import type { HudState } from './hudState';

function Bar({ ratio, color, width }: { ratio: number; color: string; width: number }) {
  return (
    <View style={[styles.barBack, { width }]}>
      <View style={[styles.barFill, { width: Math.max(0, Math.min(1, ratio)) * (width - 6), backgroundColor: color }]} />
    </View>
  );
}

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`;

export function Hud({ hud }: { hud: HudState }) {
  const insets = useSafeAreaInsets();
  const bump = useSharedValue(1);

  useEffect(() => {
    bump.value = withSequence(withTiming(1.2, { duration: 70 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [hud.wood, bump]);

  const woodStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const night = hud.phase === 'night';

  return (
    <View pointerEvents="none" style={[styles.root, { top: insets.top + 8, left: insets.left + 12, right: insets.right + 12 }]}>
      <View style={styles.topRow}>
      <View style={styles.column}>
        <Animated.View style={[styles.pill, woodStyle]} accessibilityLabel={`${t('resource.wood')} ${hud.wood}`}>
          <View style={styles.log}>
            <View style={styles.logEnd} />
          </View>
          <Text style={styles.count}>{hud.wood}</Text>
        </Animated.View>
        <View style={styles.row}>
          <View style={styles.heart} />
          <Bar ratio={hud.heroHp} color="#7BD35A" width={96} />
        </View>
      </View>

      <View style={[styles.column, styles.right]}>
        <View style={[styles.pill, night && styles.pillNight]}>
          <View style={[styles.sun, night && styles.moon]} />
          <View>
            <Text style={styles.phase}>{t(`world.${hud.worldId}` as TranslationKey)}</Text>
            <Text style={styles.phaseSub}>
              {t('hud.round', { n: hud.round })} · {night ? t('hud.zombies', { n: hud.zombiesLeft }) : formatTime(hud.dayTimer)}
            </Text>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>{t('hud.base')}</Text>
          <Bar ratio={hud.houseHp} color="#FFD25A" width={96} />
        </View>
      </View>
      </View>

      <View style={styles.xpRow}>
        <Text style={styles.levelBadge}>{t('hud.level', { n: hud.level })}</Text>
        <View style={styles.xpBack}>
          <View style={[styles.xpFill, { width: `${Math.round(hud.xpRatio * 100)}%` }]} />
        </View>
      </View>

      <View style={styles.gearRow}>
        <View style={styles.slots}>
          {Array.from({ length: PERK_SLOTS }, (_, i) => {
            const entry = hud.slots ? hud.slots.split(',')[i] : undefined;
            const [id, lvl] = entry ? entry.split(':') : [];
            return (
              <View key={i} style={[styles.slot, !id && styles.slotEmpty]}>
                {id ? (
                  <>
                    <Text style={styles.slotIcon}>{CARD_ICONS[id as CardId]}</Text>
                    <View style={styles.slotPips}>
                      {[1, 2, 3].map((n) => (
                        <View key={n} style={[styles.slotPip, n <= Number(lvl) && styles.slotPipOn]} />
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={styles.slotPlus}>+</Text>
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.slots}>
          {(['sword', 'shield', 'armor'] as EquipSlot[]).map((slot) => {
            const tier = hud[slot];
            return (
              <View key={slot} style={[styles.equip, { borderColor: tier ? EQUIP_TIER_COLORS[tier] : 'rgba(255,255,255,0.25)' }, !tier && styles.slotEmpty]}>
                <Text style={styles.equipIcon}>{EQUIP_ICONS[slot]}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {hud.bossHp >= 0 && (
        <View style={styles.bossRow}>
          <Text style={styles.bossLabel}>{t('hud.boss')}</Text>
          <View style={styles.bossBack}>
            <View style={[styles.bossFill, { width: `${Math.round(hud.bossHp * 100)}%` }]} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', gap: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelBadge: {
    color: '#2B2238',
    backgroundColor: '#5BE0FF',
    fontSize: 14,
    fontFamily: FONT.bold,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2B2238',
    paddingHorizontal: 8,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  xpBack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(43,34,56,0.8)', padding: 2 },
  xpFill: { height: 8, borderRadius: 4, backgroundColor: '#5BE0FF' },
  bossRow: { alignItems: 'center', gap: 2, marginTop: 4 },
  gearRow: { flexDirection: 'row', justifyContent: 'space-between' },
  slots: { flexDirection: 'row', gap: 6 },
  slot: {
    width: 40,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(43,34,56,0.82)',
    borderWidth: 2,
    borderColor: '#2B2238',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: { opacity: 0.45 },
  slotIcon: { fontSize: 20 },
  slotPlus: { fontSize: 20, color: '#FFFFFF', fontFamily: FONT.bold },
  slotPips: { flexDirection: 'row', gap: 2, marginTop: 1 },
  slotPip: { width: 7, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  slotPipOn: { backgroundColor: '#FFD25A' },
  equip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(43,34,56,0.82)',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  equipIcon: { fontSize: 17 },
  bossLabel: { color: '#FFB020', fontSize: 16, fontFamily: FONT.bold, textShadowColor: '#2B2238', textShadowRadius: 4 },
  bossBack: { width: '80%', maxWidth: 320, height: 16, borderRadius: 8, backgroundColor: 'rgba(43,34,56,0.9)', padding: 3, borderWidth: 2, borderColor: '#2B2238' },
  bossFill: { height: 6, borderRadius: 3, backgroundColor: '#FF5A5A' },
  column: { gap: 6 },
  right: { alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(43,34,56,0.82)',
    borderRadius: 22,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 14,
    borderWidth: 3,
    borderColor: '#2B2238',
    gap: 8,
  },
  pillNight: { backgroundColor: 'rgba(30,36,90,0.9)' },
  log: {
    width: 30,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#9B5E2E',
    borderWidth: 2,
    borderColor: '#2B2238',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 1,
  },
  logEnd: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E3B57A' },
  count: { color: '#FFD25A', fontSize: 24, fontFamily: FONT.bold, minWidth: 28 },
  sun: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFD25A', borderWidth: 2, borderColor: '#2B2238' },
  moon: { backgroundColor: '#DDE6FF' },
  phase: { color: '#FFFFFF', fontSize: 17, fontFamily: FONT.bold },
  phaseSub: { color: '#FFD25A', fontSize: 15, fontFamily: FONT.semi },
  label: { color: '#FFFFFF', fontSize: 13, fontFamily: FONT.semi, textShadowColor: '#2B2238', textShadowRadius: 3 },
  heart: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF5A5A', borderWidth: 2, borderColor: '#2B2238' },
  barBack: { height: 14, borderRadius: 7, backgroundColor: 'rgba(43,34,56,0.85)', padding: 3, borderWidth: 0 },
  barFill: { height: 8, borderRadius: 4 },
});
