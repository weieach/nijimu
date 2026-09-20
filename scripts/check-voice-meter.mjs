// Exercise the real recorder hook and metering loop with synthetic microphone
// samples. No device is opened and no recording leaves this process.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const peaksModule = { exports: {} };
runInNewContext(compile("../src/app/lib/voicePeaks.ts"), { module: peaksModule, exports: peaksModule.exports });

for (const fps of [24, 60, 120]) {
  let now = 0, frame = null, timer = null, nextTimer = 1000, stopped = 0, released = 0;
  const cleanups = [];
  const heard = [];
  class Recorder {
    static isTypeSupported() { return true; }
    state = "inactive";
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.onstop?.(); }
  }
  class Audio {
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() {
      return { fftSize: 512, getFloatTimeDomainData(samples) {
        const seconds = now / 1000;
        const amplitude = seconds < 8 ? .24 : .045;
        const inPause = seconds > 25 && seconds < 29;
        const level = inPause ? 0 : .006 + amplitude * Math.pow(Math.max(0, Math.sin(seconds * 2 * Math.PI)), 2);
        for (let i = 0; i < samples.length; i++) samples[i] = (i % 2 ? 1 : -1) * level / 4;
      } };
    }
  }
  const hookModule = { exports: {} };
  runInNewContext(compile("../src/app/hooks/useVoiceRecorder.ts"), {
    module: hookModule, exports: hookModule.exports,
    require: name => name === "react" ? {
      useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
      useRef: current => ({ current }), useCallback: fn => fn,
      useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
    } : peaksModule.exports,
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => released++ }] }) } },
    MediaRecorder: Recorder, performance: { now: () => now },
    requestAnimationFrame: fn => { frame = fn; return 1; },
    cancelAnimationFrame: () => { frame = null; },
    clearInterval: () => { timer = null; },
    window: { AudioContext: Audio, setInterval: fn => { timer = fn; return 1; } },
  });
  const recorder = hookModule.exports.useVoiceRecorder({
    onVoicePeak: level => heard.push({ time: now, level }), onStop: () => stopped++,
  });
  await recorder.start();
  for (let i = 1; i <= fps * 61; i++) {
    now = i * 1000 / fps;
    frame?.();
    if (now >= nextTimer) { timer?.(); nextTimer += 1000; }
  }
  for (const [start, end] of [[0, 8], [10, 20], [30, 40], [50, 60]]) {
    assert.ok(heard.filter(p => p.time >= start * 1000 && p.time < end * 1000).length >= 6,
      `actual meter keeps emitting in seconds ${start}–${end} at ${fps}fps`);
  }
  assert.equal(heard.filter(p => p.time > 27000 && p.time < 29000).length, 0, "silence stays quiet");
  assert.ok(heard[0].time - 250 <= 160, "first ripple follows the actual volume crest promptly");
  assert.equal(heard.filter(p => p.time > 60000).length, 0, "no peaks after auto-stop");
  assert.equal(stopped, 1);
  assert.equal(released, 1);
  cleanups.forEach(fn => fn());
}
console.log("Recorder integration passed: 61s synthetic audio at 24/60/120fps, gain drop after 8s, pause/resume, 60s auto-stop and cleanup.");
