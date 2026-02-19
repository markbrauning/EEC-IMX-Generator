import { parseCSV, toObjects } from "./csv.js";

/**
 * Loads all tables listed in srcdata/_manifest.csv.
 * Also tries to load srcdata/ITKSiteList.csv even if not listed (optional).
 *
 * Returns:
 *   {
 *     [tableName]: { headers: string[], records: object[] }
 *   }
 */
export async function loadAllTables({ basePath, onProgress } = {}) {
  const progress = typeof onProgress === "function" ? onProgress : () => {};
  const bp = (basePath || "./srcdata").replace(/\/$/, "");

  // 1) Manifest
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

  // Add optional ITKSiteList if not present
  const siteListName = "ITKSiteList";
  const hasSiteList = files.some(f => f.table === siteListName || f.file.toLowerCase() === "itksitelist.csv");
  if (!hasSiteList) {
    files.unshift({ table: siteListName, file: "ITKSiteList.csv" });
  }

  // 2) Load each CSV (sequential for stable progress + memory)
  const tables = {};
  let loaded = 0;
  const total = files.length;

  for (const item of files) {
    const { table, file } = item;
    progress({ phase: "tables", loaded, total, table, message: `Loading ${file}…` });

    const res = await fetch(`${bp}/${file}`, { cache: "no-store" });
    if (!res.ok) {
      // ITKSiteList is optional: ignore if missing
      if (file.toLowerCase() === "itksitelist.csv") {
        loaded++;
        continue;
      }
      throw new Error(`Could not load ${bp}/${file} (HTTP ${res.status}).`);
    }

    const text = await res.text();
    const rows = parseCSV(text);
    const obj = toObjects(rows);
    tables[table] = obj;

    loaded++;
    progress({ phase: "tables", loaded, total, table, message: `Loaded ${file}` });
  }

  progress({ phase: "done", loaded: total, total, message: "All tables loaded." });
  return tables;
}

/**
 * Derive a minimal site list if ITKSiteList isn't present.
 * Uses unique Site_ID values from ITKRackLayout and a couple helpful fields if present.
 */
export function deriveSiteListFromRackLayout(tables, siteIdColumn = "Site_ID") {
  const rack = tables["ITKRackLayout"]?.records || [];
  const map = new Map();

  for (const r of rack) {
    const siteId = (r[siteIdColumn] || "").trim();
    if (!siteId) continue;
    if (!map.has(siteId)) {
      map.set(siteId, {
        Site_ID: siteId,
        Panel: (r["Panel"] || "").trim(),
        Revision_ID: (r["Revision_ID"] || "").trim()
      });
    }
  }

  return Array.from(map.values());
}
