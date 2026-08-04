// Deterministically derive a display color for a username, so the same
// username always renders with the same generated avatar color.
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // convert to 32bit integer
  }
  return Math.abs(hash);
}

export function stringToColor(str: string, saturation = 60, lightness = 45): string {
  const hue = hashString(str) % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
