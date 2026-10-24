import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Musiques et bruitages, tous fabriqués par scripts/audio (aucun son téléchargé).
// Chaque bruitage a quelques lecteurs pour pouvoir se superposer, et un délai minimal
// entre deux lectures pour ne pas saturer quand cent zombies tombent en même temps.

const SFX = {
  tap: require('../../assets/audio/sfx/tap.wav'),
  buy: require('../../assets/audio/sfx/buy.wav'),
  coin: require('../../assets/audio/sfx/coin.wav'),
  error: require('../../assets/audio/sfx/error.wav'),
  levelup: require('../../assets/audio/sfx/levelup.wav'),
  card: require('../../assets/audio/sfx/card.wav'),
  beep: require('../../assets/audio/sfx/beep.wav'),
  go: require('../../assets/audio/sfx/go.wav'),
  wheel_tick: require('../../assets/audio/sfx/wheel_tick.wav'),
  wheel_win: require('../../assets/audio/sfx/wheel_win.wav'),
  swing: require('../../assets/audio/sfx/swing.wav'),
  hit: require('../../assets/audio/sfx/hit.wav'),
  slash: require('../../assets/audio/sfx/slash.wav'),
  arrow: require('../../assets/audio/sfx/arrow.wav'),
  shot: require('../../assets/audio/sfx/shot.wav'),
  laser: require('../../assets/audio/sfx/laser.wav'),
  cannon: require('../../assets/audio/sfx/cannon.wav'),
  explosion: require('../../assets/audio/sfx/explosion.wav'),
  zap: require('../../assets/audio/sfx/zap.wav'),
  splat: require('../../assets/audio/sfx/splat.wav'),
  hurt: require('../../assets/audio/sfx/hurt.wav'),
  chop: require('../../assets/audio/sfx/chop.wav'),
  treefall: require('../../assets/audio/sfx/treefall.wav'),
  build: require('../../assets/audio/sfx/build.wav'),
  door_hit: require('../../assets/audio/sfx/door_hit.wav'),
  door_break: require('../../assets/audio/sfx/door_break.wav'),
  roar: require('../../assets/audio/sfx/roar.wav'),
  base_hit: require('../../assets/audio/sfx/base_hit.wav'),
  spawn: require('../../assets/audio/sfx/spawn.wav'),
  horn: require('../../assets/audio/sfx/horn.wav'),
  warcry: require('../../assets/audio/sfx/warcry.wav'),
  heal: require('../../assets/audio/sfx/heal.wav'),
  crate: require('../../assets/audio/sfx/crate.wav'),
  evolve: require('../../assets/audio/sfx/evolve.wav'),
  special: require('../../assets/audio/sfx/special.wav'),
  dash: require('../../assets/audio/sfx/dash.wav'),
  eliminated: require('../../assets/audio/sfx/eliminated.wav'),
  win: require('../../assets/audio/sfx/win.wav'),
  lose: require('../../assets/audio/sfx/lose.wav'),
  freeze: require('../../assets/audio/sfx/freeze.wav'),
} as const;
export type SfxName = keyof typeof SFX;

const MUSIC = {
  menu: require('../../assets/audio/music/menu.mp3'),
  waves: require('../../assets/audio/music/waves.mp3'),
  refuge: require('../../assets/audio/music/refuge.mp3'),
  epoch: require('../../assets/audio/music/epoch.mp3'),
} as const;
export type MusicName = keyof typeof MUSIC;

/** Volume de chaque bruitage (les plus fréquents sont plus discrets). */
const VOLUME: Partial<Record<SfxName, number>> = {
  tap: 0.5,
  hit: 0.55,
  swing: 0.4,
  slash: 0.55,
  arrow: 0.45,
  shot: 0.45,
  laser: 0.45,
  splat: 0.45,
  chop: 0.5,
  spawn: 0.4,
  coin: 0.55,
  door_hit: 0.6,
  wheel_tick: 0.5,
  zap: 0.5,
};
/** Délai minimal (ms) entre deux lectures du même bruitage. */
const GAP: Partial<Record<SfxName, number>> = { hit: 70, slash: 70, splat: 90, arrow: 80, shot: 80, laser: 70, coin: 90, chop: 120, spawn: 120, door_hit: 140, zap: 120, swing: 80 };
const POOL = 3;
const MUSIC_VOLUME = 0.42;
const STORAGE_KEY = 'last-emberz-audio';

const pools = new Map<SfxName, { players: AudioPlayer[]; next: number; last: number }>();
let musicPlayer: AudioPlayer | null = null;
let currentMusic: MusicName | null = null;
let musicOn = true;
let sfxOn = true;
let ready = false;
const listeners = new Set<() => void>();

function pool(name: SfxName) {
  let p = pools.get(name);
  if (!p) {
    p = { players: [], next: 0, last: 0 };
    pools.set(name, p);
  }
  return p;
}

function save() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ musicOn, sfxOn })).catch(() => {});
  listeners.forEach((l) => l());
}

function startMusic() {
  if (!musicPlayer || !musicOn) return;
  try {
    musicPlayer.play();
  } catch {
    // Sur le web, la musique attend le premier toucher (règle des navigateurs).
  }
}

export const audio = {
  /** À appeler au lancement : le son passe même en mode silencieux de l'iPhone, et se mélange aux autres apps. */
  async init() {
    if (ready) return;
    ready = true;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
    } catch {
      // ignoré (web)
    }
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        musicOn = s.musicOn !== false;
        sfxOn = s.sfxOn !== false;
        listeners.forEach((l) => l());
      }
    } catch {
      // réglages par défaut
    }
  },

  /** Joue un bruitage. */
  sfx(name: SfxName, volume = 1) {
    if (!sfxOn) return;
    const p = pool(name);
    const now = Date.now();
    if (now - p.last < (GAP[name] ?? 40)) return;
    p.last = now;
    try {
      if (p.players.length < POOL) p.players.push(createAudioPlayer(SFX[name]));
      const player = p.players[p.next % p.players.length];
      p.next++;
      player.volume = Math.min(1, (VOLUME[name] ?? 0.8) * volume);
      void player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // un son raté ne doit jamais gêner le jeu
    }
  },

  /** Change la musique de fond (null pour le silence). */
  music(name: MusicName | null) {
    if (name === currentMusic) {
      startMusic();
      return;
    }
    currentMusic = name;
    try {
      if (musicPlayer) {
        musicPlayer.pause();
        musicPlayer.remove();
        musicPlayer = null;
      }
      if (!name) return;
      musicPlayer = createAudioPlayer(MUSIC[name]);
      musicPlayer.loop = true;
      musicPlayer.volume = MUSIC_VOLUME;
      startMusic();
    } catch {
      musicPlayer = null;
    }
  },

  /** Premier toucher de l'écran : relance la musique bloquée par le navigateur. */
  unlock() {
    if (musicPlayer && musicOn && !musicPlayer.playing) startMusic();
  },

  get musicOn() {
    return musicOn;
  },
  get sfxOn() {
    return sfxOn;
  },
  setMusicOn(on: boolean) {
    musicOn = on;
    if (musicPlayer) {
      if (on) startMusic();
      else musicPlayer.pause();
    }
    save();
  },
  setSfxOn(on: boolean) {
    sfxOn = on;
    save();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
