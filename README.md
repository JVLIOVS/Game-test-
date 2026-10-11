# Survival Challenge

Jeu mobile iOS de survie en 2D vue du dessus, style cartoon. Expo + React Native + TypeScript, rendu avec React Native Skia.

## État actuel : étape 1

- Héros déplacé au joystick flottant (le pouce se pose n'importe où).
- Coupe automatique des arbres à proximité : secousses, copeaux, feuilles, « +1 » qui sautent, vibrations, chute de l'arbre, souche qui repousse en 30 s.
- Une forêt de 85 arbres générée à partir d'une graine (toujours la même carte).
- Textes en français et en anglais, selon la langue du téléphone.

## Feuille de route

| # | Étape | Test |
|---|---|---|
| 1 | Héros qui bouge et récolte du bois | Web + Expo Go |
| 2 | Plusieurs micro-mondes reliés par leurs bords, pierre et nourriture, inventaire | Expo Go |
| 3 | Zone « chez soi » et premiers bâtiments de la forteresse | Expo Go |
| 4 | Faim, santé, cycle jour/nuit | Expo Go |
| 5 | Zombies la nuit, attaque automatique, mort et coffre de ressources laissé sur place | Expo Go |
| 6 | Fabrication : 10 recettes (outils, armes, armures) | Expo Go |
| 7 | Village : 6 bâtiments améliorables avec temps de construction | Expo Go |
| 8 | Niveaux du héros et 3 compétences | Expo Go |
| 9 | Sauvegarde, missions quotidiennes, récompense de connexion | Expo Go |
| 10 | Tutoriel de 60 secondes | Expo Go |
| 11 | Premier build TestFlight | TestFlight |
| 12 | Pass mensuel, packs, écran d'offre (RevenueCat) | TestFlight |
| 13 | Finitions et envoi à l'App Store | App Store |

## Architecture

```
src/
  game/        Simulation pure TypeScript, sans React ni rendu
    types.ts       État du jeu (sérialisable : base des sauvegardes et des raids V2)
    constants.ts   Équilibrage
    simulation.ts  createGame() / step(state, input, dt)
    systems/       Déplacement, récolte, effets
    world/         Catalogue des micro-mondes et génération
  render/      Dessin Skia (sprites générés par code, remplaçables par des images)
  input/       Joystick virtuel + clavier (test navigateur)
  ui/          Interface React Native (compteurs, bulles d'aide)
  i18n/        Textes FR / EN
  platform/    Vibrations, chargement de Skia sur le web
  screens/     Boucle de jeu
```

Principes :
- **La simulation ne dépend pas du rendu.** Elle pourra tourner sur un serveur pour le multijoueur (coffres laissés à la mort récupérables par les autres joueurs, raids V2).
- **Micro-mondes** : chaque zone (`ZoneDef`) a une taille, une graine et un type (`wild` pour la récolte, `home` pour la forteresse). Les sorties par les bords arrivent à l'étape 2.
- **Sauvegarde** (étape 9) : une interface unique, branchée sur le stockage local en V1, puis sur Supabase en V2.
- **Achats** (étape 12) : une interface unique, branchée sur RevenueCat.

## Commandes

```bash
npm install
npm start            # serveur de développement Expo
npm run typecheck    # vérification TypeScript
npm run web:build    # version web dans dist/
```
