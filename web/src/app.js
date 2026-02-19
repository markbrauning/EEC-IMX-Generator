import { CONFIG } from "./config.js";
import { loadAllTables } from "./data/loadTables.js";
import { generateIMX } from "./generator/imxGenerator.js";

const els = {
  btnReload: document.getElementById("btnReload"),
  loadStatus: document.getElementById("loadStatus"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  tablesSummary: document.getElementById("tablesSummary"),

  customerSelect: document.getElementById("customerSelect"),
  nameSelect: document.getElementById("nameSelect"),
  siteListMeta: document.getElementById("siteListMeta"),
  selectedSiteId: document.getElementById("selectedSiteId"),

  btnGenerate: document.getElementById("btnGenerate"),
  downloadLink: document.getElementById("downloadLink"),
  genOutput: document.getElementById("genOutput"),
  warnings: document.getElementById("warnings")
};

let state = {
  tables: null,
  sites: [],
  customers: [],
  namesByCustomer: new Map(),
  siteIdByCustomerName: new Map()
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
  return keys.map(k => {
    const t = tables[k];
    const n = t?.records?.length ?? 0;
    const c = t?.headers?.length ?? 0;
    return `${k}: ${n} rows, ${c} cols`;
  }).join("\n");
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

function enableGenerate(enabled) {
  els.btnGenerate.disabled = !enabled;
}

function resetSelectionUI() {
  els.customerSelect.innerHTML = `<option value="">—</option>`;
  els.nameSelect.innerHTML = `<option value="">—</option>`;
  els.customerSelect.disabled = true;
  els.nameSelect.disabled = true;
  els.selectedSiteId.textContent = "—";
  els.siteListMeta.textContent = "";
  enableGenerate(false);
}

function buildSiteIndexes() {
  const cols = CONFIG.SITE_LIST_COLUMNS;
  const custCol = cols.CUSTOMER;
  const nameCol = cols.NAME;
  const idCol = cols.SITE_ID;

  state.customers = [];
  state.namesByCustomer = new Map();
  state.siteIdByCustomerName = new Map();

  const seenCustomers = new Set();

  for (const r of state.sites) {
    const customer = (r[custCol] ?? "").toString().trim();
    const name = (r[nameCol] ?? "").toString().trim();
    const siteId = (r[idCol] ?? "").toString().trim();
    if (!customer || !name || !siteId) continue;

    if (!seenCustomers.has(customer)) {
      seenCustomers.add(customer);
      state.customers.push(customer);
      state.namesByCustomer.set(customer, []);
    }

    const names = state.namesByCustomer.get(customer);
    if (names && !names.includes(name)) names.push(name);

    const key = `${customer}||${name}`;
    if (!state.siteIdByCustomerName.has(key)) {
      // If duplicates exist, keep first encountered as requested
      state.siteIdByCustomerName.set(key, siteId);
    }
  }

  state.customers.sort((a, b) => a.localeCompare(b));
  for (const [cust, names] of state.namesByCustomer.entries()) {
    names.sort((a, b) => a.localeCompare(b));
  }
}

function populateCustomers() {
  els.customerSelect.innerHTML = `<option value="">—</option>`;
  for (const c of state.customers) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    els.customerSelect.appendChild(opt);
  }
  els.customerSelect.disabled = false;
}

function populateNames(customer) {
  els.nameSelect.innerHTML = `<option value="">—</option>`;
  const names = state.namesByCustomer.get(customer) || [];
  for (const n of names) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    els.nameSelect.appendChild(opt);
  }
  els.nameSelect.disabled = names.length === 0;

  // If for some reason more than one item left later, your rule applies at Site_ID resolution time.
  // Here, if only one name exists, we auto-select it for convenience.
  if (names.length === 1) {
    els.nameSelect.value = names[0];
    const sid = deriveSiteId(customer, names[0]);
    setSelectedSiteId(sid);
  }
}

function setSelectedSiteId(siteId) {
  els.selectedSiteId.textContent = siteId || "—";
  enableGenerate(Boolean(siteId));
}

function deriveSiteId(customer, name) {
  if (!customer || !name) return "";
  return state.siteIdByCustomerName.get(`${customer}||${name}`) || "";
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  els.downloadLink.href = url;
  els.downloadLink.download = filename;
  els.downloadLink.style.display = "inline-flex";
  els.downloadLink.textContent = `Download ${filename}`;

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function load() {
  setStatus("Loading…");
  setProgress(3, "Starting…");
  resetSelectionUI();
  els.downloadLink.style.display = "none";
  els.genOutput.textContent = "";
  clearWarnings();

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

    state.sites = tables[CONFIG.SITE_LIST_TABLE_NAME]?.records || [];

    // Validate required columns
    const cols = CONFIG.SITE_LIST_COLUMNS;
    const headers = tables[CONFIG.SITE_LIST_TABLE_NAME]?.headers || [];
    const missing = [cols.CUSTOMER, cols.NAME, cols.SITE_ID].filter(c => !headers.includes(c));
    if (missing.length) throw new Error(`ITKSiteList.csv is missing required column(s): ${missing.join(", ")}`);

    buildSiteIndexes();
    populateCustomers();
    els.siteListMeta.textContent = `Loaded ${state.sites.length} site rows. Select Customer_Name, then Name.`;
  } catch (err) {
    setStatus("Error");
    setProgress(0, "Failed");
    els.genOutput.textContent = String(err?.stack || err);
    showWarnings([String(err?.message || err)]);
  }
}

els.btnReload.addEventListener("click", () => load());

els.customerSelect.addEventListener("change", () => {
  const customer = els.customerSelect.value || "";
  els.nameSelect.value = "";
  setSelectedSiteId("");
  populateNames(customer);
});

els.nameSelect.addEventListener("change", () => {
  const customer = els.customerSelect.value || "";
  const name = els.nameSelect.value || "";
  const siteId = deriveSiteId(customer, name);

  // If duplicates ever exist, deriveSiteId returns the first one (as requested).
  setSelectedSiteId(siteId);
});

els.btnGenerate.addEventListener("click", () => {
  try {
    clearWarnings();
    els.genOutput.textContent = "";

    const sid = (els.selectedSiteId.textContent || "").toString().trim();
    if (!sid || sid === "—") throw new Error("Select Customer_Name and Name first.");

    const result = generateIMX({
      tables: state.tables,
      siteId: sid,
      options: { siteIdColumn: CONFIG.SITE_ID_COLUMN }
    });

    els.genOutput.textContent =
      `Generated IMX\n\n` +
      `Site_ID: ${sid}\n` +
      `Rack rows for site: ${result.stats.rackForSite}\n` +
      `IO rows for site: ${result.stats.ioForSite}\n\n` +
      `IMX Preview:\n----------------\n` +
      result.imxText;

    if (result.warnings?.length) showWarnings(result.warnings);

    const safeSid = sid.replace(/[^a-zA-Z0-9\-_.]/g, "_");
    downloadTextFile(`E104_${safeSid}.imx`, result.imxText);
  } catch (err) {
    showWarnings([String(err?.message || err)]);
    els.genOutput.textContent = String(err?.stack || err);
  }
});

load();
