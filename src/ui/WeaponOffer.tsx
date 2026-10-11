import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { WEAPON_ICONS } from '../game/data/weapons';
import type { WeaponType } from '../game/types';
import { t, type TranslationKey } from '../i18n';
import { FONT } from './fonts';

interface Props {
  offer: WeaponType;
  current: WeaponType;
  forge: number;
  meltWood: number;
  onTake: () => void;
  onKeep: () => void;
}

function Option({
  weapon,
  title,
  sub,
  color,
  dark,
  index,
  onPress,
}: {
  weapon: WeaponType;
  title: string;
  sub: string;
  color: string;
  dark: string;
  index: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={ZoomIn.delay(150 + index * 100).springify().damping(13)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, { backgroundColor: color, borderBottomColor: dark }, pressed && styles.pressed]}
      >
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{WEAPON_ICONS[weapon]}</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.name}>{title}</Text>
          <Text style={styles.desc}>{sub}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function WeaponOffer({ offer, current, forge, meltWood, onTake, onKeep }: Props) {
  const name = (w: WeaponType) => t(`weapon.${w}` as TranslationKey);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
      <Animated.Text entering={ZoomIn.springify().damping(10)} style={styles.title}>
        {t('offer.title')}
      </Animated.Text>
      <Text style={styles.sub}>{t('offer.sub', { n: forge })}</Text>
      <View style={styles.list}>
        <Option
          weapon={offer}
          index={0}
          title={`${t('offer.take')} : ${name(offer)}`}
          sub={t(`weapon.${offer}.desc` as TranslationKey)}
          color="#B05BD6"
          dark="#7E3AA3"
          onPress={onTake}
        />
        <Option
          weapon={current}
          index={1}
          title={`${t('offer.keep')} (${name(current)})`}
          sub={t('offer.keepSub', { n: meltWood })}
          color="#C88A4E"
          dark="#94622F"
          onPress={onKeep}
        />
      </View>
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
    fontSize: 38,
    color: '#C77DFF',
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
  icon: { fontSize: 34 },
  body: { flex: 1, minWidth: 0, gap: 4 },
  name: { fontSize: 20, color: '#FFFFFF', fontFamily: FONT.bold, textShadowColor: '#2B2238', textShadowRadius: 3 },
  desc: { fontSize: 15, color: '#FFFFFF', fontFamily: FONT.semi },
});
