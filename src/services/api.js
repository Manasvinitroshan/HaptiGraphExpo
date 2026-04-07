/* eslint-disable no-new-func */
const allowedChars = /^[0-9xX+\-*/.^()\s]+$/;

function normalizeEquation(equation) {
  const trimmed = equation.trim();
  if (!trimmed || !allowedChars.test(trimmed)) {
    throw new Error('Invalid equation');
  }
  return trimmed.replace(/\^/g, '**');
}

export async function generateGraphSamples(equation) {
  const expression = normalizeEquation(equation);
  const compute = new Function('x', `return ${expression}`);

  const samples = [];
  for (let index = 0; index < 9; index += 1) {
    const x = index - 4;
    const rawValue = compute(x);
    const value = Number(rawValue);

    if (!Number.isFinite(value)) {
      throw new Error('Invalid graph output');
    }

    samples.push(Number(value.toFixed(2)));
  }

  return Promise.resolve(samples);
}
