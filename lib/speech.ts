// lib/speech.ts: thin wrapper over window.speechSynthesis (native Web Speech API).
export const speechSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

const norm = (s: string): string => s.replace('_', '-').toLowerCase();

/** true / false when voices are loaded; null when the browser has not populated the voice list yet. */
export function hasVoiceFor(speechLang: string): boolean | null {
    if (!speechSupported()) return false;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;
    const prefix = norm(speechLang).slice(0, 2);
    return voices.some((v) => norm(v.lang).startsWith(prefix));
}

export function speak(text: string, speechLang: string, onEnd?: () => void): void {
    if (!speechSupported()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang;
    u.rate = 0.9;
    const voices = synth.getVoices();
    const voice =
        voices.find((v) => norm(v.lang) === norm(speechLang)) ?? voices.find((v) => norm(v.lang).startsWith(norm(speechLang).slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
}

export function stopSpeaking(): void {
    if (speechSupported()) window.speechSynthesis.cancel();
}