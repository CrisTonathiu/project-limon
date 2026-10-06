/** Lowercase without accents, so "jicama" finds "Jícama" and "pina" finds "Piña". */
const fold = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX').trim();

/** Every word of the query appears in the title, in any order. An empty query matches everything. */
export function matchesSearch(title: string, query: string): boolean {
  const haystack = fold(title);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
