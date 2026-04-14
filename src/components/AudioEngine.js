/**
 * AudioEngine.js
 *
 * Hidden WebView that runs the Web Audio API for real-time tone synthesis.
 * Zero latency — the AudioContext is already initialised and tones are
 * generated on-the-fly by the JavaScript oscillator engine inside the WebView.
 *
 * Usage:
 *   const audioRef = useRef(null);
 *   <AudioEngine engineRef={audioRef} />
 *
 *   // later:
 *   soundEngine.setRef(audioRef.current);
 *   soundEngine.playTone({ toneFreq: 392, toneVol: 0.5, toneWave: 'sine', delay: 90 });
 *   soundEngine.playFeature('peak');
 */

import { useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

// ─── Web Audio HTML ───────────────────────────────────────────────────────────

const AUDIO_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:black;">
<script>
// Create AudioContext — resume it as soon as possible
var ctx;
try {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
} catch(e) {
  ctx = null;
}

// iOS requires resume() after a user gesture; we fire it on any touch
document.addEventListener('touchstart', function() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}, { passive: true });

// Also resume on load
if (ctx && ctx.state === 'suspended') {
  ctx.resume().catch(function(){});
}

/**
 * Play a single sine/triangle/square tone with a smooth envelope.
 * freq    — Hz (pitch)
 * vol     — 0–1 (amplitude)
 * durMs   — milliseconds
 * wave    — 'sine' | 'triangle' | 'square' | 'sawtooth'
 */
function playTone(freq, vol, durMs, wave) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  var dur = Math.max(0.02, durMs / 1000);
  var now = ctx.currentTime;

  var osc  = ctx.createOscillator();
  var gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type            = wave || 'sine';
  osc.frequency.value = freq;

  // Smooth ADSR envelope — prevents audible clicks
  var attack  = Math.min(0.008, dur * 0.1);
  var release = Math.min(0.015, dur * 0.2);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);
  gain.gain.setValueAtTime(vol, now + dur - release);
  gain.gain.linearRampToValueAtTime(0, now + dur);

  osc.start(now);
  osc.stop(now + dur);
}

/**
 * Play a landmark feature sound pattern.
 * peak         — ascending arpeggio  (C5 → E5 → G5)
 * valley       — descending arpeggio (G4 → E4 → C4)
 * zeroCrossing — neutral tick (A4)
 */
function playFeature(type) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  if (type === 'peak') {
    playTone(523, 0.55, 80,  'sine');
    setTimeout(function(){ playTone(659, 0.65, 80,  'sine'); }, 70);
    setTimeout(function(){ playTone(784, 0.75, 130, 'sine'); }, 140);

  } else if (type === 'valley') {
    playTone(392, 0.55, 80,  'sine');
    setTimeout(function(){ playTone(330, 0.55, 80,  'sine'); }, 70);
    setTimeout(function(){ playTone(261, 0.65, 130, 'sine'); }, 140);

  } else if (type === 'zeroCrossing') {
    playTone(440, 0.40, 45, 'triangle');

  } else if (type === 'asymptote') {
    // Rising alarm — rapid ascending sawtooth tones signal "wall ahead"
    playTone(330, 0.50, 55, 'sawtooth');
    setTimeout(function(){ playTone(415, 0.60, 55, 'sawtooth'); }, 55);
    setTimeout(function(){ playTone(523, 0.70, 55, 'sawtooth'); }, 110);
    setTimeout(function(){ playTone(659, 0.80, 90, 'sawtooth'); }, 165);
  }
}

// ── Message handler (receives commands from React Native) ─────────────────────
function handleMessage(event) {
  try {
    var data = JSON.parse(event.data);
    if (data.cmd === 'tone') {
      playTone(data.freq, data.vol, data.dur, data.wave);
    } else if (data.cmd === 'feature') {
      playFeature(data.type);
    } else if (data.cmd === 'resume') {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }
  } catch(e) {}
}

// React Native WebView fires messages on window (iOS) and document (Android)
window.addEventListener('message',   handleMessage);
document.addEventListener('message', handleMessage);
</script>
</body>
</html>
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function AudioEngine({ engineRef }) {
  const webviewRef = useRef(null);

  useEffect(() => {
    if (engineRef) engineRef.current = webviewRef.current;
  }, [engineRef]);

  return (
    <WebView
      ref={webviewRef}
      source={{ html: AUDIO_HTML }}
      style={{ width: 0, height: 0, position: 'absolute', opacity: 0 }}
      javaScriptEnabled
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      originWhitelist={['*']}
    />
  );
}
