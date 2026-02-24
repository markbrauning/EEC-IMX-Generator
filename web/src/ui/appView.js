export function getAppElements() {
  return {
    btnReload: document.getElementById("btnReload"),
    loadStatus: document.getElementById("loadStatus"),
    progressBar: document.getElementById("progressBar"),
    progressText: document.getElementById("progressText"),
    tablesSummary: document.getElementById("tablesSummary"),
    customerSelect: document.getElementById("customerSelect"),
    nameSelect: document.getElementById("nameSelect"),
    siteListMeta: document.getElementById("siteListMeta"),
    favoritesSelect: document.getElementById("favoritesSelect"),
    btnAddFavorite: document.getElementById("btnAddFavorite"),
    btnRemoveFavorite: document.getElementById("btnRemoveFavorite"),
    themeSelect: document.getElementById("themeSelect"),
    btnRefresh: document.getElementById("btnRefresh"),
    cardPreviewMeta: document.getElementById("cardPreviewMeta"),
    cardPreview: document.getElementById("cardPreview"),
    downloadLink: document.getElementById("downloadLink"),
    genOutput: document.getElementById("genOutput"),
    slotImxModal: document.getElementById("slotImxModal"),
    slotImxTitle: document.getElementById("slotImxTitle"),
    slotImxContent: document.getElementById("slotImxContent"),
    slotImxClose: document.getElementById("slotImxClose")
  };
}

export function setStatus(els, text) {
  els.loadStatus.textContent = text;
}

export function setProgress(els, percentage, text = "") {
  els.progressBar.style.width = `${percentage}%`;
  els.progressText.textContent = text;
}

export function summarizeTables(tables) {
  const keys = Object.keys(tables || {}).sort();
  return keys
    .map((key) => {
      const table = tables[key];
      const rowCount = table?.records?.length ?? 0;
      const colCount = table?.headers?.length ?? 0;
      return `${key}: ${rowCount} rows, ${colCount} cols`;
    })
    .join("\n");
}


export function resetSelectionUi(els) {
  els.customerSelect.innerHTML = `<option value="">—</option>`;
  els.nameSelect.innerHTML = `<option value="">—</option>`;
  els.customerSelect.disabled = true;
  els.nameSelect.disabled = true;
  els.siteListMeta.textContent = "";
  els.favoritesSelect.innerHTML = `<option value="">—</option>`;
  els.favoritesSelect.disabled = true;
  els.btnAddFavorite.disabled = true;
  els.btnRemoveFavorite.disabled = true;
  els.btnRefresh.disabled = true;
  setCardPreview(els, [], "");
}

export function populateCustomers(els, customers) {
  els.customerSelect.innerHTML = `<option value="">—</option>`;
  for (const customer of customers) {
    const option = document.createElement("option");
    option.value = customer;
    option.textContent = customer;
    els.customerSelect.appendChild(option);
  }
  els.customerSelect.disabled = false;
}

export function populateNames(els, names) {
  els.nameSelect.innerHTML = `<option value="">—</option>`;
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    els.nameSelect.appendChild(option);
  }
  els.nameSelect.disabled = names.length === 0;
}


export function populateFavorites(els, favorites) {
  els.favoritesSelect.innerHTML = `<option value="">—</option>`;
  for (const favorite of favorites || []) {
    const option = document.createElement("option");
    option.value = favorite.key;
    option.textContent = `${favorite.customer} — ${favorite.name}`;
    els.favoritesSelect.appendChild(option);
  }
  els.favoritesSelect.disabled = (favorites || []).length === 0;
}

export function setCardPreview(els, cards, siteId = "") {
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length || !siteId) {
    els.cardPreviewMeta.textContent = "Select a site to preview included IO cards.";
    els.cardPreview.innerHTML = "<tr><td colspan=\"9\">—</td></tr>";
    return;
  }

  els.cardPreviewMeta.textContent = `${list.length} unique IO cards for selected site.`;
  els.cardPreview.innerHTML = list
    .map((card, index) => {
      const warnings = (card.warnings || []).map((warning) => `<div>${escapeHtml(warning)}</div>`).join("");
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(card.rackSlot || "Unknown Rack/Slot")}</td>
        <td>${escapeHtml(card.model || "Unknown Model")}</td>
        <td>${escapeHtml(card.drawing || "")}</td>
        <td>${escapeHtml(card.eplanCardTypical || "")}</td>
        <td>${warnings || ""}</td>
        <td></td>
        <td>${escapeHtml(card.lastGeneratedAt || "")}</td>
        <td><button class="btn" data-action="view-slot-imx" data-slot-key="${escapeHtml(card.slotKey || "")}" data-rack-slot="${escapeHtml(card.rackSlot || "")}" type="button">View IMX String</button></td>
      </tr>`;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function downloadTextFile(els, filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  els.downloadLink.href = url;
  els.downloadLink.download = filename;
  els.downloadLink.style.display = "inline-flex";
  els.downloadLink.textContent = `Download ${filename}`;

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function showSlotImxModal(els, title, content) {
  if (!els.slotImxModal) return;
  els.slotImxTitle.textContent = title;
  els.slotImxContent.textContent = content;
  els.slotImxModal.showModal();
}

export function closeSlotImxModal(els) {
  if (!els.slotImxModal?.open) return;
  els.slotImxModal.close();
}
