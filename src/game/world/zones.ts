import type { ZoneDef } from '../types';

// Catalogue des micro-mondes. Étape 1 : une seule forêt.
// Plus tard : zones de récolte reliées par leurs bords, et la zone "home" du joueur.
export const ZONES: Record<string, ZoneDef> = {
  forest_1: {
    id: 'forest_1',
    kind: 'wild',
    nameKey: 'zone.forest_1',
    width: 1400,
    height: 2000,
    seed: 1337,
    treeCount: 85,
    spawn: { x: 700, y: 1000 },
  },
};

export const START_ZONE_ID = 'forest_1';
