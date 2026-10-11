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

**Atouts** : tuer des zombies laisse des gemmes d'XP. À chaque niveau, le jeu se met en pause et propose 3 cartes tirées au sort parmi 5 atouts : arc, haches tournoyantes, bombes, éclair, ingénieur (tourelles).
On ne peut posséder que **3 atouts**. Chaque atout a **3 phases** visibles en jeu (ex. arc → arc de feu → arc de glace), puis monte sans fin en **étoiles** (★) : il y a toujours une carte utile.

**Arme principale** : épée (arc large), lance (transperce une ligne), marteau (onde de choc), dagues (rapides, critiques). Les coffres d'arme (zombie doré) proposent d'en changer. La **forge** l'améliore avec du bois, sans limite.

**Camp** : la cabane de **bûcherons** produit des ouvriers qui coupent et rapportent le bois tout seuls ; la **caserne** produit des soldats qui défendent la base. 3 niveaux chacune.

**Micro-événements** toutes les 25 à 40 s : largage de caisse, arbre doré, embuscade, pluie de gemmes, zombie doré (qui porte une arme). Des flèches au bord de l'écran montrent où aller.

**Mondes** : Ferme → Royaume → Âge industriel → Futur. Chaque monde a 3 manches : mini-boss, mini-boss, gros boss. Battre le gros boss fait changer de monde : décor, bâtiments et zombies changent, l'invasion est plus forte, et 2 tourelles de plus sont disponibles.

**Équipement** : chaque manche gagnée donne une pièce du palier du monde (bois, fer, or, plasma) : épée (puissance), bouclier (défense), armure (agilité et vie). Visible sur le héros.

Tester dans un navigateur, en ajoutant à l'adresse : `#riche` (200 bois), `#nuit`, `#cartes` (un choix d'atout), `#boss`, `#armes` (3 atouts), `#monde2` à `#monde4`, `#equipement`, `#camp`, `#coffre`, `#evenement`. Combinables : `#monde3-equipement-boss-armes`.

`npm run playtest` fait jouer un robot dans la simulation et affiche le déroulé (utile pour l'équilibrage).

## Feuille de route

| # | Étape | Test |
|---|---|---|
| 1 | Héros qui bouge et récolte du bois | ✅ |
| 2 | Base à construire avec le bois, vagues de zombies la nuit, mort et coffre | ✅ |
| 3 | XP, cartes d'atouts, boss de fin de manche | ✅ |
| 3b | 5 atouts / 3 emplacements / 3 phases visibles, 4 mondes (mini-boss, mini-boss, gros boss), épée, bouclier, armure | ✅ |
| 3c | Étoiles d'atouts sans fin, 4 armes principales + forge, caserne et bûcherons, micro-événements, carte agrandie | ✅ |
| 4 | Micro-objectifs, XP de compte, skins et atouts à débloquer (avec sauvegarde) | Expo Go |
| 5 | Pierre et nourriture, faim, nouveaux emplacements (ferme, entrepôt) | Expo Go |
| 6 | Missions quotidiennes, récompense de connexion | Expo Go |
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
    data/          Atouts (perks.ts), mondes (worlds.ts), équipement (equipment.ts)
    systems/       Héros, combat, armes, XP, arbres, construction, zombies, tours, cycle jour/nuit, effets
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
