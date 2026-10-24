"""Fabrique les bruitages du jeu (fichiers WAV courts dans assets/audio/sfx).

Lancer : python scripts/audio/make_sfx.py   (il faut numpy et scipy)
"""
import os
import wave

import numpy as np

from synth import (bell, brass, choir, exp_decay, filt, kick, noise, normalize, pluck, reverb, saw, sine, softclip, square,
                   sweep_sine, t_axis, timpani)

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'audio', 'sfx')


def save(name, x, peak=0.85):
    x = normalize(np.asarray(x, dtype=float), peak)
    # Petit fondu en sortie pour éviter les clics.
    fade = min(len(x), int(0.01 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)
    data = (x * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def delay(x, sec):
    return np.concatenate([np.zeros(int(sec * SR)), x])


def whoosh(dur, f0, f1, width=0.6):
    n = int(dur * SR)
    x = noise(n)
    out = np.zeros(n)
    # Filtre passe-bande qui glisse, par petits morceaux
    seg = 256
    for i in range(0, n, seg):
        k = i / n
        f = f0 * (f1 / f0) ** k
        part = filt(noise(min(seg * 4, n - i) + 0), SR, 'band', (f * (1 - width / 2), f * (1 + width / 2)))[: min(seg, n - i)]
        out[i : i + len(part)] = part
    env = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    del x
    return out * env


def tone(f, dur, kind='sine'):
    t = t_axis(dur, SR)
    return {'sine': sine(f, t), 'square': square(f, t), 'saw': saw(f, t)}[kind]


def env_exp(x, tau):
    return x * exp_decay(len(x), SR, tau)


def boom(dur=1.0, low=55):
    n = int(dur * SR)
    body = sweep_sine(140, low, n, SR, curve=10) * exp_decay(n, SR, dur * 0.3)
    rumble = filt(noise(n), SR, 'low', 500) * exp_decay(n, SR, dur * 0.35)
    crackle = filt(noise(n), SR, 'high', 3000) * exp_decay(n, SR, 0.08) * 0.4
    return softclip(body * 1.2 + rumble + crackle, 1.6)


def main():
    os.makedirs(OUT, exist_ok=True)
    # --- Interface ---
    save('tap', mix(env_exp(tone(1100, 0.05), 0.012), env_exp(filt(noise(int(0.03 * SR)), SR, 'high', 3000) * 0.3, 0.005)), 0.6)
    save('buy', mix(bell(1568, SR, 0.5), delay(bell(2349, SR, 0.6), 0.07), delay(env_exp(filt(noise(int(0.4 * SR)), SR, 'high', 6000) * 0.25, 0.12), 0.05)))
    save('coin', mix(bell(1976, SR, 0.35), delay(bell(2637, SR, 0.4), 0.05)), 0.7)
    save('error', env_exp(filt(tone(130, 0.18, 'square'), SR, 'low', 900), 0.08), 0.6)
    arp = [523, 659, 784, 1047, 1319]
    save('levelup', mix(*[delay(bell(f, SR, 0.7), i * 0.07) for i, f in enumerate(arp)], delay(env_exp(filt(noise(int(0.8 * SR)), SR, 'high', 5000) * 0.2, 0.3), 0.2)))
    save('card', mix(whoosh(0.25, 600, 3000) * 0.7, delay(bell(1760, SR, 0.5), 0.12)))
    save('beep', env_exp(tone(880, 0.14), 0.08), 0.6)
    save('go', mix(env_exp(tone(1047, 0.45), 0.2), env_exp(tone(1319, 0.45), 0.2), env_exp(tone(1568, 0.45), 0.2)), 0.7)
    save('wheel_tick', env_exp(filt(noise(int(0.03 * SR)), SR, 'band', (1500, 4000)), 0.006), 0.5)
    # --- Combat ---
    save('swing', whoosh(0.18, 2500, 600), 0.6)
    save('hit', mix(env_exp(sweep_sine(160, 60, int(0.18 * SR), SR, 25), 0.06), env_exp(filt(noise(int(0.08 * SR)), SR, 'band', (300, 2500)) * 0.7, 0.02)))
    save('slash', mix(whoosh(0.16, 3000, 900) * 0.8, delay(env_exp(bell(3100, SR, 0.25), 0.07) * 0.5, 0.08), delay(env_exp(filt(noise(int(0.06 * SR)), SR, 'band', (500, 3000)), 0.02) * 0.6, 0.08)))
    save('arrow', mix(env_exp(pluck(196, SR, 0.25), 0.08) * 0.8, delay(whoosh(0.2, 3500, 1500) * 0.6, 0.02)))
    save('shot', mix(env_exp(filt(noise(int(0.25 * SR)), SR, 'high', 1200), 0.04), env_exp(sweep_sine(220, 70, int(0.2 * SR), SR, 30), 0.05) * 0.8))
    laser_n = int(0.22 * SR)
    save('laser', env_exp(filt(np.sign(np.sin(2 * np.pi * np.cumsum(1800 * np.exp(-np.arange(laser_n) / SR * 14) + 250) / SR)), SR, 'low', 5000), 0.09) * 0.7, 0.6)
    save('cannon', boom(0.8, 50))
    save('explosion', reverb(boom(1.4, 40), SR, 1.0, 0.2))
    zn = int(0.3 * SR)
    save('zap', mix(filt(noise(zn), SR, 'band', (2000, 7000)) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 60 * np.arange(zn) / SR))) * exp_decay(zn, SR, 0.12), env_exp(sweep_sine(2600, 900, zn, SR, 12), 0.1) * 0.4), 0.7)
    save('splat', mix(env_exp(sweep_sine(320, 70, int(0.25 * SR), SR, 14), 0.08), env_exp(filt(noise(int(0.25 * SR)), SR, 'low', 1200), 0.07) * 0.9), 0.7)
    save('hurt', mix(env_exp(sweep_sine(220, 90, int(0.2 * SR), SR, 15), 0.07), env_exp(filt(noise(int(0.1 * SR)), SR, 'low', 700), 0.03) * 0.6), 0.75)
    save('chop', mix(env_exp(filt(noise(int(0.12 * SR)), SR, 'band', (500, 1600)), 0.025), env_exp(tone(180, 0.12), 0.04) * 0.7), 0.7)
    creak_n = int(0.7 * SR)
    creak = filt(saw(1, t_axis(0.7, SR)) * 0 + saw(95 + 25 * np.sin(np.linspace(0, 9, creak_n)), t_axis(0.7, SR)), SR, 'band', (300, 1400)) * np.linspace(0.2, 0.6, creak_n)
    save('treefall', mix(creak, delay(boom(0.6, 60) * 0.9, 0.6)))
    save('build', mix(env_exp(filt(noise(int(0.08 * SR)), SR, 'band', (1500, 5000)), 0.015), env_exp(bell(1250, SR, 0.2), 0.05) * 0.6, delay(env_exp(filt(noise(int(0.08 * SR)), SR, 'band', (1500, 5000)), 0.015), 0.14), delay(env_exp(bell(1100, SR, 0.2), 0.05) * 0.6, 0.14)))
    save('door_hit', mix(env_exp(sweep_sine(130, 70, int(0.3 * SR), SR, 18), 0.09), env_exp(filt(noise(int(0.2 * SR)), SR, 'band', (200, 900)), 0.04) * 0.9))
    save('door_break', reverb(mix(*[delay(env_exp(filt(noise(int(0.2 * SR)), SR, 'band', (150 + 120 * i, 1200)), 0.05), i * 0.06) for i in range(6)], boom(0.7, 55) * 0.8), SR, 0.8, 0.2))
    rn = int(1.3 * SR)
    t = np.arange(rn) / SR
    growl_f = 72 + 8 * np.sin(2 * np.pi * 7 * t) + 20 * np.exp(-t * 2)
    growl = saw(1, t) * 0
    growl = np.sin(2 * np.pi * np.cumsum(growl_f) / SR) * 0.5 + filt(np.sign(np.sin(2 * np.pi * np.cumsum(growl_f) / SR)), SR, 'low', 700) * 0.5
    growl += filt(noise(rn), SR, 'band', (120, 600)) * 0.7 * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t))
    save('roar', reverb(softclip(growl * np.minimum(1, t / 0.12) * np.exp(-t * 1.6), 2.0), SR, 1.2, 0.3))
    save('base_hit', mix(boom(0.5, 45) * 0.9, env_exp(filt(noise(int(0.2 * SR)), SR, 'band', (200, 1200)), 0.05) * 0.6))
    save('spawn', mix(env_exp(sweep_sine(300, 150, int(0.12 * SR), SR, 30), 0.04), env_exp(filt(noise(int(0.05 * SR)), SR, 'high', 2000) * 0.3, 0.01)), 0.55)
    # --- Moments forts ---
    save('horn', reverb(mix(brass([110, 165], SR, 0.7, 1600, 0.06), delay(brass([123.5, 185], SR, 0.9, 1800, 0.06), 0.6)), SR, 1.6, 0.35))
    save('warcry', reverb(mix(brass([147, 220], SR, 0.8, 2400, 0.03), filt(noise(int(0.9 * SR)), SR, 'band', (500, 1400)) * np.sin(np.linspace(0, np.pi, int(0.9 * SR))) * 0.5), SR, 1.2, 0.3))
    save('heal', reverb(mix(*[delay(bell(f, SR, 0.8) * 0.7, i * 0.06) for i, f in enumerate([784, 988, 1175, 1568, 1976])]), SR, 1.2, 0.35))
    save('crate', mix(env_exp(sweep_sine(500, 1200, int(0.1 * SR), SR, 20), 0.05), delay(bell(1568, SR, 0.5), 0.06), delay(bell(2093, SR, 0.5), 0.12)))
    save('evolve', reverb(mix(whoosh(1.0, 300, 4000) * 0.6, delay(choir([220, 277, 330, 440], SR, 1.6, 0.3) * 0.9, 0.4), delay(timpani(SR, 55, 1.0), 0.4)), SR, 1.8, 0.35))
    save('special', reverb(mix(whoosh(0.6, 200, 2500) * 0.6, delay(boom(1.0, 45), 0.45)), SR, 1.2, 0.25))
    save('dash', whoosh(0.3, 400, 2600), 0.7)
    save('eliminated', reverb(mix(brass([73, 87, 110], SR, 1.2, 900, 0.01), bell(220, SR, 1.5) * 0.4), SR, 1.6, 0.35))
    save('win', reverb(mix(*[delay(brass([f, f * 1.5], SR, 0.35 if i < 3 else 1.1, 3000, 0.01), i * 0.16) for i, f in enumerate([262, 330, 392, 523])], delay(timpani(SR, 65, 1.2), 0.48)), SR, 1.6, 0.3))
    save('lose', reverb(mix(*[delay(brass([f, f * 1.2], SR, 0.5 if i < 2 else 1.4, 1400, 0.02), i * 0.35) for i, f in enumerate([220, 207.6, 174.6])]), SR, 1.8, 0.35))
    save('wheel_win', mix(*[delay(bell(f, SR, 0.6), i * 0.08) for i, f in enumerate([784, 988, 1175, 1568])], delay(env_exp(filt(noise(int(0.6 * SR)), SR, 'high', 6000) * 0.3, 0.2), 0.25)))
    save('freeze', mix(*[delay(bell(f, SR, 0.5) * 0.6, i * 0.04) for i, f in enumerate([2349, 2637, 3136, 3520])]), 0.6)
    print('bruitages écrits dans', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
