import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyMeta, type MetaSave } from './upgrades';

// Sauvegarde : une seule porte d'entrée. Aujourd'hui le téléphone (AsyncStorage),
// demain Supabase pour jouer sur plusieurs appareils, sans toucher au reste du jeu.

export interface SaveRepository {
  load(): Promise<MetaSave>;
  save(meta: MetaSave): Promise<void>;
}

const KEY = 'survival-challenge/meta/v1';

export const localSave: SaveRepository = {
  async load() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return emptyMeta();
      // Les champs ajoutés plus tard reçoivent leur valeur par défaut.
      const parsed = JSON.parse(raw) as Partial<MetaSave>;
      const base = emptyMeta();
      return { ...base, ...parsed, upgrades: { ...base.upgrades, ...parsed.upgrades }, best: { ...base.best, ...parsed.best } };
    } catch {
      return emptyMeta();
    }
  },
  async save(meta) {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(meta));
    } catch {
      // Sauvegarde impossible (mode privé du navigateur...) : le jeu continue.
    }
  },
};
