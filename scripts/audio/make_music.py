"""Compose les musiques du jeu : du hip-hop épique, une ambiance par mode.

Lancer : python scripts/audio/make_music.py   (il faut numpy, scipy et ffmpeg)
Chaque morceau tourne en boucle sans coupure (la fin rejoint le début).
"""
import os
import subprocess
import wave

import numpy as np

from synth import (Track, bass, bell, brass, choir, clap, crash, filt, hihat, kick, lead, midi, noise, piano, pluck, reverb,
                   snare, strings, sub808, taiko, timpani)

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'audio', 'music')


def write_mp3(name, stereo):
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(OUT, f'{name}.tmp.wav')
    data = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '112k', os.path.join(OUT, f'{name}.mp3')], check=True)
    os.remove(tmp)


def chord(root, quality='m'):
    """Notes MIDI d'un accord (fondamentale, tierce, quinte)."""
    third = 3 if quality == 'm' else 4
    return [root, root + third, root + 7]


def drums_boombap(tr, bar_start, beat, swing=0.08, hats=16, intensity=1.0, fill=False):
    """Une mesure de batterie boom-bap : grosse caisse, caisse claire + clap sur 2 et 4, charleston swingué."""
    k = kick(SR, 0.5, 1.0)
    s = snare(SR)
    c = clap(SR)
    for pos in (0, 1.5, 2.5) if intensity > 0.6 else (0, 2.5):
        tr.add(k, bar_start + pos * beat, 0.75 * intensity)
    for pos in (1, 3):
        tr.add(s, bar_start + pos * beat, 0.55 * intensity, -0.05)
        tr.add(c, bar_start + pos * beat + 0.005, 0.28 * intensity, 0.1)
    step = 4 / hats
    for i in range(hats):
        t = bar_start + i * step * beat + (swing * beat if i % 2 else 0)
        accent = 1.0 if i % 2 == 0 else 0.6
        tr.add(hihat(SR, open_=(i == hats - 2 and intensity > 0.8)), t, 0.16 * accent * intensity, 0.35)
    if fill:
        for i in range(4):
            tr.add(s, bar_start + (3 + i * 0.25) * beat, 0.4 + i * 0.12, -0.2 + i * 0.13)


def song_waves():
    """Mode Vagues : hip-hop épique de bataille, en ré mineur, 92 battements par minute."""
    bpm = 92
    beat = 60 / bpm
    bars = 16
    tr = Track(bars * 4 * beat, SR)
    prog = [(50, 'm'), (46, 'M'), (43, 'm'), (45, 'M')]  # Ré m, Si♭, Sol m, La
    hook = [74, 77, 76, 74, 72, 74, 69, None, 74, 77, 79, 77, 76, 74, 76, 73]
    for bar in range(bars):
        t0 = bar * 4 * beat
        root, q = prog[bar % 4]
        notes = chord(root, q)
        intro = bar < 2
        breakdown = bar in (10, 11)
        # Nappe de cordes et chœur
        tr.add(reverb(strings([midi(n) for n in notes], SR, 4 * beat + 0.4, 0.3), SR, 1.5, 0.3), t0, 0.6, -0.3)
        if not intro:
            tr.add(choir([midi(n + 12) for n in notes], SR, 4 * beat + 0.3, 0.5), t0, 0.4 if not breakdown else 0.55, 0.3)
        # Timbales au début de chaque mesure
        tr.add(timpani(SR, midi(root - 12), 1.2), t0, 0.6 if intro or bar % 4 == 0 else 0.35)
        if intro:
            continue
        # Batterie
        drums_boombap(tr, t0, beat, intensity=0.55 if breakdown else 1.0, fill=bar % 4 == 3 and not breakdown)
        if bar % 8 == 2:
            tr.add(crash(SR), t0, 0.35)
        # Basse 808 sur la fondamentale
        if not breakdown:
            for pos, length in ((0, 1.4), (1.5, 0.9), (2.5, 1.3)):
                tr.add(sub808(midi(root - 12), SR, length * beat + 0.2), t0 + pos * beat, 0.5)
        # Cuivres en coups secs (rythme pointé)
        for pos in (0, 0.75, 2, 2.75) if not breakdown else (0,):
            tr.add(brass([midi(n) for n in notes] + [midi(root - 12)], SR, 0.42 if pos % 1 else 0.6, 2800), t0 + pos * beat, 0.6, 0.15)
        # Mélodie aux cuivres sur la deuxième moitié
        if bar >= 4 and not breakdown:
            for i in range(4):
                n = hook[(bar % 4) * 4 + i]
                if n is not None:
                    tr.add(brass([midi(n)], SR, beat * 0.9, 3400, 0.03), t0 + i * beat, 0.5, -0.15)
    return tr.render()


def song_menu():
    """Accueil : hip-hop épique plus posé, piano et cordes, en la mineur, 84 battements par minute."""
    bpm = 84
    beat = 60 / bpm
    bars = 16
    tr = Track(bars * 4 * beat, SR)
    prog = [(57, 'm'), (53, 'M'), (50, 'm'), (52, 'M')]  # La m, Fa, Ré m, Mi
    melody = [76, 72, 74, 76, 77, 76, 74, 72, 74, 72, 69, 72, 71, 68, 71, 76]
    for bar in range(bars):
        t0 = bar * 4 * beat
        root, q = prog[bar % 4]
        notes = chord(root, q)
        tr.add(reverb(strings([midi(n - 12) for n in notes], SR, 4 * beat + 0.5, 0.6, 2200), SR, 1.8, 0.35), t0, 0.5, 0.2)
        # Piano : accord puis arpège
        for i, n in enumerate(notes + [notes[0] + 12, notes[1] + 12]):
            tr.add(piano(midi(n), SR, 2.0, 0.7), t0 + i * beat * 0.5, 0.5, -0.25 + i * 0.1)
        if bar >= 2:
            drums_boombap(tr, t0, beat, swing=0.12, hats=8, intensity=0.75, fill=bar % 8 == 7)
            tr.add(bass(midi(root - 24), SR, 1.7 * beat), t0, 0.5)
            tr.add(bass(midi(root - 24), SR, 1.2 * beat), t0 + 2.5 * beat, 0.42)
        if bar >= 8:
            for i in range(4):
                tr.add(reverb(bell(midi(melody[(bar % 4) * 4 + i]), SR, 1.2), SR, 1.4, 0.3), t0 + i * beat, 0.4, 0.3)
    return tr.render()


def song_refuge():
    """Mode Refuges : trap sombre et tendue, boîte à musique inquiétante, mi mineur, 70 battements par minute."""
    bpm = 70
    beat = 60 / bpm
    bars = 16
    tr = Track(bars * 4 * beat, SR)
    prog = [(52, 'm'), (48, 'M'), (45, 'm'), (47, 'M')]  # Mi m, Do, La m, Si
    box = [76, 79, 83, 79, 76, 75, 76, 71, 72, 76, 79, 76, 75, 71, 75, 78]
    for bar in range(bars):
        t0 = bar * 4 * beat
        root, q = prog[bar % 4]
        notes = chord(root, q)
        # Bourdon grave et chœur lointain
        tr.add(reverb(choir([midi(n - 12) for n in notes], SR, 4 * beat + 0.4, 1.0), SR, 2.4, 0.5), t0, 0.5, -0.2)
        # Boîte à musique
        for i in range(4):
            tr.add(reverb(bell(midi(box[(bar % 4) * 4 + i]), SR, 1.6), SR, 2.0, 0.45), t0 + i * beat, 0.45, 0.35)
        if bar < 2:
            continue
        # Trap : grosse caisse rare, caisse claire sur le 3, charleston en rafales, 808 qui glisse
        k = kick(SR, 0.5, 0.9)
        for pos in (0, 1.75):
            tr.add(k, t0 + pos * beat, 0.65)
        tr.add(snare(SR, 0.35, 170), t0 + 2 * beat, 0.65)
        tr.add(clap(SR), t0 + 2 * beat + 0.01, 0.5, 0.1)
        for i in range(16):
            roll = bar % 2 == 1 and i >= 12
            sub = 3 if roll else 1
            for j in range(sub):
                tr.add(hihat(SR), t0 + (i + j / sub) * beat / 4, 0.12 if i % 4 else 0.18, 0.4)
        tr.add(sub808(midi(root - 24), SR, 2.2 * beat, glide_from=midi(root - 19) if bar % 4 == 1 else None), t0, 0.5)
        tr.add(sub808(midi(root - 24), SR, 1.6 * beat), t0 + 2.5 * beat, 0.42)
        if bar % 8 == 7:
            tr.add(reverb(brass([midi(root - 12), midi(root - 6)], SR, 2.0, 900, 0.3), SR, 2.0, 0.4), t0 + 2 * beat, 0.35)
    return tr.render()


def song_epoch():
    """Mode Époques : hip-hop orchestral, tambours taïko, cordes en ostinato, cors, do mineur, 96 battements par minute."""
    bpm = 96
    beat = 60 / bpm
    bars = 16
    tr = Track(bars * 4 * beat, SR)
    prog = [(48, 'm'), (44, 'M'), (51, 'M'), (46, 'M')]  # Do m, La♭, Mi♭, Si♭
    horn = [67, 68, 70, 72, 70, 68, 67, 63, 65, 67, 68, 70, 72, 74, 75, 74]
    for bar in range(bars):
        t0 = bar * 4 * beat
        root, q = prog[bar % 4]
        notes = chord(root, q)
        # Cordes en croches (ostinato)
        for i in range(8):
            n = [notes[0], notes[2], notes[1] + 12, notes[2]][i % 4]
            tr.add(pluck(midi(n), SR, 0.35), t0 + i * beat / 2, 0.42, -0.35 + (i % 2) * 0.15)
        tr.add(strings([midi(n - 12) for n in notes], SR, 4 * beat + 0.3, 0.4, 2600), t0, 0.45, 0.25)
        # Taïko
        for pos, p in ((0, 80), (0.75, 95), (2, 80), (3.5, 110)):
            tr.add(taiko(SR, 0.7, p), t0 + pos * beat, 0.6 if bar >= 2 else 0.35)
        if bar < 2:
            continue
        drums_boombap(tr, t0, beat, swing=0.05, hats=16, intensity=0.85, fill=bar % 4 == 3)
        tr.add(sub808(midi(root - 24), SR, 1.8 * beat), t0, 0.45)
        tr.add(sub808(midi(root - 24), SR, 1.2 * beat), t0 + 2.5 * beat, 0.38)
        if bar >= 4:
            for i in range(4):
                tr.add(reverb(brass([midi(horn[(bar % 4) * 4 + i] - 12)], SR, beat * 0.95, 1800, 0.05), SR, 1.4, 0.3), t0 + i * beat, 0.55, 0.1)
        if bar in (4, 12):
            tr.add(crash(SR), t0, 0.35)
            tr.add(choir([midi(n) for n in notes], SR, 8 * beat, 0.6), t0, 0.2, -0.1)
    return tr.render()


def main():
    for name, fn in (('menu', song_menu), ('waves', song_waves), ('refuge', song_refuge), ('epoch', song_epoch)):
        print('composition :', name)
        write_mp3(name, fn())
    print('musiques écrites dans', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
