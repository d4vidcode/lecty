let audioContext: AudioContext | null = null;

export function playPageSound(volume = 0.16): void {
  if (typeof window === "undefined") return;
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;

  try {
    audioContext ??= new AudioCtor();
    const ctx = audioContext;
    if (ctx.state === "suspended") void ctx.resume();

    const duration = 0.34;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      const t = i / frames;
      const envelope = Math.pow(1 - t, 2.4) * Math.min(1, t * 30);
      data[i] = (Math.random() * 2 - 1) * envelope * 0.55;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1700, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + duration);
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + duration);
  } catch {
    // El sonido es opcional.
  }
}
