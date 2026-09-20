/** Tileable, seeded wind spectra for Water2's two independently advected layers.
 * Unequal wavelengths/directions avoid a regular grid or a repeating ring train.
 * Generated as data, not downloaded images: the lake also works offline. */
export function windNormalData(size: number, seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const dx = new Float32Array(size * size), dz = new Float32Array(size * size);
  for (let wave = 0; wave < 42; wave++) {
    const frequency = 1.4 * Math.pow(1.087, wave);
    const angle = -.25 + (random() - .5) * 2.7;
    const kx = Math.round(Math.cos(angle) * frequency);
    const kz = Math.round(Math.sin(angle) * frequency) || 1;
    const magnitude = Math.hypot(kx, kz);
    const amplitude = (.5 + random()) * .3 / Math.pow(magnitude, 1.7);
    const phase = random() * Math.PI * 2;
    const sx = new Float32Array(size), cx = new Float32Array(size);
    for (let x = 0; x < size; x++) {
      const a = x / size * Math.PI * 2 * kx + phase;
      sx[x] = Math.sin(a); cx[x] = Math.cos(a);
    }
    for (let z = 0; z < size; z++) {
      const b = z / size * Math.PI * 2 * kz;
      const sb = Math.sin(b), cb = Math.cos(b);
      for (let x = 0; x < size; x++) {
        const slope = (cx[x] * cb - sx[x] * sb) * amplitude;
        dx[z * size + x] += slope * kx;
        dz[z * size + x] += slope * kz;
      }
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const length = Math.hypot(dx[i], 1, dz[i]);
    data[i * 4] = Math.round((.5 - dx[i] / length * .5) * 255);
    data[i * 4 + 1] = Math.round((.5 - dz[i] / length * .5) * 255);
    data[i * 4 + 2] = Math.round(255 / length);
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** A broad current with small eddies; the flow phase moves even without drops. */
export function currentFlowData(size: number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const i = (y * size + x) * 4;
    data[i] = Math.round((.5 + (.58 + .2 * Math.cos(v) * Math.sin(u)) * .5) * 255);
    data[i + 1] = Math.round((.5 + (.14 - .28 * Math.cos(u) * Math.sin(v)) * .5) * 255);
    data[i + 2] = 0; data[i + 3] = 255;
  }
  return data;
}
