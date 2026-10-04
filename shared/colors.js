// shared/colors.js – Sublime help tool
// Färgpaletten för domäner. Hubben och exportfilerna refererar till färgerna
// med ett nummer 1–8 (position i listan), internt lagras hex-värdet.

export const COLORS = [
  { value: '#2c3956', label: 'Sublime' },
  { value: '#3b82f6', label: 'Blå' },
  { value: '#22c55e', label: 'Grön' },
  { value: '#f59e0b', label: 'Gul' },
  { value: '#ef4444', label: 'Röd' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#14b8a6', label: 'Turkos' },
  { value: '#8b5cf6', label: 'Lila' },
];

export function colorToNumber(hex) {
  const idx = COLORS.findIndex(c => c.value === (hex || COLORS[0].value));
  return idx >= 0 ? idx + 1 : 1;
}

// Tar emot 1–8 (som siffra eller text). Allt annat ger standardfärgen.
export function numberToColor(n) {
  const idx = parseInt(n, 10) - 1;
  return COLORS[idx]?.value ?? COLORS[0].value;
}
