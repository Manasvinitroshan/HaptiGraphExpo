/**
 * graphParser.js
 *
 * Research-grade mathematical expression parser and evaluator for React Native.
 * No eval / new Function — pure recursive descent parser → AST → compiled evaluator.
 *
 * Grammar (operator precedence, low → high):
 *   expression := term     (('+' | '-') term)*
 *   term       := factor   (('*' | '/') factor)*
 *   factor     := unary    ('^' factor)?          ← right-associative
 *   unary      := '-' unary | primary
 *   primary    := NUMBER | IDENT | FUNC '(' expression ')' | '(' expression ')'
 *
 * Exports:
 *   parseEquation(equation)         → [{ x, y }]
 *   parseEquationAdvanced(equation) → { points, slope, curvature, features }
 */

// ─── Tokenizer ────────────────────────────────────────────────────────────────

/** Token type constants */
const T = {
  NUMBER: 'NUMBER',
  IDENT:  'IDENT',
  PLUS:   'PLUS',
  MINUS:  'MINUS',
  STAR:   'STAR',
  SLASH:  'SLASH',
  CARET:  'CARET',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  EOF:    'EOF',
};

/**
 * Converts a raw equation string into a flat list of typed tokens.
 * @param {string} src
 * @returns {{ type: string, value?: any }[]}
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) { i++; continue; }

    // Numeric literal (including decimals like ".5")
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      tokens.push({ type: T.NUMBER, value: parseFloat(num) });
      continue;
    }

    // Identifier: function name, variable, or constant
    if (/[a-zA-Z_]/.test(ch)) {
      let name = '';
      while (i < src.length && /[a-zA-Z_0-9]/.test(src[i])) name += src[i++];
      tokens.push({ type: T.IDENT, value: name });
      continue;
    }

    // Single-character operators and delimiters
    const SINGLE = {
      '+': T.PLUS, '-': T.MINUS, '*': T.STAR,  '/': T.SLASH,
      '^': T.CARET, '(': T.LPAREN, ')': T.RPAREN,
    };
    if (ch in SINGLE) { tokens.push({ type: SINGLE[ch] }); i++; continue; }

    throw new Error(`Unexpected character: '${ch}' at position ${i}`);
  }

  tokens.push({ type: T.EOF });
  return tokens;
}

// ─── Parser → AST ─────────────────────────────────────────────────────────────

/**
 * Parses a token list into an Abstract Syntax Tree.
 *
 * AST node shapes:
 *   { type: 'Number',     value: number }
 *   { type: 'Identifier', name: string }
 *   { type: 'UnaryMinus', operand: Node }
 *   { type: 'BinaryOp',   op: T.*, left: Node, right: Node }
 *   { type: 'Call',       name: string, arg: Node }
 *
 * @param {{ type: string, value?: any }[]} tokens
 * @returns {object} AST root node
 */
function parse(tokens) {
  let pos = 0;

  const peek    = ()        => tokens[pos];
  const eat     = ()        => tokens[pos++];
  const match   = (...ts)   => ts.includes(peek().type);
  const expect  = (type)    => {
    if (peek().type !== type) {
      throw new Error(`Expected ${type}, got ${peek().type} at token ${pos}`);
    }
    return eat();
  };

  // expression := term (('+' | '-') term)*
  function expression() {
    let node = term();
    while (match(T.PLUS, T.MINUS)) {
      const op = eat().type;
      node = { type: 'BinaryOp', op, left: node, right: term() };
    }
    return node;
  }

  // term := factor (('*' | '/') factor)*
  function term() {
    let node = factor();
    while (match(T.STAR, T.SLASH)) {
      const op = eat().type;
      node = { type: 'BinaryOp', op, left: node, right: factor() };
    }
    return node;
  }

  // factor := unary ('^' factor)?   — right-assoc: recurse into factor, not unary
  function factor() {
    const base = unary();
    if (match(T.CARET)) {
      eat();
      return { type: 'BinaryOp', op: T.CARET, left: base, right: factor() };
    }
    return base;
  }

  // unary := '-' unary | primary
  function unary() {
    if (match(T.MINUS)) { eat(); return { type: 'UnaryMinus', operand: unary() }; }
    return primary();
  }

  // primary := NUMBER | IDENT '(' expr ')' | IDENT | '(' expr ')'
  function primary() {
    const tok = peek();

    if (tok.type === T.NUMBER) {
      eat();
      return { type: 'Number', value: tok.value };
    }

    if (tok.type === T.IDENT) {
      eat();
      if (match(T.LPAREN)) {         // function call: name(expr)
        eat();
        const arg = expression();
        expect(T.RPAREN);
        return { type: 'Call', name: tok.value, arg };
      }
      return { type: 'Identifier', name: tok.value };
    }

    if (tok.type === T.LPAREN) {
      eat();
      const node = expression();
      expect(T.RPAREN);
      return node;
    }

    throw new Error(`Unexpected token type: ${tok.type} at position ${pos}`);
  }

  const ast = expression();
  if (peek().type !== T.EOF) {
    throw new Error('Unexpected tokens after end of expression');
  }
  return ast;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/** Supported mathematical functions */
const FUNCTIONS = {
  sin:   Math.sin,
  cos:   Math.cos,
  tan:   Math.tan,
  asin:  Math.asin,
  acos:  Math.acos,
  atan:  Math.atan,
  log:   Math.log,     // natural log (ln)
  log2:  Math.log2,
  log10: Math.log10,
  sqrt:  Math.sqrt,
  cbrt:  Math.cbrt,
  abs:   Math.abs,
  exp:   Math.exp,
  ceil:  Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sign:  Math.sign,
};

/** Named mathematical constants */
const CONSTANTS = {
  pi: Math.PI,  PI: Math.PI,
  e:  Math.E,   E:  Math.E,
  tau: 2 * Math.PI,
};

/**
 * Recursively evaluates an AST node at a given x value.
 * @param {object} node  AST node
 * @param {number} x     Current variable value
 * @returns {number}
 */
function evaluate(node, x) {
  switch (node.type) {
    case 'Number':
      return node.value;

    case 'Identifier':
      if (node.name === 'x') return x;
      if (node.name in CONSTANTS) return CONSTANTS[node.name];
      throw new Error(`Unknown identifier: '${node.name}'`);

    case 'UnaryMinus':
      return -evaluate(node.operand, x);

    case 'BinaryOp': {
      const l = evaluate(node.left,  x);
      const r = evaluate(node.right, x);
      switch (node.op) {
        case T.PLUS:  return l + r;
        case T.MINUS: return l - r;
        case T.STAR:  return l * r;
        case T.SLASH: return r === 0 ? NaN : l / r;
        case T.CARET: return Math.pow(l, r);
      }
      break;
    }

    case 'Call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new Error(`Unknown function: '${node.name}'`);
      return fn(evaluate(node.arg, x));
    }
  }
  throw new Error(`Unknown AST node type: '${node.type}'`);
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

/**
 * Compiles an equation string into a reusable evaluator function.
 * The AST is built once; subsequent calls only walk the tree.
 *
 * @param {string} equation
 * @returns {((x: number) => number) | null}  null on parse error
 */
function compile(equation) {
  try {
    const ast = parse(tokenize(equation));
    return (x) => evaluate(ast, x);
  } catch {
    return null;
  }
}

// ─── Numerical Analysis ───────────────────────────────────────────────────────

/**
 * Central-difference first derivative.
 * Error term: O(h²) — accurate to ~10 significant figures with h = 1e-5.
 *
 * @param {(x: number) => number} fn
 * @param {number} x
 * @param {number} h  Step size (default: 1e-5)
 */
function derivative1(fn, x, h = 1e-5) {
  return (fn(x + h) - fn(x - h)) / (2 * h);
}

/**
 * Central-difference second derivative.
 * Optimal h balances truncation error O(h²) and floating-point roundoff O(ε/h²).
 * h = 1e-4 minimises total error for IEEE-754 doubles.
 *
 * @param {(x: number) => number} fn
 * @param {number} x
 * @param {number} h  Step size (default: 1e-4)
 */
function derivative2(fn, x, h = 1e-4) {
  return (fn(x + h) - 2 * fn(x) + fn(x - h)) / (h * h);
}

/** Returns true if the value is a usable finite number. */
const isValid = (v) => typeof v === 'number' && isFinite(v) && !isNaN(v);

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Maps an array of numbers linearly into [-1, 1].
 * Returns the original array unchanged if all values are identical.
 *
 * @param {number[]} values
 * @returns {number[]}
 */
function normalizeRange(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0);
  return values.map((v) => parseFloat((2 * (v - min) / range - 1).toFixed(6)));
}

// ─── Asymptote Detection ──────────────────────────────────────────────────────

const STEP = (X_MAX - X_MIN) / STEPS; // ~0.1

/**
 * Detects vertical and horizontal asymptotes from raw sampled points.
 *
 * Vertical asymptotes:
 *   1. Gap in rawPoints (consecutive x-distance > 1.5× step) with large |y|
 *      on both sides — the NaN zone indicates the function blows up.
 *   2. Consecutive valid points with a large sign-flipping jump in y.
 *
 * Horizontal asymptotes:
 *   Check whether y values converge (low variance) near the x boundaries.
 *
 * @param {{ x: number, y: number }[]} rawPoints  Already-validated sample points
 * @returns {{ vertical: {x}[], horizontal: {y}[] }}
 */
function detectAsymptotes(rawPoints) {
  const vertical   = [];
  const horizontal = [];

  // ── Vertical ──────────────────────────────────────────────────────────────
  for (let i = 0; i < rawPoints.length - 1; i++) {
    const a = rawPoints[i];
    const b = rawPoints[i + 1];
    const gap = b.x - a.x;

    // Case 1: gap in samples — NaN region with large |y| on both sides
    if (gap > STEP * 1.8 && Math.abs(a.y) > 5 && Math.abs(b.y) > 5) {
      vertical.push({ x: parseFloat(((a.x + b.x) / 2).toFixed(4)) });
      continue;
    }

    // Case 2: no gap but large sign-flip jump (function passes through ±∞)
    const jump     = Math.abs(b.y - a.y);
    const signFlip = (a.y > 0) !== (b.y > 0);
    if (gap <= STEP * 1.8 && jump > 30 && signFlip) {
      vertical.push({ x: parseFloat(((a.x + b.x) / 2).toFixed(4)) });
    }
  }

  // Deduplicate vertical (merge asymptotes within 0.5 of each other)
  const dedupedV = [];
  for (const v of vertical) {
    if (!dedupedV.some((d) => Math.abs(d.x - v.x) < 0.5)) dedupedV.push(v);
  }

  // ── Horizontal ────────────────────────────────────────────────────────────
  const rightPts = rawPoints.filter((p) => p.x > 7.5);
  const leftPts  = rawPoints.filter((p) => p.x < -7.5);

  function limitValue(pts) {
    if (pts.length < 4) return null;
    const ys  = pts.map((p) => p.y);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const variance = ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length;
    if (variance < 0.15 && Math.abs(mean) < 1e4) return parseFloat(mean.toFixed(3));
    return null;
  }

  const rLimit = limitValue(rightPts);
  const lLimit = limitValue(leftPts);

  if (rLimit !== null && lLimit !== null && Math.abs(rLimit - lLimit) < 1) {
    horizontal.push({ y: parseFloat(((rLimit + lLimit) / 2).toFixed(3)) });
  } else if (rLimit !== null) {
    horizontal.push({ y: rLimit });
  } else if (lLimit !== null) {
    horizontal.push({ y: lLimit });
  }

  return { vertical: dedupedV, horizontal };
}

// ─── Feature Detection ────────────────────────────────────────────────────────

/**
 * Detects peaks, valleys, and zero-crossings from sampled points.
 *
 * A peak   is a point where y[i-1] < y[i] > y[i+1].
 * A valley is a point where y[i-1] > y[i] < y[i+1].
 * A zero-crossing is where consecutive y values straddle zero (sign change).
 *
 * @param {{ x: number, y: number }[]} pts  Sorted, validated sample points
 * @returns {{ peaks, valleys, zeroCrossings }}
 */
function detectFeatures(pts) {
  const peaks         = [];
  const valleys       = [];
  const zeroCrossings = [];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1].y;
    const curr = pts[i].y;
    const next = pts[i + 1].y;

    if (curr > prev && curr > next) {
      peaks.push({ x: pts[i].x, y: curr });
    } else if (curr < prev && curr < next) {
      valleys.push({ x: pts[i].x, y: curr });
    }

    // Zero-crossing: sign change between consecutive points
    if (i < pts.length - 1) {
      const a = pts[i].y;
      const b = pts[i + 1].y;
      if (isValid(a) && isValid(b) && a * b < 0) {
        // Linear interpolation for a more precise crossing estimate
        const xCross = pts[i].x - a * (pts[i + 1].x - pts[i].x) / (b - a);
        zeroCrossings.push({ x: parseFloat(xCross.toFixed(4)) });
      }
    }
  }

  return { peaks, valleys, zeroCrossings };
}

// ─── Sampling Helpers ─────────────────────────────────────────────────────────

const X_MIN   = -10;
const X_MAX   =  10;
const STEPS   =  200;
const Y_CLAMP =  1e6;

/**
 * Generates evenly-spaced x values over [X_MIN, X_MAX].
 * @returns {number[]}
 */
function xRange() {
  const step = (X_MAX - X_MIN) / STEPS;
  return Array.from({ length: STEPS + 1 }, (_, i) => X_MIN + i * step);
}

/**
 * Safely calls fn(x), returning NaN on any error or out-of-range result.
 * @param {(x: number) => number} fn
 * @param {number} x
 * @returns {number}
 */
function safeEval(fn, x) {
  try {
    const y = fn(x);
    if (!isValid(y) || Math.abs(y) > Y_CLAMP) return NaN;
    return y;
  } catch {
    return NaN;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Simple parser — returns raw (x, y) sample points.
 *
 * @param {string} equation  e.g. "sin(x) + x^2"
 * @returns {{ x: number, y: number }[]}
 */
export function parseEquation(equation) {
  if (!equation || typeof equation !== 'string') return [];

  const fn = compile(equation.trim());
  if (!fn) return [];

  return xRange().reduce((acc, x) => {
    const y = safeEval(fn, x);
    if (!isNaN(y)) {
      acc.push({ x: parseFloat(x.toFixed(4)), y: parseFloat(y.toFixed(4)) });
    }
    return acc;
  }, []);
}

/**
 * Research-grade parser — returns sampled points plus slope, curvature,
 * feature annotations, and min-max normalised y values.
 *
 * Output structure:
 * {
 *   points:    [{ x, y, normalizedY }],     ← raw + normalised y
 *   slope:     [{ x, dy }],                 ← first derivative  f'(x)
 *   curvature: [{ x, d2y }],                ← second derivative f''(x)
 *   features: {
 *     peaks:         [{ x, y }],            ← local maxima
 *     valleys:       [{ x, y }],            ← local minima
 *     zeroCrossings: [{ x }],               ← sign changes (interpolated)
 *   },
 * }
 *
 * Returns null on invalid equation.
 *
 * @param {string} equation  e.g. "sin(x) + x^2"
 * @returns {object | null}
 */
export function parseEquationAdvanced(equation) {
  if (!equation || typeof equation !== 'string') return null;

  // ── 1. Compile once ───────────────────────────────────────────────────────
  const fn = compile(equation.trim());
  if (!fn) return null;

  // ── 2. Sample y, f'(x), f''(x) over the x range ──────────────────────────
  const rawPoints   = [];   // { x, y }
  const rawSlope    = [];   // { x, dy }
  const rawCurve    = [];   // { x, d2y }

  for (const x of xRange()) {
    const y   = safeEval(fn, x);
    if (isNaN(y)) continue;

    // Numerical derivatives via central differences (compiled AST reused)
    const dy  = safeEval((v) => derivative1(fn, v), x);
    const d2y = safeEval((v) => derivative2(fn, v), x);

    const xR = parseFloat(x.toFixed(4));
    rawPoints.push({ x: xR, y: parseFloat(y.toFixed(6)) });
    if (!isNaN(dy))  rawSlope.push({ x: xR, dy:  parseFloat(dy.toFixed(6)) });
    if (!isNaN(d2y)) rawCurve.push({ x: xR, d2y: parseFloat(d2y.toFixed(6)) });
  }

  if (rawPoints.length === 0) return null;

  // ── 3. Normalise y values to [-1, 1] ─────────────────────────────────────
  const normalizedYs = normalizeRange(rawPoints.map((p) => p.y));
  const points = rawPoints.map((p, i) => ({ ...p, normalizedY: normalizedYs[i] }));

  // ── 4. Detect graph features ──────────────────────────────────────────────
  const features = {
    ...detectFeatures(rawPoints),
    asymptotes: detectAsymptotes(rawPoints),
  };

  return {
    points,
    slope:     rawSlope,
    curvature: rawCurve,
    features,
  };
}
