import { useCallback, useEffect, useState } from 'react';
import type { PerkId, WeaponType } from '../game/types';
import { localSave } from './storage';
import {
  META_UPGRADES,
  PERK_UNLOCKS,
  WEAPON_UNLOCKS,
  emptyMeta,
  soulsEarned,
  type MetaSave,
  type MetaUpgradeId,
} from './upgrades';

export interface RunResult {
  kills: number;
  bosses: number;
  nights: number;
  world: number;
  quests: number;
}

/** État de la progression permanente, chargé depuis la sauvegarde et réécrit à chaque changement. */
export function useMeta() {
  const [meta, setMeta] = useState<MetaSave>(emptyMeta);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    localSave.load().then((m) => {
      setMeta(m);
      setLoaded(true);
    });
  }, []);

  const update = useCallback((fn: (m: MetaSave) => MetaSave) => {
    setMeta((prev) => {
      const next = fn(prev);
      if (next !== prev) localSave.save(next);
      return next;
    });
  }, []);

  const buyUpgrade = useCallback(
    (id: MetaUpgradeId) =>
      update((m) => {
        const def = META_UPGRADES.find((u) => u.id === id)!;
        const level = m.upgrades[id];
        if (level >= def.maxLevel) return m;
        const cost = def.cost(level + 1);
        if (m.souls < cost) return m;
        return { ...m, souls: m.souls - cost, upgrades: { ...m.upgrades, [id]: level + 1 } };
      }),
    [update],
  );

  const unlockWeapon = useCallback(
    (id: WeaponType) =>
      update((m) => {
        const cost = WEAPON_UNLOCKS.find((w) => w.id === id)?.cost ?? Infinity;
        if (m.weapons.includes(id) || m.souls < cost) return m;
        return { ...m, souls: m.souls - cost, weapons: [...m.weapons, id] };
      }),
    [update],
  );

  const unlockPerk = useCallback(
    (id: PerkId) =>
      update((m) => {
        const cost = PERK_UNLOCKS.find((p) => p.id === id)?.cost ?? Infinity;
        if (m.perks.includes(id) || m.souls < cost) return m;
        return { ...m, souls: m.souls - cost, perks: [...m.perks, id] };
      }),
    [update],
  );

  /** Enregistre une partie terminée ; renvoie les âmes gagnées. */
  const recordRun = useCallback(
    (r: RunResult) => {
      const souls = soulsEarned(r);
      update((m) => ({
        ...m,
        souls: m.souls + souls,
        runs: m.runs + 1,
        best: {
          world: Math.max(m.best.world, r.world),
          night: Math.max(m.best.night, r.nights),
          kills: Math.max(m.best.kills, r.kills),
        },
      }));
      return souls;
    },
    [update],
  );

  return { meta, loaded, buyUpgrade, unlockWeapon, unlockPerk, recordRun };
}
