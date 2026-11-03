/** A text comparison, not a fact check. Do not claim that new wording is true. */
export function compareResume(original: string, tailored: string) {
  const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const lines = (s: string) => s.split(/\r?\n/).map(line => line.trim()).filter(line => normalize(line).length >= 25);
  if (!original.trim()) return { available: false, sameText: false, changedLines: [] as string[] };
  const previous = new Set(lines(original).map(normalize));
  const changedLines = lines(tailored).filter(line => !previous.has(normalize(line))).slice(0, 12);
  return { available: true, sameText: normalize(original) === normalize(tailored), changedLines };
}
