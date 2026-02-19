/**
 * Minimal CSV parser that supports:
 * - commas
 * - newlines
 * - quoted fields with escaped quotes ("")
 *
 * Returns array-of-arrays (rows).
 */
export function parseCSV(text) {
  // Normalize BOM and line endings
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }

  // final field
  row.push(field);
  rows.push(row);

  // Remove trailing empty row if file ends with newline
  while (rows.length && rows[rows.length - 1].every(v => (v ?? "") === "")) {
    rows.pop();
  }

  return rows;
}

export function toObjects(rows) {
  if (!rows || rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map(h => (h ?? "").toString().trim());
  const records = [];

  for (let r = 1; r < rows.length; r++) {
    const record = {};
    const row = rows[r];
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] || `Column${c + 1}`;
      record[key] = (row[c] ?? "").toString();
    }
    records.push(record);
  }

  return { headers, records };
}
