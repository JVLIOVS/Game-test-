"""Petit synthétiseur pour fabriquer la musique et les bruitages du jeu (aucun son téléchargé).

Tout est calculé : percussions, cuivres, cordes, chœurs, basse, effets.
Utilisé par make_sfx.py et make_music.py.
"""
import numpy as np
from scipy import signal

RNG = np.random.default_rng(7)


def t_axis(dur, sr):
    return np.arange(int(dur * sr)) / sr


def env_adsr(n, sr, a=0.005, d=0.1, s=0.6, r=0.2, hold=None):
    """Enveloppe attaque / déclin / maintien / relâche sur n échantillons."""
    total = n / sr
    hold = total - a - d - r if hold is None else hold
    hold = max(0.0, hold)
    pts_t = [0, a, a + d, a + d + hold, a + d + hold + r]
    pts_v = [0, 1, s, s, 0]
    t = np.arange(n) / sr
    return np.interp(t, pts_t, pts_v)


def exp_decay(n, sr, tau):
    return np.exp(-np.arange(n) / sr / tau)


def noise(n):
    return RNG.uniform(-1, 1, n)


def filt(x, sr, kind, freq, order=2):
    nyq = sr / 2
    if kind == 'band':
        lo, hi = freq
        b, a = signal.butter(order, [max(10, lo) / nyq, min(hi, nyq * 0.98) / nyq], btype='band')
    else:
        b, a = signal.butter(order, min(freq, nyq * 0.98) / nyq, btype=kind)
    return signal.lfilter(b, a, x)


def saw(freq, t, detune=0.0):
    ph = (freq * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + 0.5))


def square(freq, t, duty=0.5):
    ph = (freq * t) % 1
    return np.where(ph < duty, 1.0, -1.0)


def sine(freq, t, phase=0.0):
    return np.sin(2 * np.pi * freq * t + phase)


def sweep_sine(f0, f1, n, sr, curve=8.0):
    """Sinus dont la hauteur glisse de f0 à f1 (glissement exponentiel)."""
    t = np.arange(n) / sr
    f = f1 + (f0 - f1) * np.exp(-t * curve)
    return np.sin(2 * np.pi * np.cumsum(f) / sr)


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def normalize(x, peak=0.9):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def reverb(x, sr, size=1.6, mix=0.25, damp=4000):
    """Réverbération : convolution avec une queue de bruit qui s'éteint."""
    n = int(size * sr)
    ir = noise(n) * np.exp(-np.arange(n) / sr / (size / 5))
    ir = filt(ir, sr, 'low', damp)
    ir /= np.sqrt(np.sum(ir ** 2)) or 1
    wet = signal.fftconvolve(x, ir)[: len(x)]
    return x * (1 - mix) + wet * mix * 1.5


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# ---------- Percussions ----------

def kick(sr, dur=0.45, punch=1.0):
    n = int(dur * sr)
    body = sweep_sine(170 * punch, 45, n, sr, curve=22) * exp_decay(n, sr, 0.16)
    click = filt(noise(n), sr, 'high', 2500) * exp_decay(n, sr, 0.004) * 0.5
    return softclip(body + click, 1.6)


def snare(sr, dur=0.3, tone=190):
    n = int(dur * sr)
    t = t_axis(dur, sr)
    body = sine(tone, t) * exp_decay(n, sr, 0.05) * 0.6
    sn = filt(noise(n), sr, 'band', (1500, 8000)) * exp_decay(n, sr, 0.09)
    return softclip(body + sn * 1.1, 1.3)


def clap(sr, dur=0.35):
    n = int(dur * sr)
    out = np.zeros(n)
    for k, d in enumerate([0.0, 0.011, 0.022, 0.034]):
        i = int(d * sr)
        m = n - i
        g = 1.0 if k == 3 else 0.6
        out[i:] += filt(noise(m), sr, 'band', (900, 5000)) * exp_decay(m, sr, 0.012 if k < 3 else 0.12) * g
    return out


def hihat(sr, dur=0.06, open_=False):
    dur = 0.3 if open_ else dur
    n = int(dur * sr)
    x = filt(noise(n), sr, 'high', 7000) * exp_decay(n, sr, 0.09 if open_ else 0.018)
    return x * 0.6


def sub808(freq, sr, dur=0.9, glide_from=None):
    n = int(dur * sr)
    t = np.arange(n) / sr
    if glide_from:
        f = freq + (glide_from - freq) * np.exp(-t * 18)
        x = np.sin(2 * np.pi * np.cumsum(f) / sr)
    else:
        x = sine(freq, t)
    x = softclip(x * 1.2, 1.8) * exp_decay(n, sr, dur * 0.45)
    att = np.minimum(1, np.arange(n) / (0.004 * sr))
    return x * att


def taiko(sr, dur=0.8, pitch=90):
    n = int(dur * sr)
    body = sweep_sine(pitch * 1.6, pitch, n, sr, curve=14) * exp_decay(n, sr, 0.22)
    skin = filt(noise(n), sr, 'band', (100, 900)) * exp_decay(n, sr, 0.05) * 0.8
    return softclip(body + skin, 1.4)


def timpani(sr, freq=65, dur=1.4):
    n = int(dur * sr)
    t = t_axis(dur, sr)
    x = sum(sine(freq * h, t) * a for h, a in [(1, 1), (1.5, 0.5), (1.98, 0.35), (2.44, 0.2)])
    x *= exp_decay(n, sr, 0.45)
    x += filt(noise(n), sr, 'low', 400) * exp_decay(n, sr, 0.04)
    return softclip(x, 1.2)


def crash(sr, dur=1.8):
    n = int(dur * sr)
    return filt(noise(n), sr, 'high', 4000) * exp_decay(n, sr, 0.5) * 0.5


# ---------- Instruments ----------

def brass(freqs, sr, dur, bright=2600, attack=0.02):
    """Cuivres épais : dents de scie désaccordées, filtre qui s'ouvre puis se referme."""
    t = t_axis(dur, sr)
    n = len(t)
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.006, 0.0, 0.007):
            x += saw(f, t, d)
    x /= max(1, len(freqs) * 3)
    env = env_adsr(n, sr, a=attack, d=0.15, s=0.55, r=min(0.25, dur * 0.4))
    # filtre dynamique approché : mélange d'une version claire et d'une sombre
    bright_x = filt(x, sr, 'low', bright)
    dark_x = filt(x, sr, 'low', bright * 0.35)
    k = exp_decay(n, sr, 0.18)
    return softclip((bright_x * k + dark_x * (1 - k)) * env * 1.6, 1.4)


def strings(freqs, sr, dur, attack=0.35, cutoff=3200):
    t = t_axis(dur, sr)
    n = len(t)
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.008, -0.003, 0.004, 0.009):
            vib = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t + RNG.uniform(0, 6))
            x += saw(f * vib, t, d)
    x /= max(1, len(freqs) * 4)
    x = filt(x, sr, 'low', cutoff)
    return x * env_adsr(n, sr, a=attack, d=0.2, s=0.85, r=min(0.6, dur * 0.4))


def choir(freqs, sr, dur, attack=0.4):
    """Chœur « aah » : dents de scie filtrées par deux formants."""
    t = t_axis(dur, sr)
    n = len(t)
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.01, 0.0, 0.011):
            vib = 1 + 0.004 * np.sin(2 * np.pi * 4.8 * t + RNG.uniform(0, 6))
            x += saw(f * vib, t, d)
    x /= max(1, len(freqs) * 3)
    y = filt(x, sr, 'band', (600, 900)) * 1.0 + filt(x, sr, 'band', (1050, 1350)) * 0.6 + filt(x, sr, 'band', (2400, 2800)) * 0.25
    return y * env_adsr(n, sr, a=attack, d=0.2, s=0.9, r=min(0.7, dur * 0.4)) * 2.2


def piano(freq, sr, dur=1.5, vel=1.0):
    t = t_axis(dur, sr)
    n = len(t)
    x = np.zeros(n)
    for h, a in [(1, 1), (2, 0.5), (3, 0.28), (4, 0.15), (5, 0.08)]:
        x += sine(freq * h * (1 + 0.0008 * h * h), t) * a * exp_decay(n, sr, 0.9 / h)
    hammer = filt(noise(n), sr, 'band', (800, 4000)) * exp_decay(n, sr, 0.008) * 0.15
    att = np.minimum(1, np.arange(n) / (0.002 * sr))
    return (x * 0.5 + hammer) * att * vel


def bell(freq, sr, dur=1.8):
    """Boîte à musique / cloche : partiels inharmoniques qui s'éteignent."""
    t = t_axis(dur, sr)
    n = len(t)
    x = np.zeros(n)
    for h, a, tau in [(1, 1, 0.9), (2.76, 0.5, 0.4), (5.4, 0.25, 0.2), (8.93, 0.12, 0.1)]:
        x += sine(freq * h, t) * a * exp_decay(n, sr, tau)
    att = np.minimum(1, np.arange(n) / (0.001 * sr))
    return x * 0.5 * att


def pluck(freq, sr, dur=0.5):
    t = t_axis(dur, sr)
    n = len(t)
    x = saw(freq, t) * 0.6 + square(freq, t, 0.3) * 0.2
    x = filt(x, sr, 'low', 2400)
    return x * exp_decay(n, sr, 0.16)


def bass(freq, sr, dur):
    t = t_axis(dur, sr)
    n = len(t)
    x = sine(freq, t) + 0.35 * sine(freq * 2, t) + 0.15 * saw(freq, t)
    x = filt(x, sr, 'low', 900)
    return softclip(x, 1.5) * env_adsr(n, sr, a=0.005, d=0.1, s=0.8, r=0.06)


def lead(freq, sr, dur, vib=True):
    t = t_axis(dur, sr)
    n = len(t)
    v = 1 + (0.006 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.25) if vib else 0)
    x = saw(freq * v, t) * 0.5 + square(freq * v, t, 0.5) * 0.3
    x = filt(x, sr, 'low', 3000)
    return x * env_adsr(n, sr, a=0.02, d=0.1, s=0.75, r=0.08)


# ---------- Mixage ----------

class Track:
    """Piste stéréo dans laquelle on place des sons à des instants précis."""

    def __init__(self, dur, sr=44100):
        self.sr = sr
        self.buf = np.zeros((int(dur * sr) + sr * 3, 2))
        self.len = int(dur * sr)

    def add(self, x, at, gain=1.0, pan=0.0):
        i = int(at * self.sr)
        if i >= len(self.buf):
            return
        x = x[: len(self.buf) - i]
        left = gain * np.cos((pan + 1) * np.pi / 4) * np.sqrt(2)
        right = gain * np.sin((pan + 1) * np.pi / 4) * np.sqrt(2)
        self.buf[i : i + len(x), 0] += x * left
        self.buf[i : i + len(x), 1] += x * right

    def render(self, loop=True, peak=0.92):
        out = self.buf.copy()
        if loop:
            # La queue (réverbération, notes tenues) revient au début : boucle sans coupure.
            tail = out[self.len :]
            out = out[: self.len]
            out[: len(tail)] += tail[: self.len]
        else:
            out = out[: self.len]
        # Aigus adoucis (moins agressif au casque), puis léger écrêtage doux qui fait office de compresseur
        out = np.stack([filt(out[:, c], self.sr, 'low', 11000) for c in range(2)], axis=1)
        out = softclip(normalize(out, 1.0) * 1.6, 1.3)
        return normalize(out, peak)
