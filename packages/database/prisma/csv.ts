/** Minimal RFC 4180 CSV reader for the curation files in /private (same format as apps/api/scripts/catalog.ts). */
export type CsvRow = Record<string, string>;

export function parseCsv(text: string): { header: string[]; rows: CsvRow[] } {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') record.push(field), (field = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field), (field = '');
      if (record.some((f) => f !== '')) records.push(record);
      record = [];
    } else field += ch;
  }
  if (field !== '' || record.length) record.push(field), records.push(record);
  const [header = [], ...data] = records;
  return { header, rows: data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}
