export function mapValueToDuration(value) {
  const absoluteValue = Math.abs(value);

  if (absoluteValue < 2) {
    return 40;
  }

  if (absoluteValue < 6) {
    return 140;
  }

  return 280;
}

export function buildHapticPattern(values) {
  const pattern = [0];

  values.forEach((value, index) => {
    pattern.push(mapValueToDuration(value));
    if (index < values.length - 1) {
      pattern.push(80);
    }
  });

  return pattern;
}
