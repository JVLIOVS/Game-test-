# Last EmberZ

Jeu mobile iOS de survie en 2D vue du dessus, style cartoon. Expo + React Native + TypeScript, rendu avec React Native Skia.

L'accueil propose deux modes.

## Musique et bruitages

Tout le son est fabriqué par programme (aucun fichier téléchargé), dans `scripts/audio/` :
- `make_music.py` compose 4 musiques de hip-hop épique qui tournent en boucle : accueil (piano et cordes), mode Vagues (cuivres, chœurs, timbales), mode Refuges (trap sombre, boîte à musique), mode Époques (tambours taïko, cordes, cors) ;
- `make_sfx.py` fabrique une quarantaine de bruitages (coups, épées, flèches, explosions, portes, rugissement du Démon, roue, évolution, fanfares de victoire et de défaite…).

Relancer : `python scripts/audio/make_sfx.py` puis `python scripts/audio/make_music.py` (il faut numpy, scipy et ffmpeg). Lecture dans le jeu : `src/platform/audio.ts` (expo-audio). Boutons 🎵 et 🔊 en haut de l'accueil pour couper la musique ou les bruitages.

## Mode Époques

Deux camps face à face sur un même chemin, vu en perspective : ta base au premier plan, celle de l'adversaire à l'horizon. Chaque moitié du chemin prend le décor de l'époque de son camp.

- **Troupes** : fantassin, archer (attaque à distance) et troupe lourde, qui changent à chaque époque (gourdin, fronde, tricératops → épéiste, archer, chevalier → piquier, mousquet, canon → soldat, tireur, char → sabre laser, blaster, méca).
- **Évolution** : éliminer des troupes et frapper la base rapporte de l'expérience. Quand la jauge est pleine, le bouton « Évoluer » fait passer à l'époque suivante, de la préhistoire jusqu'à l'ère spatiale.
- **Combat** : chaque troupe choisit l'ennemi le plus proche et fonce sur lui (en largeur comme en profondeur) ; les coups ne portent qu'au contact. Les nouvelles troupes se regroupent devant la base et partent par 3.
- **Améliorations** 🔧 (5 niveaux, payées en or) : armes, armures, économie, remparts.
- **Compétences** : 📯 cri de guerre (rage pour toutes tes troupes) et 💚 soins (troupes et base).
- **Adversaire** : l'ordinateur en 🌱 Facile, ⚔️ Moyen, 🔥 Difficile (il envoie les troupes qui contrent les tiennes) ou 💀 Hardcore (en plus, son or s'ajuste à ta force pour rester dur), ou un **duel à 2** sur le même téléphone (le joueur 2 joue en haut, écran retourné). Le jeu en ligne demandera un serveur.
- **Tourelles** 🗼 : 4 emplacements sur la base ; on choisit pour chacun baliste 🏹 (rapide), canon 💣 (zone), givre ❄️ (ralentit) ou foudre ⚡ (éclair en chaîne), puis on l'améliore jusqu'au niveau 3.
- **Éliminations** selon l'époque de l'arme : assommé avec des étoiles, tranché en croix, nuage de poudre, soufflé par une explosion, désintégré en pixels. Chaque évolution affiche une grande carte de la nouvelle époque, et les troupes grandissent d'une époque à l'autre.
- **Pouvoir** à viser sur le chemin : pluie de météores, pluie de flèches, barrage de canons, frappe aérienne, laser orbital.
- **Caisses** parachutées à toucher : or, expérience, rage (troupes plus rapides et plus fortes) ou soin de la base.
- **Caméra** : elle suit le front ; glisser le doigt ou toucher la petite carte à droite pour regarder ailleurs.
- **Fin** : détruire la base adverse. Après 6 minutes, prolongation (tout se renforce), puis mort subite à 6 min 30.

Code : `src/modes/epoch/` (simulation `sim.ts`, adversaire `ai.ts`, contenu `data.ts`, rendu en perspective `render.ts`) et `src/screens/EpochScreen.tsx`. Test d'un joueur simulé contre l'ordinateur : `DIFF=hardcore npx tsx scripts/epochPlaytest.ts 5`. Web : `#epoque` (choix de l'adversaire), `#epoque-jeu`, `#epoque-hardcore`, `#epoque-duel`, `#epoque-age3`, `#epoque-riche`, `#epoque-caisse`, `#epoque-pouvoir`, `#epoque-tourelles`, `#epoque-xp`.

## Mode Refuges

Six survivants (toi et cinq robots) démarrent au centre d'une arène fermée. Huit chambres l'entourent, avec un autel au milieu où dort le **Démon**.

- **Départ** : compte à rebours de 3 s, puis tout le monde part du centre en même temps.
- **Choix (20 s)** : cours dans une chambre libre. Une fois entré, tu y restes. Les robots choisissent au hasard.
- **Arrivée du Démon** : mini-cinématique, l'autel se fissure et le Démon en sort.
- **Siège (7 min)** : reste sur le **générateur** pour gagner de l'or (40 % ailleurs). Marche sur un emplacement pour acheter :
  - porte en 5 niveaux (bois → fer → acier → blindée → titane) ;
  - générateur en 6 niveaux ;
  - 4 tourelles en 4 niveaux (simple → double → canon → laser) ;
  - réparation de la porte.
- **Équité** : les tourelles ne défendent que leur propre porte, et chaque vague de zombies est répartie entre toutes les chambres. Aucune place n'est avantagée.
- **Démon** : il cherche la chambre la moins défendue et casse la porte. Il dévore le survivant, puis gagne un niveau toutes les 50 s. Blessé, il retourne se soigner à l'autel. Les tourelles peuvent le tuer.
- **Vagues de zombies** : toutes les 35 s, avec un mini-boss une vague sur quatre.
- **But** : être le dernier trouvé, ou tenir jusqu'à la fin. Chaque partie rapporte des âmes.

- **Avant la partie** : choisis ton camp (survivant ou Démon) et, en survivant, ton personnage :
  - Max le Mécano : tourelles moins chères et plus rapides ;
  - Bruno le Gardien : porte plus solide, réparations gratuites ;
  - Lila la Veinarde : plus de chance à la roue, plus d'or au départ.
- **Manches et roue** : le siège dure 7 manches d'une minute. À la fin de chaque manche, la roue tourne : sac d'or, réparation, turbo, orage, puissance ×2, bouclier magique, artefact ou méga-tourelle. Mieux tu as défendu pendant la manche, plus tu as de chance.
- **Construction libre** : chaque chambre est une grille de 6 × 5 cases. Le générateur, la porte et la réparation ont leur place ; ailleurs, marche sur une case vide et choisis : tourelle (8 au maximum) ou artefact gagné à la roue. Reste sur une tourelle pour l'améliorer.
- **Artefacts** : méga-tourelle, bobine Tesla, totem de givre, totem de soin. Ils arrivent dans le sac 🎒 et se posent où l'on veut.
- **Bouton œil** 👁️ : vue d'ensemble de toute l'arène (portes des autres, Démon entouré). Une flèche au bord de l'écran montre où est le Démon.
- **Personnages reconnaissables** : casque de chantier et clé à molette pour le Mécano, heaume à plumet et bouclier pour le Gardien, queue de cheval, trèfle et lanterne pour la Veinarde.
- **Rôle Démon** : tu chasses les 6 survivants (robots). Tu frappes les portes en t'en approchant, tu te soignes sur l'autel, et tu choisis un pouvoir à chaque niveau : griffes toxiques, régénération, force brute, peau de pierre, et trois pouvoirs à bouton (dédoublement, rugissement, ruée). Le Démon de l'ordinateur reçoit aussi ces pouvoirs.

Code : `src/modes/refuge/` (simulation `sim.ts`, Démon `demon.ts`, défenses `defense.ts`, roue `wheel.ts`, contenu `data.ts`, robots `ai.ts`, rendu `render.ts`) et les écrans `RefugeLobby.tsx` et `RefugeScreen.tsx`.

## Mode Vagues

Une seule carte, ta base au centre, la forêt autour.

- **Le jour** : coupe du bois (coupe automatique près des arbres) et dépose-le sur les **emplacements** de ta base. Le bois s'envole vers l'emplacement ; quand il est plein, le bâtiment apparaît.
- **Emplacements** : baraque (4 niveaux), palissade (4 côtés), atelier, hache (3 niveaux), tours de garde (débloquées par la baraque).
- **La nuit** : une vague de zombies sort des bords de la carte et marche sur la baraque. Ton héros les frappe tout seul, les tours tirent des flèches, la palissade les bloque. Chaque nuit est plus dure.
- **À l'aube** : la base est réparée ; les palissades détruites sont à reconstruire.
- **Mort du héros** : tout son bois reste dans un coffre à l'endroit de sa mort ; il revient 3 s plus tard à la base et peut aller le récupérer.
- **Fin de partie** : si la baraque tombe. Écran de bilan et bouton « Rejouer ».
- Particules, secousses d'écran, vibrations, chiffres de dégâts, annonces animées, textes FR / EN.

**Atouts** : tuer des zombies laisse des gemmes d'XP. À chaque niveau, le jeu se met en pause et propose 3 cartes tirées au sort parmi 8 atouts : arc, haches tournoyantes, bombes, éclair, ingénieur, givre, poison, loups.
On peut en posséder **5**. Chaque atout a **3 phases** qui le transforment (ex. arc → flèches de feu → pluie de flèches ; bombe → bombe incendiaire → météore ; éclair → chaîne → nuage d'orage ; loups → meute avec un alpha), puis monte sans fin en **étoiles** (★).

**Progression permanente** : chaque partie rapporte des **âmes** (zombies, boss, nuits, mondes, missions). À l'accueil, elles achètent des améliorations définitives (vitalité, puissance, agilité, sagesse, réserves, fondations, relances de cartes, héritage) et débloquent les armes (lance, marteau, dagues) et les atouts (givre, poison, loups). Sauvegarde sur le téléphone (`src/meta/storage.ts`, prête pour Supabase).

**Difficulté** : la difficulté suit la puissance du joueur (tours, atouts, forge, niveau, remparts, soldats) : on ne peut plus survoler la partie. Les boss annoncent leurs attaques au sol (charge, coup au sol, invocation, crachats). Nouveaux zombies : blindés et cracheurs (à distance).

**Invasion** : chaque nuit, des hordes arrivent de 2 à 4 directions (jusqu'à plus de 100 zombies à l'écran) : marcheurs, coureurs rapides, brutes qui renversent les arbres.

**Défenses** : tours en 3 niveaux (archer en bois → tour de pierre à baliste → tour de cristal), palissade en 3 niveaux (pieux → mur de pierre → rempart à pointes), pièges à pointes, catapultes.

**Nourriture** : des animaux vivent dans la forêt (lapins, cerfs, sangliers). Le héros les chasse, et le **pavillon de chasse** produit des chasseurs. La nourriture paie les grosses améliorations.

**Missions** : 3 objectifs en cours (abattre, couper, chasser, construire, ramasser, battre un boss), récompensés en bois, nourriture et XP.

**Arme principale** : épée (arc large), lance (transperce une ligne), marteau (onde de choc), dagues (rapides, critiques). Les coffres d'arme (zombie doré) proposent d'en changer. La **forge** l'améliore avec du bois, sans limite.

**Camp** : la cabane de **bûcherons** produit des ouvriers qui coupent et rapportent le bois tout seuls ; la **caserne** produit des soldats qui défendent la base. 3 niveaux chacune.

**Micro-événements** toutes les 25 à 40 s : largage de caisse, arbre doré, embuscade, pluie de gemmes, zombie doré (qui porte une arme). Des flèches au bord de l'écran montrent où aller.

**Mondes** : Ferme → Royaume → Âge industriel → Futur. Chaque monde a 3 manches : mini-boss, mini-boss, gros boss. Battre le gros boss fait changer de monde : décor, bâtiments et zombies changent, l'invasion est plus forte, et 2 tourelles de plus sont disponibles.

**Équipement** : chaque manche gagnée donne une pièce du palier du monde (bois, fer, or, plasma) : épée (puissance), bouclier (défense), armure (agilité et vie). Visible sur le héros.

Tester dans un navigateur, en ajoutant à l'adresse : `#riche` (200 bois), `#nuit`, `#cartes` (un choix d'atout), `#boss`, `#armes` (3 atouts), `#monde2` à `#monde4`, `#equipement`, `#camp`, `#coffre`, `#evenement`, `#phase3`, `#defense`. Combinables : `#monde3-equipement-boss-armes`.

`npm run playtest` fait jouer un robot dans la simulation et affiche le déroulé (utile pour l'équilibrage).

## Feuille de route

| # | Étape | Test |
|---|---|---|
| 1 | Héros qui bouge et récolte du bois | ✅ |
| 2 | Base à construire avec le bois, vagues de zombies la nuit, mort et coffre | ✅ |
| 3 | XP, cartes d'atouts, boss de fin de manche | ✅ |
| 3b | 5 atouts / 3 emplacements / 3 phases visibles, 4 mondes (mini-boss, mini-boss, gros boss), épée, bouclier, armure | ✅ |
| 3c | Étoiles d'atouts sans fin, 4 armes principales + forge, caserne et bûcherons, micro-événements, carte agrandie | ✅ |
| 3d | Invasion massive, défenses en 3 niveaux, pièges, catapultes, nourriture et chasse, 8 atouts / 5 emplacements qui se transforment, missions | ✅ |
| R1 | Refonte étape 1 : difficulté adaptative, boss à attaques annoncées, progression permanente (âmes, améliorations, déblocages), écran d'accueil | ✅ |
| R2 | Grande carte, territoires à libérer, survivants | |
| R3 | Lignées d'armes avec évolution finale, missions liées aux territoires | |
| R4 | Vrais graphismes (packs Kenney) et animations des pouvoirs | |
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

Robots de test : `npm run playtest -- 5` (mode Vagues) et `npx tsx scripts/refugePlaytest.ts 5` (mode Refuges). Version web : ajoute `#refuge` à l'adresse pour lancer directement le mode Refuges, `#refuge-jeu` (survivant directement), `#refuge-demon` (rôle Démon), `#refuge-vitrine` (tourelles, artefacts, bouclier), `#refuge-roue` (la roue au bout de 3 s), `#refuge-demon-vite` (rôle Démon avec les pouvoirs). Rôle Démon au clavier : flèches, puis 1, 2, 3 pour les pouvoirs. Test robots du rôle Démon : `ROLE=demon npx tsx scripts/refugePlaytest.ts 5`.
