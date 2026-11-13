export function isValidMinimumAge(min: number | null | undefined) {
  return min == null || (Number.isInteger(min) && min >= 2 && min <= 18);
}

export function formatMinimumAge(min?: number | null) {
  if (min == null || !isValidMinimumAge(min)) return null;
  return `Ages ${min}+`;
}
