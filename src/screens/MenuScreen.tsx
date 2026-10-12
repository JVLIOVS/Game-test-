import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CARD_ICONS } from '../game/data/perks';
import { WEAPON_ICONS } from '../game/data/weapons';
import { t, type TranslationKey } from '../i18n';
import type { useMeta } from '../meta/useMeta';
import { META_UPGRADES, PERK_UNLOCKS, WEAPON_UNLOCKS } from '../meta/upgrades';
import { FONT } from '../ui/fonts';

type Meta = ReturnType<typeof useMeta>;

function SoulBadge({ n, big = false }: { n: number; big?: boolean }) {
  return (
    <View style={[styles.soul, big && styles.soulBig]}>
      <Text style={big ? styles.soulIconBig : styles.soulIcon}>💜</Text>
      <Text style={big ? styles.soulTextBig : styles.soulText}>{n}</Text>
    </View>
  );
}

function BuyButton({ cost, souls, done, label, onPress }: { cost: number; souls: number; done: boolean; label?: string; onPress: () => void }) {
  if (done) return <Text style={styles.done}>{label ?? t('menu.max')}</Text>;
  const can = souls >= cost;
  return (
    <Pressable
      onPress={onPress}
      disabled={!can}
      accessibilityRole="button"
      style={({ pressed }) => [styles.buy, !can && styles.buyDisabled, pressed && styles.pressed]}
    >
      <Text style={styles.buyText}>💜 {cost}</Text>
    </Pressable>
  );
}

export function MenuScreen({ meta, onPlay }: { meta: Meta; onPlay: () => void }) {
  const insets = useSafeAreaInsets();
  const m = meta.meta;
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}>
        <Animated.Text entering={ZoomIn.springify().damping(11)} style={styles.title}>
          Survival{'\n'}Challenge
        </Animated.Text>
        <SoulBadge n={m.souls} big />
        <Text style={styles.record}>
          {m.runs > 0 ? t('menu.best', { w: m.best.world + 1, n: m.best.night, k: m.best.kills }) : t('menu.firstRun')}
        </Text>

        <Animated.View entering={ZoomIn.delay(150).springify().damping(12)}>
          <Pressable onPress={onPlay} accessibilityRole="button" style={({ pressed }) => [styles.play, pressed && styles.pressed]}>
            <Text style={styles.playText}>{t('menu.play')}</Text>
          </Pressable>
        </Animated.View>
        <Text style={styles.hint}>{t('menu.hint')}</Text>

        <Text style={styles.section}>{t('menu.upgrades')}</Text>
        <View style={styles.grid}>
          {META_UPGRADES.map((u, i) => {
            const level = m.upgrades[u.id];
            const max = level >= u.maxLevel;
            return (
              <Animated.View key={u.id} entering={FadeInDown.delay(200 + i * 40)} style={styles.card}>
                <Text style={styles.cardIcon}>{u.icon}</Text>
                <Text style={styles.cardName}>{t(`meta.${u.id}` as TranslationKey)}</Text>
                <Text style={styles.cardDesc}>{t(`meta.${u.id}.desc` as TranslationKey)}</Text>
                <View style={styles.pips}>
                  {Array.from({ length: u.maxLevel }, (_, n) => (
                    <View key={n} style={[styles.pip, n < level && styles.pipOn]} />
                  ))}
                </View>
                <BuyButton cost={max ? 0 : u.cost(level + 1)} souls={m.souls} done={max} onPress={() => meta.buyUpgrade(u.id)} />
              </Animated.View>
            );
          })}
        </View>

        <Text style={styles.section}>{t('menu.weapons')}</Text>
        <View style={styles.grid}>
          {WEAPON_UNLOCKS.map((w) => {
            const owned = m.weapons.includes(w.id);
            return (
              <View key={w.id} style={[styles.card, owned && styles.cardOwned]}>
                <Text style={styles.cardIcon}>{WEAPON_ICONS[w.id]}</Text>
                <Text style={styles.cardName}>{t(`weapon.${w.id}` as TranslationKey)}</Text>
                <Text style={styles.cardDesc}>{t(`weapon.${w.id}.desc` as TranslationKey)}</Text>
                <BuyButton cost={w.cost} souls={m.souls} done={owned} label={t('menu.unlocked')} onPress={() => meta.unlockWeapon(w.id)} />
              </View>
            );
          })}
        </View>

        <Text style={styles.section}>{t('menu.perks')}</Text>
        <View style={styles.grid}>
          {PERK_UNLOCKS.map((p) => {
            const owned = m.perks.includes(p.id);
            return (
              <View key={p.id} style={[styles.card, owned && styles.cardOwned]}>
                <Text style={styles.cardIcon}>{CARD_ICONS[p.id]}</Text>
                <Text style={styles.cardName}>{t(`perk.${p.id}.name1` as TranslationKey)}</Text>
                <Text style={styles.cardDesc}>{t(`perk.${p.id}.1` as TranslationKey)}</Text>
                <BuyButton cost={p.cost} souls={m.souls} done={owned} label={t('menu.unlocked')} onPress={() => meta.unlockPerk(p.id)} />
              </View>
            );
          })}
        </View>
        {m.runs > 0 && <Text style={styles.runs}>{t('menu.runs', { n: m.runs })}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1E3B2E' },
  content: { alignItems: 'center', paddingHorizontal: 16, gap: 14 },
  title: {
    fontSize: 46,
    lineHeight: 50,
    color: '#FFD25A',
    fontFamily: FONT.bold,
    textAlign: 'center',
    textShadowColor: '#2B2238',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 4 },
  },
  soul: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soulBig: { backgroundColor: 'rgba(43,34,56,0.85)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 3, borderColor: '#2B2238' },
  soulIcon: { fontSize: 14 },
  soulIconBig: { fontSize: 22 },
  soulText: { color: '#E6C8FF', fontFamily: FONT.bold, fontSize: 14 },
  soulTextBig: { color: '#E6C8FF', fontFamily: FONT.bold, fontSize: 26 },
  record: { color: '#FFFFFF', fontFamily: FONT.semi, fontSize: 15, textAlign: 'center', opacity: 0.9 },
  play: {
    backgroundColor: '#7BD35A',
    borderRadius: 26,
    borderWidth: 4,
    borderColor: '#2B2238',
    borderBottomWidth: 10,
    paddingVertical: 14,
    paddingHorizontal: 64,
  },
  playText: { fontSize: 34, color: '#2B2238', fontFamily: FONT.bold },
  pressed: { transform: [{ translateY: 3 }], borderBottomWidth: 6 },
  hint: { color: '#CFE8C4', fontFamily: FONT.semi, fontSize: 14, textAlign: 'center', maxWidth: 360 },
  section: { color: '#FFD25A', fontFamily: FONT.bold, fontSize: 22, marginTop: 10, alignSelf: 'stretch', maxWidth: 520, width: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 520 },
  card: {
    width: 158,
    minHeight: 168,
    backgroundColor: '#3A2E52',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#2B2238',
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  cardOwned: { backgroundColor: '#2F5A3A' },
  cardIcon: { fontSize: 30 },
  cardName: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 16, textAlign: 'center' },
  cardDesc: { color: '#D9D2EA', fontFamily: FONT.semi, fontSize: 12, textAlign: 'center', flexGrow: 1 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { width: 14, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  pipOn: { backgroundColor: '#FFD25A' },
  buy: {
    backgroundColor: '#B05BD6',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#2B2238',
    borderBottomWidth: 6,
    paddingVertical: 4,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  buyDisabled: { backgroundColor: '#5E5470', opacity: 0.7 },
  buyText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 15 },
  done: { color: '#7BD35A', fontFamily: FONT.bold, fontSize: 14, marginTop: 6 },
  runs: { color: '#CFE8C4', fontFamily: FONT.semi, fontSize: 13, marginTop: 8 },
});
