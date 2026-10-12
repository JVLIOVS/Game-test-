import { Skia, type SkCanvas, type SkFont, type SkPath } from '@shopify/react-native-skia';
import type { Hero } from '../../game/types';
import type { JoystickState } from '../../input/joystick';
import { drawFloatingTexts, drawOutlinedText, drawParticles, drawProjectile } from '../../render/fx';
import { PALETTE as C, fill, stroke } from '../../render/palette';
import { drawHero, drawHpBar, drawShadow, drawZombie } from '../../render/sprites';
import { DEMON_RADIUS, PAD_RADIUS, WALL } from './balance';
import { CENTER, doorRect } from './layout';
import { padOffer } from './sim';
import type { Demon, RefugePad, RefugeState, RefugeTurret, Room, Survivor } from './types';

// Rendu du mode Refuges : arène sombre, refuges éclairés de l'intérieur, portes qui
// changent d'aspect à chaque niveau, tourelles qui se transforment, Démon menaçant.

const COLORS = {
  void: '#16131F',
  floor: '#2E2A40',
  floorLine: 'rgba(255,255,255,0.04)',
  plank: '#8A5A3A',
  plankLine: '#74482C',
  wall: '#5E5A78',
  wallTop: '#7A76A0',
  altar: '#5A1E2E',
  altarRune: '#C2352B',
  coin: '#FFD25A',
};

/** Porte : bois → fer → acier → blindée → titane. */
const DOOR_COLORS = ['#000', '#A86D38', '#8E979E', '#6E86A8', '#4A4F5E', '#5BE0FF'];

// Chemins créés une seule fois (sur le web, chaque objet Skia doit être libéré à la main).
const paths = new Map<string, SkPath>();
function cached(key: string, build: (b: ReturnType<typeof Skia.PathBuilder.Make>) => void): SkPath {
  let p = paths.get(key);
  if (!p) {
    const b = Skia.PathBuilder.Make();
    build(b);
    p = b.build();
    paths.set(key, p);
  }
  return p;
}

const scaleFor = (width: number) => Math.min(1.3, Math.max(0.8, width / 480));

function heroLike(s: Survivor): Hero {
  return {
    x: s.x,
    y: s.y,
    vx: s.vx,
    vy: s.vy,
    radius: 14,
    dirX: s.dirX,
    walkTime: s.walkTime,
    swingTime: 0,
    swingCooldown: 0,
    swingHitDone: false,
    target: null,
    hp: 1,
    maxHp: 1,
    hurtFlash: s.hurtFlash,
    sinceHurt: 0,
    dead: !s.alive,
    respawnTimer: 0,
    axeLevel: 1,
    level: 1,
    xp: 0,
    weapon: { type: 'sword', forge: 0 },
    comboSide: 1,
  };
}

function drawRoomFloor(canvas: SkCanvas, room: Room, mine: boolean) {
  const r = room.inner;
  canvas.drawRect(Skia.XYWHRect(r.x, r.y, r.w, r.h), fill(COLORS.plank));
  for (let y = r.y + 20; y < r.y + r.h; y += 20) canvas.drawRect(Skia.XYWHRect(r.x, y, r.w, 2), fill(COLORS.plankLine));
  // Lueur chaude du générateur : chaque refuge est une petite braise dans le noir.
  canvas.drawCircle(room.gen.x, room.gen.y, 120 + room.gen.level * 12, fill('rgba(255,170,60,0.12)'));
  if (mine) canvas.drawRect(Skia.XYWHRect(r.x, r.y, r.w, r.h), stroke('rgba(255,210,90,0.5)', 4));
}

function drawWalls(canvas: SkCanvas, room: Room) {
  for (const w of room.walls) {
    canvas.drawRect(Skia.XYWHRect(w.x - 2, w.y - 2, w.w + 4, w.h + 4), fill(C.outline));
    canvas.drawRect(Skia.XYWHRect(w.x, w.y, w.w, w.h), fill(COLORS.wall));
    canvas.drawRect(Skia.XYWHRect(w.x, w.y, w.w, 4), fill(COLORS.wallTop));
  }
}

function drawDoor(canvas: SkCanvas, room: Room) {
  const d = doorRect(room);
  if (room.door.broken) {
    for (let i = 0; i < 4; i++) canvas.drawRect(Skia.XYWHRect(d.x + 6 + i * 17, d.y + (i % 2) * 6, 12, 5), fill(DOOR_COLORS[1]));
    return;
  }
  const lv = room.door.level;
  const flash = room.door.hitFlash > 0.5;
  const color = flash ? C.white : DOOR_COLORS[lv];
  canvas.drawRect(Skia.XYWHRect(d.x - 3, d.y - 3, d.w + 6, d.h + 6), fill(C.outline));
  canvas.drawRect(Skia.XYWHRect(d.x, d.y, d.w, d.h), fill(color));
  if (lv === 1) {
    for (let x = d.x + 12; x < d.x + d.w; x += 13) canvas.drawRect(Skia.XYWHRect(x, d.y, 2, d.h), fill(C.plankDark));
  } else {
    // Rivets, de plus en plus nombreux
    for (let i = 0; i < lv + 2; i++) canvas.drawCircle(d.x + 8 + (i * (d.w - 16)) / (lv + 1), d.y + d.h / 2, 2.5, fill(C.outline));
    if (lv === 5) canvas.drawRect(Skia.XYWHRect(d.x, d.y + d.h / 2 - 2, d.w, 4), fill('rgba(255,255,255,0.7)'));
  }
}

function drawGenerator(canvas: SkCanvas, room: Room) {
  const g = room.gen;
  canvas.save();
  canvas.translate(g.x, g.y);
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-24, -34, 48, 40), 8, 8), fill(C.outline));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-21, -31, 42, 34), 6, 6), fill('#6E7A86'));
  // Roue dentée qui tourne plus vite à chaque niveau
  canvas.save();
  canvas.translate(0, -14);
  canvas.rotate(g.spin * 120, 0, 0);
  for (let i = 0; i < 6; i++) {
    canvas.rotate(60, 0, 0);
    canvas.drawRect(Skia.XYWHRect(-3, -14, 6, 6), fill(C.chestBand));
  }
  canvas.drawCircle(0, 0, 9, fill(C.chestBand));
  canvas.drawCircle(0, 0, 4, fill(C.outline));
  canvas.restore();
  for (let i = 0; i < g.level; i++) canvas.drawCircle(-15 + i * 6, 0, 2.2, fill('#FFB020'));
  canvas.restore();
}

/** Tourelle : arbalète → double arbalète → canon → laser. */
function drawTurret(canvas: SkCanvas, t: RefugeTurret, time: number) {
  if (t.level === 0) return;
  canvas.save();
  canvas.translate(t.x, t.y);
  canvas.drawCircle(0, 0, 17, fill(C.outline));
  canvas.drawCircle(0, 0, 14, fill(t.level >= 3 ? '#5E6670' : C.plankDark));
  canvas.rotate((t.angle * 180) / Math.PI, 0, 0);
  switch (t.level) {
    case 1:
      canvas.drawRect(Skia.XYWHRect(0, -3, 22, 6), fill(C.axeHandle));
      canvas.drawArc(Skia.XYWHRect(10, -14, 12, 28), -90, 180, false, stroke(C.outline, 3));
      break;
    case 2:
      for (const oy of [-6, 6]) {
        canvas.drawRect(Skia.XYWHRect(0, oy - 2.5, 22, 5), fill(C.axeHandle));
        canvas.drawArc(Skia.XYWHRect(12, oy - 8, 10, 16), -90, 180, false, stroke(C.outline, 2.5));
      }
      break;
    case 3:
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-2, -7, 28, 14), 6, 6), fill(C.outline));
      canvas.drawCircle(26, 0, 5, fill(C.hpEnemy));
      break;
    default:
      canvas.drawRect(Skia.XYWHRect(0, -4, 24, 8), fill('#C2C8E0'));
      canvas.drawCircle(24, 0, 6 + Math.sin(time * 20) * 1.5, fill('#5BE0FF'));
  }
  canvas.restore();
}

function drawDemon(canvas: SkCanvas, d: Demon, time: number) {
  const flash = d.hitFlash > 0.5;
  const body = flash ? C.white : '#3B2A5C';
  const belly = flash ? C.white : '#C2352B';
  const s = 1 + Math.min(0.6, d.level * 0.05);
  const bob = Math.sin(d.walkTime * 6) * 3;
  canvas.save();
  canvas.translate(d.x, d.y);
  if (d.state === 'heal') canvas.drawCircle(0, -40, 70, fill('rgba(140,255,140,0.18)'));
  canvas.scale(d.dirX * s, s);
  canvas.translate(d.lunge * 12, -bob);
  // Jambes
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(-22, -14, 14, 18), 6, 6), fill(C.outline));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(6, -14, 14, 18), 6, 6), fill(C.outline));
  // Corps
  canvas.drawOval(Skia.XYWHRect(-34, -74, 68, 66), fill(C.outline));
  canvas.drawOval(Skia.XYWHRect(-31, -71, 62, 60), fill(body));
  canvas.drawOval(Skia.XYWHRect(-16, -54, 32, 36), fill(belly));
  // Cornes
  for (const sx of [-1, 1]) {
    const p = cached(`horn${sx}`, (b) => b.moveTo(sx * 14, -68).lineTo(sx * 30, -100).lineTo(sx * 24, -66).close());
    canvas.drawPath(p, stroke(C.outline, 5));
    canvas.drawPath(p, fill(flash ? C.white : '#E6D2B0'));
  }
  // Yeux brillants
  const glow = 0.6 + Math.sin(time * 6) * 0.3;
  canvas.drawCircle(4, -56, 9, fill(`rgba(255,220,60,${glow * 0.5})`));
  canvas.drawCircle(18, -56, 9, fill(`rgba(255,220,60,${glow * 0.5})`));
  canvas.drawCircle(4, -56, 4.5, fill('#FFE14D'));
  canvas.drawCircle(18, -56, 4.5, fill('#FFE14D'));
  // Griffes
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(22, -46, 22 + d.lunge * 10, 12), 6, 6), fill(C.outline));
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(24, -44, 18 + d.lunge * 10, 8), 4, 4), fill(body));
  canvas.restore();
}

function drawPad(canvas: SkCanvas, room: Room, pad: RefugePad, gold: number, font: SkFont | null, time: number) {
  const offer = padOffer(room, pad);
  const can = offer !== null && gold >= offer.cost;
  const pulse = can ? 1 + Math.sin(time * 5) * 0.06 : 1;
  canvas.save();
  canvas.translate(pad.x, pad.y);
  canvas.scale(pulse, pulse);
  canvas.drawCircle(0, 0, PAD_RADIUS, fill(can ? 'rgba(255,210,90,0.28)' : 'rgba(255,255,255,0.12)'));
  canvas.drawCircle(0, 0, PAD_RADIUS, stroke(can ? '#FFD25A' : 'rgba(255,255,255,0.4)', 3));
  if (pad.hold > 0) canvas.drawArc(Skia.XYWHRect(-PAD_RADIUS, -PAD_RADIUS, PAD_RADIUS * 2, PAD_RADIUS * 2), -90, Math.min(1, pad.hold / 0.35) * 360, false, stroke('#FFFFFF', 5));
  // Icône
  const ic = fill(C.white);
  if (pad.kind === 'door') {
    canvas.drawRect(Skia.XYWHRect(-8, -12, 16, 22), ic);
    canvas.drawCircle(4, 0, 2, fill(C.outline));
  } else if (pad.kind === 'gen') {
    canvas.drawPath(cached('bolt', (b) => b.moveTo(2, -13).lineTo(-7, 2).lineTo(0, 2).lineTo(-2, 13).lineTo(7, -3).lineTo(0, -3).close()), fill(C.chestBand));
  } else if (pad.kind === 'repair') {
    canvas.drawRect(Skia.XYWHRect(-3, -11, 6, 22), fill('#7BD35A'));
    canvas.drawRect(Skia.XYWHRect(-11, -3, 22, 6), fill('#7BD35A'));
  } else if (room.turrets[pad.slot].level === 0) {
    canvas.drawCircle(0, 0, 8, ic);
    canvas.drawRect(Skia.XYWHRect(0, -3, 13, 6), ic);
  }
  canvas.restore();
  if (font) {
    const label = offer === null ? (pad.kind === 'repair' ? '…' : 'MAX') : `${offer.cost}`;
    drawOutlinedText(canvas, label, pad.x, pad.y + PAD_RADIUS + 17, font, offer === null ? C.white : can ? COLORS.coin : '#C9C2D8');
  }
}

export interface RefugeView {
  width: number;
  height: number;
}

export function drawRefuge(canvas: SkCanvas, state: RefugeState, view: RefugeView, fonts: { big: SkFont | null; small: SkFont | null }, joystick: JoystickState) {
  const player = state.survivors[0];
  const focus = player.alive ? player : state.demon;
  const scale = scaleFor(view.width);
  const halfW = view.width / scale / 2;
  const halfH = view.height / scale / 2;
  const shake = state.trauma * state.trauma * 10;
  const camX = Math.min(state.width - halfW + 60, Math.max(halfW - 60, focus.x)) + (Math.random() * 2 - 1) * shake;
  const camY = Math.min(state.height - halfH + 60, Math.max(halfH - 60, focus.y - 20)) + (Math.random() * 2 - 1) * shake;
  const margin = 160;
  const visible = (x: number, y: number) => Math.abs(x - camX) < halfW + margin && Math.abs(y - camY) < halfH + margin;

  canvas.drawColor(Skia.Color(COLORS.void));
  canvas.save();
  canvas.translate(view.width / 2, view.height / 2);
  canvas.scale(scale, scale);
  canvas.translate(-camX, -camY);

  // Sol de l'arène, dalles discrètes
  canvas.drawRect(Skia.XYWHRect(0, 0, state.width, state.height), fill(COLORS.floor));
  const x0 = Math.max(0, Math.floor((camX - halfW) / 80) * 80);
  const y0 = Math.max(0, Math.floor((camY - halfH) / 80) * 80);
  for (let x = x0; x < Math.min(state.width, camX + halfW); x += 80) canvas.drawRect(Skia.XYWHRect(x, y0, 2, halfH * 2 + 160), fill(COLORS.floorLine));
  for (let y = y0; y < Math.min(state.height, camY + halfH); y += 80) canvas.drawRect(Skia.XYWHRect(x0, y, halfW * 2 + 160, 2), fill(COLORS.floorLine));
  // Autel du Démon (il s'y soigne)
  canvas.drawCircle(CENTER.x, CENTER.y, 64, fill(COLORS.altar));
  canvas.drawCircle(CENTER.x, CENTER.y, 64, stroke(COLORS.altarRune, 3));
  for (let i = 0; i < 6; i++) {
    const a = state.time * 0.4 + (i / 6) * Math.PI * 2;
    canvas.drawCircle(CENTER.x + Math.cos(a) * 46, CENTER.y + Math.sin(a) * 30, 4, fill(COLORS.altarRune));
  }

  for (const room of state.rooms) {
    const c = { x: room.inner.x + room.inner.w / 2, y: room.inner.y + room.inner.h / 2 };
    if (!visible(c.x, c.y)) continue;
    drawRoomFloor(canvas, room, room.owner === 0);
    drawWalls(canvas, room);
    drawDoor(canvas, room);
    drawGenerator(canvas, room);
  }

  // Emplacements d'achat : seulement dans ton refuge (pour rester lisible)
  const myRoom = player.roomId !== null ? state.rooms[player.roomId] : null;
  if (myRoom && player.alive && state.phase === 'siege') {
    for (const pad of myRoom.pads) drawPad(canvas, myRoom, pad, player.gold, fonts.small, state.time);
  }

  // Personnages et tourelles, triés en profondeur
  const drawables: { y: number; draw: () => void }[] = [];
  for (const room of state.rooms) for (const t of room.turrets) if (t.level > 0 && visible(t.x, t.y)) drawables.push({ y: t.y, draw: () => drawTurret(canvas, t, state.time) });
  for (const s of state.survivors) {
    if (!s.alive || !visible(s.x, s.y)) continue;
    drawShadow(canvas, s.x, s.y, 16, 6);
    drawables.push({ y: s.y, draw: () => drawHero(canvas, heroLike(s), state.time, { sword: 0, shield: 0, armor: 0 }, s.shirt) });
  }
  for (const z of state.zombies) {
    if (!visible(z.x, z.y)) continue;
    drawShadow(canvas, z.x, z.y, z.boss ? 30 : 14, 5);
    drawables.push({ y: z.y, draw: () => drawZombie(canvas, z) });
  }
  const d = state.demon;
  if (d.hp > 0 && visible(d.x, d.y)) {
    drawShadow(canvas, d.x, d.y, DEMON_RADIUS * 1.4, 10);
    drawables.push({ y: d.y, draw: () => drawDemon(canvas, d, state.time) });
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const dr of drawables) dr.draw();

  // Lasers
  for (const room of state.rooms) {
    for (const t of room.turrets) {
      if (!t.beamTo) continue;
      canvas.drawLine(t.x, t.y - 4, t.beamTo.x, t.beamTo.y, stroke('rgba(91,224,255,0.35)', 10));
      canvas.drawLine(t.x, t.y - 4, t.beamTo.x, t.beamTo.y, stroke('#E0FAFF', 3));
    }
  }
  for (const p of state.projectiles) drawProjectile(canvas, p);
  drawParticles(canvas, state.particles, visible);

  // Barres de vie : portes, zombies, Démon ; prénoms au-dessus des refuges
  for (const room of state.rooms) {
    if (room.owner === null) continue;
    const owner = state.survivors[room.owner];
    const by = room.doorSide === 'bottom' ? room.door.y + WALL + 6 : room.door.y - WALL - 14;
    if (!room.door.broken && owner.alive) drawHpBar(canvas, room.door.x, by, 64, room.door.hp / room.door.maxHp, room.owner === 0 ? '#7BD35A' : C.hpBuilding);
    if (fonts.small) {
      const ny = room.doorSide === 'bottom' ? room.inner.y - WALL - 8 : room.inner.y + room.inner.h + WALL + 22;
      drawOutlinedText(canvas, owner.alive ? owner.name : `× ${owner.name}`, room.door.x, ny, fonts.small, owner.alive ? C.white : '#8E8A9E');
    }
  }
  for (const z of state.zombies) if (z.hp < z.maxHp && visible(z.x, z.y)) drawHpBar(canvas, z.x, z.y - (z.boss ? 90 : 64), z.boss ? 60 : 28, z.hp / z.maxHp, C.hpEnemy);
  if (fonts.big) drawFloatingTexts(canvas, state.texts, fonts.big);
  canvas.restore();

  if (joystick.active) {
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, fill(C.joystickBase));
    canvas.drawCircle(joystick.originX, joystick.originY, joystick.radius, stroke(C.joystickRing, 3));
    canvas.drawCircle(joystick.originX + joystick.knobX, joystick.originY + joystick.knobY, 26, fill(C.joystickKnob));
  }
}
