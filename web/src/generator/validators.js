export function requireTables(tables, names) {
  const missing = names.filter(n => !Array.isArray(tables?.[n]?.records));
  if (missing.length) throw new Error(`Missing required table(s): ${missing.join(", ")}`);
}
