chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "playBeep") return;
  const volume = Math.max(0.01, Math.min(1, Number(msg.volume || 0.3)));
  const audioCtx = new AudioContext();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.value = 880;
  gainNode.gain.value = volume;
  oscillator.start();
  gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
  oscillator.stop(audioCtx.currentTime + 0.5);
});