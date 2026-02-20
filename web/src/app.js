import { CONFIG } from "./config.js";
import { loadAllTables } from "./data/loadTables.js";
import { generateIMX } from "./generator/imxGenerator.js";
import { createSiteIndexes, deriveSiteId } from "./site/siteIndex.js";
import {
  clearWarnings,
  downloadTextFile,
  getAppElements,
  populateCustomers,
  populateNames,
  resetSelectionUi,
  setProgress,
  setSelectedSiteId,
  setStatus,
  showWarnings,
  summarizeTables
} from "./ui/appView.js";

const els = getAppElements();

let state = {
  tables: null,
  sites: [],
  customers: [],
  namesByCustomer: new Map(),
  siteIdByCustomerName: new Map()
};

function getSelectedCustomer() {
  return els.customerSelect.value || "";
}

function getSelectedName() {
  return els.nameSelect.value || "";
}

function getSelectedSiteId() {
  return (els.selectedSiteId.textContent || "").toString().trim();
}

function resolveCurrentSiteId() {
  return deriveSiteId(state.siteIdByCustomerName, getSelectedCustomer(), getSelectedName());
}

function updateSiteIndexes(sites) {
  const indexes = createSiteIndexes(sites, CONFIG.SITE_LIST_COLUMNS);
  state.customers = indexes.customers;
  state.namesByCustomer = indexes.namesByCustomer;
  state.siteIdByCustomerName = indexes.siteIdByCustomerName;
}

function onCustomerChanged() {
  const customer = getSelectedCustomer();
  const names = state.namesByCustomer.get(customer) || [];

  els.nameSelect.value = "";
  setSelectedSiteId(els, "");
  populateNames(els, names);

  if (names.length === 1) {
    els.nameSelect.value = names[0];
    setSelectedSiteId(els, resolveCurrentSiteId());
  }
}

function onNameChanged() {
  setSelectedSiteId(els, resolveCurrentSiteId());
}

function reportLoadError(error) {
  setStatus(els, "Error");
  setProgress(els, 0, "Failed");
  els.genOutput.textContent = String(error?.stack || error);
  showWarnings(els, [String(error?.message || error)]);
}

function validateSiteListColumns(tables) {
  const cols = CONFIG.SITE_LIST_COLUMNS;
  const headers = tables[CONFIG.SITE_LIST_TABLE_NAME]?.headers || [];
  const missing = [cols.CUSTOMER, cols.NAME, cols.SITE_ID].filter((column) => !headers.includes(column));

  if (missing.length) {
    throw new Error(`ITKSiteList.csv is missing required column(s): ${missing.join(", ")}`);
  }
}

async function load() {
  setStatus(els, "Loading…");
  setProgress(els, 3, "Starting…");
  resetSelectionUi(els);
  els.downloadLink.style.display = "none";
  els.genOutput.textContent = "";
  clearWarnings(els);

  try {
    const tables = await loadAllTables({
      basePath: CONFIG.SRC_DATA_BASE_PATH,
      onProgress: (progress) => {
        if (progress.phase === "tables") {
          const percentage = Math.round((progress.loaded / Math.max(1, progress.total)) * 100);
          setProgress(els, percentage, progress.message || "");
          setStatus(els, `Loading tables (${progress.loaded}/${progress.total})…`);
        } else if (progress.phase === "manifest") {
          setProgress(els, 5, progress.message || "");
        } else if (progress.phase === "done") {
          setProgress(els, 100, progress.message || "");
        }
      }
    });

    state.tables = tables;
    state.sites = tables[CONFIG.SITE_LIST_TABLE_NAME]?.records || [];

    validateSiteListColumns(tables);
    updateSiteIndexes(state.sites);

    els.tablesSummary.textContent = summarizeTables(tables);
    populateCustomers(els, state.customers);
    els.siteListMeta.textContent =
      `Loaded ${state.sites.length} site rows. Select Customer_Name, then Name.`;
    setStatus(els, "Loaded");
  } catch (error) {
    reportLoadError(error);
  }
}

function generateOutput() {
  try {
    clearWarnings(els);
    els.genOutput.textContent = "";

    const siteId = getSelectedSiteId();
    if (!siteId || siteId === "—") {
      throw new Error("Select Customer_Name and Name first.");
    }

    const result = generateIMX({
      tables: state.tables,
      siteId,
      options: { siteIdColumn: CONFIG.SITE_ID_COLUMN }
    });

    els.genOutput.textContent =
      `Generated IMX\n\n` +
      `Site_ID: ${siteId}\n` +
      `Rack rows for site: ${result.stats.rackForSite}\n` +
      `IO rows for site: ${result.stats.ioForSite}\n\n` +
      `IMX Preview:\n----------------\n` +
      result.imxText;

    if (result.warnings?.length) showWarnings(els, result.warnings);

    const safeSiteId = siteId.replace(/[^a-zA-Z0-9\-_.]/g, "_");
    downloadTextFile(els, `E104_${safeSiteId}.imx`, result.imxText);
  } catch (error) {
    showWarnings(els, [String(error?.message || error)]);
    els.genOutput.textContent = String(error?.stack || error);
  }
}

els.btnReload.addEventListener("click", load);
els.customerSelect.addEventListener("change", onCustomerChanged);
els.nameSelect.addEventListener("change", onNameChanged);
els.btnGenerate.addEventListener("click", generateOutput);

load();
