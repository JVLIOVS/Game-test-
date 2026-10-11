# Survival Challenge

Jeu mobile iOS de survie en 2D vue du dessus, style cartoon. Expo + React Native + TypeScript, rendu avec React Native Skia.

## État actuel : étape 2 (boucle de jeu complète)

Une seule carte, ta base au centre, la forêt autour.

- **Le jour** : coupe du bois (coupe automatique près des arbres) et dépose-le sur les **emplacements** de ta base. Le bois s'envole vers l'emplacement ; quand il est plein, le bâtiment apparaît.
- **Emplacements** : baraque (4 niveaux), palissade (4 côtés), atelier, hache (3 niveaux), tours de garde (débloquées par la baraque).
- **La nuit** : une vague de zombies sort des bords de la carte et marche sur la baraque. Ton héros les frappe tout seul, les tours tirent des flèches, la palissade les bloque. Chaque nuit est plus dure.
- **À l'aube** : la base est réparée ; les palissades détruites sont à reconstruire.
- **Mort du héros** : tout son bois reste dans un coffre à l'endroit de sa mort ; il revient 3 s plus tard à la base et peut aller le récupérer.
- **Fin de partie** : si la baraque tombe. Écran de bilan et bouton « Rejouer ».
- Particules, secousses d'écran, vibrations, chiffres de dégâts, annonces animées, textes FR / EN.

Tester dans un navigateur : ajouter `#riche` (200 bois), `#nuit` (la nuit tombe tout de suite) ou `#nuit-riche` à l'adresse.

`npm run playtest` fait jouer un robot dans la simulation et affiche le déroulé (utile pour l'équilibrage).

## Feuille de route

| # | Étape | Test |
|---|---|---|
| 1 | Héros qui bouge et récolte du bois | ✅ |
| 2 | Base à construire avec le bois, vagues de zombies la nuit, mort et coffre | ✅ |
| 3 | Pierre et nourriture, faim, nouveaux emplacements (ferme, entrepôt) | Expo Go |
| 4 | Fabrication : 10 recettes (outils, armes, armures) | Expo Go |
| 5 | Niveaux du héros et 3 compétences | Expo Go |
| 6 | Sauvegarde, missions quotidiennes, récompense de connexion | Expo Go |
| 7 | Tutoriel de 60 secondes | Expo Go |
| 8 | Premier build TestFlight | TestFlight |
| 9 | Pass mensuel, packs, écran d'offre (RevenueCat) | TestFlight |
| 10 | Finitions et envoi à l'App Store | App Store |

## Architecture

```
src/
  game/        Simulation pure TypeScript, sans React ni rendu
    types.ts       État du jeu (sérialisable : base des sauvegardes et des raids V2)
    constants.ts   Équilibrage
    simulation.ts  createGame() / step(state, input, dt)
    systems/       Héros, combat, arbres, construction, zombies, tours, cycle jour/nuit, effets
    world/         Carte, génération, plan de la base
  render/      Dessin Skia (sprites générés par code, remplaçables par des images)
  input/       Joystick virtuel + clavier (test navigateur)
  ui/          Interface React Native (compteurs, bulles d'aide)
  i18n/        Textes FR / EN
  platform/    Vibrations, chargement de Skia sur le web
  screens/     Boucle de jeu
```

Principes :
- **La simulation ne dépend pas du rendu.** Elle pourra tourner sur un serveur pour le multijoueur (coffres laissés à la mort récupérables par les autres joueurs, raids V2).
- **Emplacements** : déduits de l'état de la base (`padSpecs` dans `systems/build.ts`). Ajouter un bâtiment = une entrée de plus dans cette fonction.
- **Coffres** : laissés à la mort du héros. En V2 (en ligne), d'autres joueurs pourront les piller.
- **Sauvegarde** (étape 9) : une interface unique, branchée sur le stockage local en V1, puis sur Supabase en V2.
- **Achats** (étape 12) : une interface unique, branchée sur RevenueCat.

## Commandes

```bash
npm install
npm start            # serveur de développement Expo
npm run typecheck    # vérification TypeScript
npm run web:build    # version web dans dist/
```
