import { CONFIG } from "./config.js";
import { loadAllTables } from "./data/loadTables.js";
import { generateIMX } from "./generator/imxGenerator.js";
import { createSiteIndexes, deriveSiteId } from "./site/siteIndex.js";
import {
  downloadTextFile,
  getAppElements,
  populateCustomers,
  populateFavorites,
  populateNames,
  resetSelectionUi,
  setProgress,
  setCardPreview,
  setStatus,
  summarizeTables
} from "./ui/appView.js";

const els = getAppElements();

let state = {
  tables: null,
  sites: [],
  customers: [],
  namesByCustomer: new Map(),
  siteIdByCustomerName: new Map(),
  favorites: []
};

const THEME_KEY = "imx-ui-theme";
const FAVORITES_KEY = "imx-favorite-sites";
const LAST_SELECTION_KEY = "imx-last-selection";


function applyTheme(theme) {
  const allowedThemes = new Set(["dark", "gray", "light"]);
  const nextTheme = allowedThemes.has(theme) ? theme : "dark";
  document.documentElement.dataset.theme = nextTheme;
  if (els.themeSelect) els.themeSelect.value = nextTheme;
  try {
    localStorage.setItem(THEME_KEY, nextTheme);
  } catch {
    // Ignore storage errors (private mode, etc.)
  }
}

function initializeTheme() {
  let savedTheme = "dark";
  try {
    savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  } catch {
    savedTheme = "dark";
  }
  applyTheme(savedTheme);
}

function onThemeChanged() {
  applyTheme(els.themeSelect?.value || "dark");
}

function buildFavoriteKey(customer, name) {
  return `${customer}|||${name}`;
}

function readStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorageJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors (private mode, etc.)
  }
}

function loadFavoritesFromStorage() {
  const data = readStorageJson(FAVORITES_KEY, []);
  if (!Array.isArray(data)) return [];

  const seen = new Set();
  const favorites = [];
  for (const item of data) {
    const customer = String(item?.customer || "").trim();
    const name = String(item?.name || "").trim();
    if (!customer || !name) continue;
    const key = buildFavoriteKey(customer, name);
    if (seen.has(key)) continue;
    seen.add(key);
    favorites.push({ key, customer, name });
  }
  return favorites;
}

function persistFavorites() {
  writeStorageJson(
    FAVORITES_KEY,
    state.favorites.map((favorite) => ({ customer: favorite.customer, name: favorite.name }))
  );
}

function updateFavoritesUi() {
  populateFavorites(els, state.favorites);

  const currentKey = buildFavoriteKey(getSelectedCustomer(), getSelectedName());
  const selectedFavorite = state.favorites.find((favorite) => favorite.key === currentKey);
  els.favoritesSelect.value = selectedFavorite ? selectedFavorite.key : "";

  const hasSelection = Boolean(getSelectedCustomer() && getSelectedName());
  const selectionExists = hasSelection && Boolean(resolveCurrentSiteId());
  const alreadyFavorite = Boolean(selectedFavorite);

  els.btnAddFavorite.disabled = !selectionExists || alreadyFavorite;
  els.btnRemoveFavorite.disabled = !alreadyFavorite;
}

function saveLastSelection() {
  const customer = getSelectedCustomer();
  const name = getSelectedName();
  if (!customer || !name) return;
  writeStorageJson(LAST_SELECTION_KEY, { customer, name });
}

function tryRestoreLastSelection() {
  const saved = readStorageJson(LAST_SELECTION_KEY, null);
  const customer = String(saved?.customer || "").trim();
  const name = String(saved?.name || "").trim();
  if (!customer || !name) return false;

  const names = state.namesByCustomer.get(customer) || [];
  if (!names.includes(name)) return false;

  els.customerSelect.value = customer;
  populateNames(els, names);
  els.nameSelect.value = name;
  return true;
}

function onAddFavorite() {
  const customer = getSelectedCustomer();
  const name = getSelectedName();
  const siteId = resolveCurrentSiteId();
  if (!customer || !name || !siteId) return;

  const key = buildFavoriteKey(customer, name);
  if (state.favorites.some((favorite) => favorite.key === key)) {
    updateFavoritesUi();
    return;
  }

  state.favorites.push({ key, customer, name });
  state.favorites.sort((a, b) => a.customer.localeCompare(b.customer) || a.name.localeCompare(b.name));
  persistFavorites();
  updateFavoritesUi();
}

function onRemoveFavorite() {
  const customer = getSelectedCustomer();
  const name = getSelectedName();
  const key = buildFavoriteKey(customer, name);
  const favorite = state.favorites.find((item) => item.key === key);
  if (!favorite) {
    updateFavoritesUi();
    return;
  }

  const confirmed = window.confirm(`Remove favorite for ${favorite.customer} — ${favorite.name}?`);
  if (!confirmed) return;

  state.favorites = state.favorites.filter((item) => item.key !== key);
  persistFavorites();
  updateFavoritesUi();
}

function onFavoriteChanged() {
  const selectedKey = String(els.favoritesSelect.value || "");
  if (!selectedKey) return;
  const favorite = state.favorites.find((item) => item.key === selectedKey);
  if (!favorite) return;

  const names = state.namesByCustomer.get(favorite.customer) || [];
  if (!names.includes(favorite.name)) return;

  els.customerSelect.value = favorite.customer;
  populateNames(els, names);
  els.nameSelect.value = favorite.name;
  refreshCardPreview();
}

function getSelectedCustomer() {
  return els.customerSelect.value || "";
}

function getSelectedName() {
  return els.nameSelect.value || "";
}

function resolveCurrentSiteId() {
  return deriveSiteId(state.siteIdByCustomerName, getSelectedCustomer(), getSelectedName());
}

function cleanAlphaNum(text) {
  return String(text || "").replace(/[^A-Za-z0-9]/g, "");
}

function buildImxFilename(selectedSiteName) {
  const siteNameToken = cleanAlphaNum(String(selectedSiteName || "").trim()).slice(0, 20);
  return `E104_${siteNameToken}.imx`;
}

function updateSiteIndexes(sites) {
  const indexes = createSiteIndexes(sites, CONFIG.SITE_LIST_COLUMNS);
  state.customers = indexes.customers;
  state.namesByCustomer = indexes.namesByCustomer;
  state.siteIdByCustomerName = indexes.siteIdByCustomerName;
}


function getCardsForSite(siteId, warningsByRackSlot = new Map()) {
  const sid = String(siteId || "").trim();
  if (!sid) return [];

  const rackRows = state.tables?.ITKRackLayout?.records || [];
  const seenSlots = new Set();
  const cards = [];

  for (const row of rackRows) {
    if (String(row[CONFIG.SITE_ID_COLUMN] ?? "").trim() !== sid) continue;
    if (String(row.Rack_Status || "").toUpperCase() !== "READY") continue;

    const slotId = String(row.IO_Slot_ID || "").trim();
    if (!slotId || seenSlots.has(slotId)) continue;
    seenSlots.add(slotId);

    const rackSlot = String(row.Rack_And_Slot || "").trim() || "Unknown Rack/Slot";
    const model = String(row.IO_Card_Type_Cd || "").trim() || "Unknown Model";
    const drawing = String(row.Card_Drawing_Number || "").trim();
    const eplanCardTypical = String(row.EPlan_Card_Typical || "").trim();
    cards.push({
      rackSlot,
      model,
      drawing,
      eplanCardTypical,
      warnings: warningsByRackSlot.get(rackSlot) || []
    });
  }

  return cards.sort((a, b) => a.rackSlot.localeCompare(b.rackSlot, undefined, { numeric: true, sensitivity: "base" }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setRefreshLoading(isLoading) {
  els.btnRefresh.classList.toggle("is-loading", isLoading);
  els.btnRefresh.setAttribute("aria-busy", isLoading ? "true" : "false");
}

function refreshCardPreviewNow() {
  const siteId = resolveCurrentSiteId();
  if (!siteId) {
    setCardPreview(els, [], "");
    return;
  }

  const generationResult = generateOutput({ silent: false });
  const warningsByRackSlot = mapWarningsByRackSlot(generationResult?.warnings || []);
  setCardPreview(els, getCardsForSite(siteId, warningsByRackSlot), siteId);
}

async function refreshCardPreview() {
  const siteId = resolveCurrentSiteId();
  els.btnRefresh.disabled = !siteId;
  if (siteId) saveLastSelection();

  if (!siteId) {
    refreshCardPreviewNow();
    return;
  }

  setRefreshLoading(true);
  els.btnRefresh.disabled = true;
  try {
    await Promise.all([sleep(100), Promise.resolve().then(() => refreshCardPreviewNow())]);
  } finally {
    setRefreshLoading(false);
    els.btnRefresh.disabled = !resolveCurrentSiteId();
  }
}

function onCustomerChanged() {
  const customer = getSelectedCustomer();
  const names = state.namesByCustomer.get(customer) || [];

  els.nameSelect.value = "";
  populateNames(els, names);
  refreshCardPreview();

  if (names.length === 1) {
    els.nameSelect.value = names[0];
    refreshCardPreview();
  }

  updateFavoritesUi();
}

function onNameChanged() {
  refreshCardPreview();
  updateFavoritesUi();
}

function reportLoadError(error) {
  setStatus(els, "Error");
  setProgress(els, 0, "Failed");
  els.genOutput.textContent = String(error?.stack || error);
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
    state.favorites = loadFavoritesFromStorage().filter((favorite) => {
      const names = state.namesByCustomer.get(favorite.customer) || [];
      return names.includes(favorite.name);
    });
    persistFavorites();

    const restoredSelection = tryRestoreLastSelection();
    if (!restoredSelection) {
      populateNames(els, []);
    }

    els.siteListMeta.textContent = "";
    setStatus(els, "Loaded");
    refreshCardPreview();
    updateFavoritesUi();
  } catch (error) {
    reportLoadError(error);
    els.downloadLink.style.display = "none";
  }
}

function generateOutput({ silent = false } = {}) {
  try {
    if (!silent) {
      els.genOutput.textContent = "";
    }

    const siteId = resolveCurrentSiteId();
    if (!siteId) {
      throw new Error("Select Customer_Name and Name first.");
    }

    const result = generateIMX({
      tables: state.tables,
      siteId,
      options: { siteIdColumn: CONFIG.SITE_ID_COLUMN }
    });

    if (!silent) {
      els.genOutput.textContent =
        `Generated IMX\n\n` +
        `Rack rows for site: ${result.stats.rackForSite}\n` +
        `IO rows for site: ${result.stats.ioForSite}\n\n` +
        `IMX Preview:\n----------------\n` +
        result.imxText;
    }

    downloadTextFile(els, buildImxFilename(getSelectedName()), result.imxText);
    return result;
  } catch (error) {
    if (!silent) {
      els.genOutput.textContent = String(error?.stack || error);
    }
    return null;
  }
}

function mapWarningsByRackSlot(warnings) {
  const byRackSlot = new Map();
  for (const warning of warnings || []) {
    const text = String(warning || "");
    const delim = text.lastIndexOf(": ");
    if (delim <= 0) continue;
    const rackSlot = text.slice(0, delim).trim();
    const message = text.slice(delim + 2).trim();
    if (!rackSlot || !message) continue;
    const current = byRackSlot.get(rackSlot) || [];
    current.push(message);
    byRackSlot.set(rackSlot, current);
  }
  return byRackSlot;
}

els.btnReload.addEventListener("click", load);
els.themeSelect?.addEventListener("change", onThemeChanged);
els.customerSelect.addEventListener("change", onCustomerChanged);
els.nameSelect.addEventListener("change", onNameChanged);
els.favoritesSelect.addEventListener("change", onFavoriteChanged);
els.btnAddFavorite.addEventListener("click", onAddFavorite);
els.btnRemoveFavorite.addEventListener("click", onRemoveFavorite);
els.btnRefresh.addEventListener("click", refreshCardPreview);

initializeTheme();
load();
