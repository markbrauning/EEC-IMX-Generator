import { parseCSV, toObjects } from "./csv.js";

/**
 * Loads all tables listed in srcdata/_manifest.csv.
 * ITKSiteList.csv is expected to be present (required).
 */
export async function loadAllTables({ basePath, onProgress } = {}) {
  const progress = typeof onProgress === "function" ? onProgress : () => {};
  const bp = (basePath || "./srcdata").replace(/\/$/, "");

  progress({ phase: "manifest", message: "Loading _manifest.csv…" });
  const manifestRes = await fetch(`${bp}/_manifest.csv`, { cache: "no-store" });
  if (!manifestRes.ok) {
    throw new Error(`Could not load ${bp}/_manifest.csv (HTTP ${manifestRes.status}). Make sure srcdata/_manifest.csv exists.`);
  }
  const manifestText = await manifestRes.text();
  const manifestRows = parseCSV(manifestText);
  const { headers, records } = toObjects(manifestRows);

  const tableNameCol = headers.includes("table_name") ? "table_name" : null;
  const csvFileCol = headers.includes("csv_file") ? "csv_file" : null;

  if (!tableNameCol || !csvFileCol) {
    throw new Error("Manifest is missing required columns: table_name and csv_file.");
  }

  const files = records
    .filter(r => (r[csvFileCol] || "").trim().length > 0)
    .map(r => ({ table: (r[tableNameCol] || "").trim(), file: (r[csvFileCol] || "").trim() }))
    .filter(x => x.table && x.file);

  // Ensure ITKSiteList is included (required)
  const siteListName = "ITKSiteList";
  const hasSiteList = files.some(f => f.table === siteListName || f.file.toLowerCase() === "itksitelist.csv");
  if (!hasSiteList) {
    files.unshift({ table: siteListName, file: "ITKSiteList.csv" });
  }

  const tables = {};
  let loaded = 0;
  const total = files.length;

  for (const item of files) {
    const { table, file } = item;
    progress({ phase: "tables", loaded, total, table, message: `Loading ${file}…` });

    const res = await fetch(`${bp}/${file}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load ${bp}/${file} (HTTP ${res.status}).`);

    const text = await res.text();
    tables[table] = toObjects(parseCSV(text));

    loaded++;
    progress({ phase: "tables", loaded, total, table, message: `Loaded ${file}` });
  }

  progress({ phase: "done", loaded: total, total, message: "All tables loaded." });

  if (!tables["ITKSiteList"] || !(tables["ITKSiteList"].records?.length > 0)) {
    throw new Error("ITKSiteList is missing or empty. Ensure srcdata/ITKSiteList.csv exists and has data.");
  }

  return tables;
}
