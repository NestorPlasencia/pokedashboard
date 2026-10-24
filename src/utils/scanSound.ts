/**
 * A short two-note chime when a card is sent to review, synthesized with Web Audio so no
 * sound file has to load. Phones only allow audio after a tap, so `prime` runs from the
 * Start button and `play` reuses that unlocked context for every later card.
 */
const STORAGE_KEY = 'pokedashboard.scanner-sound';
let context: AudioContext | null = null;

export const scanSoundEnabled = (): boolean => {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
};

export const setScanSoundEnabled = (enabled: boolean) => {
  try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch { /* the choice lasts this visit only */ }
};

export function primeScanSound() {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  context ??= new AudioContextClass();
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
}

export function playScanSound() {
  if (!context || !scanSoundEnabled()) return;
  const start = context.currentTime;
  // Rising fifth (A5 → E6): short and bright enough to hear over a room.
  [[880, 0], [1318.5, 0.09]].forEach(([frequency, offset]) => {
    const oscillator = context!.createOscillator();
    const gain = context!.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
    oscillator.connect(gain).connect(context!.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.18);
  });
}
