/** Flags numbers that do not occur in the verified profile; this is a reminder, not fact-checking. */
export function findUnverifiedNumbers(text: string, profile: string): string[] {
  const numbers = (input: string) => new Set(input.match(/\b\d+(?:[.,]\d+)*\+?\b/g) || []);
  const known = numbers(profile);
  return [...numbers(text)].filter(value => !known.has(value)).slice(0, 20);
}
