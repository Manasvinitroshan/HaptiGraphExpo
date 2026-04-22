/**
 * Classifies a drawn curve into a mathematical function type.
 * Uses least-squares polynomial fitting and oscillation detection.
 */

function gaussianElim(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-10) continue;
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
    }
  }

  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    if (Math.abs(M[i][i]) > 1e-10) x[i] /= M[i][i];
  }
  return x;
}

function polyFit(xs, ys, degree) {
  const n = xs.length;
  const d = degree + 1;
  const AtA = Array(d).fill(null).map(() => Array(d).fill(0));
  const Aty = Array(d).fill(0);

  for (let i = 0; i < n; i++) {
    const row = Array.from({ length: d }, (_, j) => Math.pow(xs[i], j));
    for (let j = 0; j < d; j++) {
      Aty[j] += row[j] * ys[i];
      for (let k = 0; k < d; k++) AtA[j][k] += row[j] * row[k];
    }
  }
  return gaussianElim(AtA, Aty);
}

function rmse(xs, ys, coeffs) {
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    const pred = coeffs.reduce((acc, c, j) => acc + c * Math.pow(xs[i], j), 0);
    sum += (ys[i] - pred) ** 2;
  }
  return Math.sqrt(sum / xs.length);
}

function zeroCrossings(ys) {
  let count = 0;
  for (let i = 1; i < ys.length; i++) {
    if (ys[i - 1] * ys[i] < 0) count++;
  }
  return count;
}

function fmt(n, d = 2) {
  const v = parseFloat(n.toFixed(d));
  return v === 0 ? '0' : String(v);
}

function sign(n) {
  return n >= 0 ? '+' : '';
}

/**
 * @param {Array<{x: number, y: number}>} rawPoints - canvas coordinates
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{ type: string, equation: string, confidence: number }}
 */
export function classifyDrawnFunction(rawPoints, canvasWidth, canvasHeight) {
  // Downsample to at most 120 points
  const step = Math.max(1, Math.floor(rawPoints.length / 120));
  const pts = rawPoints.filter((_, i) => i % step === 0);

  // Normalize to math coords: x in [-1,1], y in [-1,1] (flip canvas y)
  const xs = pts.map(p => (p.x / canvasWidth) * 2 - 1);
  const ys = pts.map(p => -((p.y / canvasHeight) * 2 - 1));

  // Center y for zero-crossing analysis
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const centeredYs = ys.map(y => y - meanY);
  const crossings = zeroCrossings(centeredYs);

  // Sinusoidal: multiple oscillations
  if (crossings >= 3) {
    const amplitude = (Math.max(...ys) - Math.min(...ys)) / 2;
    const freq = Math.max(1, Math.round(crossings / 2));
    return {
      type: 'Sinusoidal',
      equation: `y ≈ ${fmt(amplitude)}·sin(${freq}πx)`,
      confidence: Math.min(0.92, 0.55 + crossings * 0.08),
    };
  }

  const c1 = polyFit(xs, ys, 1);
  const c2 = polyFit(xs, ys, 2);
  const c3 = polyFit(xs, ys, 3);

  const r1 = rmse(xs, ys, c1);
  const r2 = rmse(xs, ys, c2);
  const r3 = rmse(xs, ys, c3);

  const LINEAR_THRESH = 0.08;
  const QUAD_THRESH = 0.06;

  // Linear
  if (r1 < LINEAR_THRESH || (r1 <= r2 * 1.05 && r1 <= r3 * 1.05)) {
    const [a0, a1] = c1;
    const eq = `y = ${fmt(a1)}x ${sign(a0)}${fmt(a0)}`;
    return { type: 'Linear', equation: eq, confidence: Math.min(0.95, Math.max(0.5, 1 - r1 * 4)) };
  }

  // Quadratic vs cubic: prefer quadratic unless cubic is significantly better
  if (r2 < QUAD_THRESH || r2 <= r3 * 1.08) {
    const [a0, a1, a2] = c2;
    const eq = `y = ${fmt(a2)}x² ${sign(a1)}${fmt(a1)}x ${sign(a0)}${fmt(a0)}`;
    return { type: 'Quadratic', equation: eq, confidence: Math.min(0.93, Math.max(0.5, 1 - r2 * 4)) };
  }

  // Cubic
  const [a0, a1, a2, a3] = c3;
  const eq = `y = ${fmt(a3)}x³ ${sign(a2)}${fmt(a2)}x² ${sign(a1)}${fmt(a1)}x ${sign(a0)}${fmt(a0)}`;
  return { type: 'Cubic', equation: eq, confidence: Math.min(0.90, Math.max(0.5, 1 - r3 * 4)) };
}
