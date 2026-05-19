const PALETTE = [
  { bg: '#fee8e8', fg: '#c0392b', accent: '#e74c3c' }, // red
  { bg: '#fdebd0', fg: '#b9770e', accent: '#e67e22' }, // orange
  { bg: '#fef5d4', fg: '#9a7d0a', accent: '#f1c40f' }, // yellow
  { bg: '#e8f5e9', fg: '#1b5e20', accent: '#2ecc71' }, // green
  { bg: '#e0f2f1', fg: '#00695c', accent: '#1abc9c' }, // teal
  { bg: '#e3f2fd', fg: '#0d47a1', accent: '#3498db' }, // blue
  { bg: '#ede7f6', fg: '#4527a0', accent: '#9b59b6' }, // purple
  { bg: '#fce4ec', fg: '#880e4f', accent: '#e84393' }, // pink
];

export function colorForSubject(name: string): typeof PALETTE[number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function emojiForSubject(name: string): string {
  const lower = name.toLowerCase();
  if (/数学|math/.test(lower)) return '📐';
  if (/英語|english/.test(lower)) return '🔤';
  if (/物理|physics/.test(lower)) return '⚛️';
  if (/化学|chemistry/.test(lower)) return '🧪';
  if (/生物|biology/.test(lower)) return '🧬';
  if (/歴史|history/.test(lower)) return '📜';
  if (/地理|geo/.test(lower)) return '🗺️';
  if (/国語|japanese|literature/.test(lower)) return '📖';
  if (/プログラミング|programming|cs|computer/.test(lower)) return '💻';
  if (/音楽|music/.test(lower)) return '🎵';
  if (/美術|art/.test(lower)) return '🎨';
  if (/体育|pe|gym/.test(lower)) return '⚽';
  if (/経済|econ/.test(lower)) return '📊';
  if (/哲学|philosophy/.test(lower)) return '💭';
  if (/心理|psych/.test(lower)) return '🧠';
  return '📚';
}
