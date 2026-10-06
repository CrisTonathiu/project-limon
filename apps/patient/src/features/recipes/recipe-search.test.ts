import { describe, expect, it } from 'vitest';
import { matchesSearch } from './recipe-search';

describe('matchesSearch', () => {
  it('ignores case and accents', () => {
    expect(matchesSearch('Jícama con limón', 'JICAMA')).toBe(true);
    expect(matchesSearch('Agua de piña', 'pina')).toBe(true);
  });

  it('needs every word, in any order', () => {
    expect(matchesSearch('Ensalada de quinoa con pollo', 'pollo quinoa')).toBe(true);
    expect(matchesSearch('Ensalada de quinoa con pollo', 'pollo res')).toBe(false);
  });

  it('matches everything when the query is blank', () => {
    expect(matchesSearch('Tacos de pescado', '  ')).toBe(true);
  });
});
