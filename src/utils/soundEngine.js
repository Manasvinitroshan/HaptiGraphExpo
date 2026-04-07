/**
 * soundEngine.js
 *
 * Singleton that bridges React Native → AudioEngine WebView.
 *
 * Call setRef(webviewInstance) once the AudioEngine mounts,
 * then call playTone / playFeature from anywhere in the app.
 *
 * Muted state is also managed here so the hook can toggle sound
 * without touching the WebView directly.
 */

let _webviewRef = null;
let _muted = false;

/**
 * Register the WebView instance from AudioEngine.
 * Called once in the useEffect of AudioEngine.
 * @param {object} ref  The WebView component instance.
 */
function setRef(ref) {
  _webviewRef = ref;
  // Wake the AudioContext on iOS as early as possible
  if (ref) {
    try {
      ref.postMessage(JSON.stringify({ cmd: 'resume' }));
    } catch {}
  }
}

/**
 * Play a tone using the bandit action's sound parameters.
 *
 * @param {{
 *   toneFreq: number,   Hz — pitch (e.g. 261, 392, 523)
 *   toneVol:  number,   0–1 amplitude
 *   toneWave: string,   'sine' | 'triangle' | 'square' | 'sawtooth'
 *   delay:    number,   ms — used to set tone duration (~40% of delay)
 * }} params
 */
function playTone({ toneFreq, toneVol, toneWave, delay }) {
  if (_muted || !_webviewRef) return;
  try {
    const dur = Math.max(20, Math.round((delay ?? 80) * 0.4));
    _webviewRef.postMessage(JSON.stringify({
      cmd:  'tone',
      freq: toneFreq ?? 392,
      vol:  toneVol  ?? 0.5,
      dur,
      wave: toneWave ?? 'sine',
    }));
  } catch {}
}

/**
 * Play a feature landmark sound pattern.
 * @param {'peak'|'valley'|'zeroCrossing'} featureKey
 */
function playFeature(featureKey) {
  if (_muted || !_webviewRef) return;
  try {
    _webviewRef.postMessage(JSON.stringify({ cmd: 'feature', type: featureKey }));
  } catch {}
}

/**
 * Mute / unmute all sound output.
 * @param {boolean} muted
 */
function setMuted(muted) {
  _muted = Boolean(muted);
}

function isMuted() {
  return _muted;
}

const soundEngine = { setRef, playTone, playFeature, setMuted, isMuted };
export default soundEngine;
