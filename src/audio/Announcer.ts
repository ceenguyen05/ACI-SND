/**
 * Round announcer using the browser's built-in speech synthesis (no audio files needed).
 * Lines are short and queued; anything older than 2 s is dropped so callouts never lag behind.
 */
class Announcer {
  enabled = true;
  volume = 0.8;
  private voice: SpeechSynthesisVoice | null = null;
  private lastAt = 0;

  private pickVoice() {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth || this.voice) return;
    const voices = synth.getVoices();
    this.voice = voices.find((v) => /en-(US|GB)/i.test(v.lang) && /male|david|guy|daniel|mark|george/i.test(v.name))
      ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
  }

  /** Say a line. `important` lines interrupt whatever is being said. */
  say(text: string, important = false) {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!this.enabled || !synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      this.pickVoice();
      const now = performance.now();
      if (important) synth.cancel();
      else if (synth.speaking && now - this.lastAt > 2000) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = 1.08; u.pitch = 0.82; u.volume = Math.max(0, Math.min(1, this.volume));
      synth.speak(u);
      this.lastAt = now;
    } catch { /* speech unavailable */ }
  }

  stop() { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }
}

export const announcer = new Announcer();
