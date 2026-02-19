import { CONFIG } from "./config.js";
import { loadAllTables, deriveSiteListFromRackLayout } from "./data/loadTables.js";
import { renderSiteList } from "./ui/siteListView.js";
import { generateIMX } from "./generator/imxGenerator.js";

const els = {
  btnReload: document.getElementById("btnReload"),
  loadStatus: document.getElementById("loadStatus"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  tablesSummary: document.getElementById("tablesSummary"),

  siteSearch: document.getElementById("siteSearch"),
  siteListHost: document.getElementById("siteListHost"),
  siteListMeta: document.getElementById("siteListMeta"),
  selectedSiteId: document.getElementById("selectedSiteId"),

  btnGenerate: document.getElementById("btnGenerate"),
  downloadLink: document.getElementById("downloadLink"),
  genOutput: document.getElementById("genOutput"),
  warnings: document.getElementById("warnings")
};

let state = {
  tables: null,
  siteList: [],
  selectedSite: null,
  siteTableRenderer: null,
  filteredSites: []
};

function setStatus(text) {
  els.loadStatus.textContent = text;
}

function setProgress(pct, text) {
  els.progressBar.style.width = `${pct}%`;
  els.progressText.textContent = text || "";
}

function summarizeTables(tables) {
  const keys = Object.keys(tables || {}).sort();
  const lines = [];
  for (const k of keys) {
    const t = tables[k];
    const n = t?.records?.length ?? 0;
    const c = t?.headers?.length ?? 0;
    lines.push(`${k}: ${n} rows, ${c} cols`);
  }
  return lines.join("\n");
}

function clearWarnings() {
  els.warnings.innerHTML = "";
}

function showWarnings(list) {
  clearWarnings();
  (list || []).forEach(w => {
    const li = document.createElement("li");
    li.textContent = w;
    els.warnings.appendChild(li);
  });
}

function enableSiteUI(enabled) {
  els.siteSearch.disabled = !enabled;
}

function enableGenerate(enabled) {
  els.btnGenerate.disabled = !enabled;
}

function setSelectedSite(siteRecord) {
  state.selectedSite = siteRecord;
  const sid = siteRecord ? (siteRecord[CONFIG.SITE_ID_COLUMN] || siteRecord["Site_ID"] || "") : "";
  els.selectedSiteId.textContent = sid || "—";
  enableGenerate(Boolean(sid));
}

function filterSites(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return state.siteList;

  return state.siteList.filter(r => {
    for (const [k, v] of Object.entries(r)) {
      const s = (v ?? "").toString().toLowerCase();
      if (s.includes(q)) return true;
    }
    return false;
  });
}

function renderSites(records) {
  if (!state.siteTableRenderer) {
    // first render builds table structure
    els.siteListHost.classList.remove("subtle");
    const tableAPI = renderSiteList(els.siteListHost, records, {
      maxRenderRows: CONFIG.MAX_RENDER_ROWS,
      onSelect: (rec) => setSelectedSite(rec)
    });
    state.siteTableRenderer = tableAPI;
  }
  const { shown, total } = state.siteTableRenderer.render(records);
  els.siteListMeta.textContent = total > shown
    ? `Showing ${shown} of ${total} filtered sites (render capped at ${CONFIG.MAX_RENDER_ROWS}).`
    : `Showing ${shown} sites.`;
}

async function load() {
  setStatus("Loading…");
  setProgress(3, "Starting…");
  enableSiteUI(false);
  enableGenerate(false);
  els.downloadLink.style.display = "none";
  els.genOutput.textContent = "";
  clearWarnings();
  setSelectedSite(null);

  try {
    const tables = await loadAllTables({
      basePath: CONFIG.SRC_DATA_BASE_PATH,
      onProgress: (p) => {
        if (p.phase === "tables") {
          const pct = Math.round((p.loaded / Math.max(1, p.total)) * 100);
          setProgress(pct, p.message || "");
          setStatus(`Loading tables (${p.loaded}/${p.total})…`);
        } else if (p.phase === "manifest") {
          setProgress(5, p.message || "");
        } else if (p.phase === "done") {
          setProgress(100, p.message || "");
        }
      }
    });

    state.tables = tables;
    els.tablesSummary.textContent = summarizeTables(tables);
    setStatus("Loaded");

    // Choose site list source
    const siteTable = tables[CONFIG.SITE_LIST_TABLE_NAME]?.records;
    if (Array.isArray(siteTable) && siteTable.length) {
      state.siteList = siteTable;
    } else {
      // fallback
      state.siteList = deriveSiteListFromRackLayout(tables, CONFIG.SITE_ID_COLUMN);
      showWarnings([
        `Site list table '${CONFIG.SITE_LIST_TABLE_NAME}' not found. Using derived list from ITKRackLayout (${state.siteList.length} sites).`
      ]);
    }

    // Initial render
    state.filteredSites = state.siteList;
    els.siteSearch.value = "";
    enableSiteUI(true);

    // Build table renderer with initial list
    state.siteTableRenderer = null;
    renderSites(state.filteredSites);

  } catch (err) {
    setStatus("Error");
    setProgress(0, "Failed");
    els.siteListHost.textContent = "Failed to load tables. See details below.";
    els.genOutput.textContent = String(err?.stack || err);
    showWarnings([String(err?.message || err)]);
  }
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  els.downloadLink.href = url;
  els.downloadLink.download = filename;
  els.downloadLink.style.display = "inline-flex";
  els.downloadLink.textContent = `Download ${filename}`;

  // Revoke URL later to avoid memory leak
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

els.btnReload.addEventListener("click", () => load());

els.siteSearch.addEventListener("input", (e) => {
  const q = e.target.value || "";
  state.filteredSites = filterSites(q);
  renderSites(state.filteredSites);
});

els.btnGenerate.addEventListener("click", () => {
  try {
    clearWarnings();
    els.genOutput.textContent = "";

    const sid = (state.selectedSite?.[CONFIG.SITE_ID_COLUMN] || "").toString().trim();
    if (!sid) throw new Error("Select a site first.");

    const result = generateIMX({
      tables: state.tables,
      siteId: sid,
      options: { siteIdColumn: CONFIG.SITE_ID_COLUMN }
    });

    els.genOutput.textContent =
      `Generated IMX (placeholder)\n\n` +
      `Site_ID: ${sid}\n` +
      `Rack rows for site: ${result.stats.rackForSite}\n` +
      `IO rows for site: ${result.stats.ioForSite}\n\n` +
      `IMX Preview:\n----------------\n` +
      result.imxText;

    if (result.warnings?.length) showWarnings(result.warnings);

    const safeSid = sid.replace(/[^a-zA-Z0-9\-_.]/g, "_");
    const filename = `E104_${safeSid}.imx`;
    downloadTextFile(filename, result.imxText);
  } catch (err) {
    showWarnings([String(err?.message || err)]);
    els.genOutput.textContent = String(err?.stack || err);
  }
});

// Kick off initial load
load();
