/**
 * Renders a read-only table with a global search and row selection.
 *
 * Params:
 *  - hostEl: container element
 *  - records: array<object>
 *  - options:
 *      - maxRenderRows
 *      - onSelect(record)
 *      - selectedKey / selectedValue (optional)
 */
export function renderSiteList(hostEl, records, options = {}) {
  const maxRenderRows = options.maxRenderRows ?? 500;
  const onSelect = typeof options.onSelect === "function" ? options.onSelect : () => {};

  hostEl.innerHTML = "";
  hostEl.classList.remove("subtle");

  const all = Array.isArray(records) ? records : [];
  const columns = inferColumns(all);

  const table = document.createElement("table");
  table.className = "table";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const render = (filtered) => {
    tbody.innerHTML = "";
    const toShow = filtered.slice(0, maxRenderRows);

    const frag = document.createDocumentFragment();
    for (const rec of toShow) {
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.addEventListener("click", () => {
        // clear old selection
        tbody.querySelectorAll("tr.selected").forEach(x => x.classList.remove("selected"));
        tr.classList.add("selected");
        onSelect(rec);
      });

      for (const col of columns) {
        const td = document.createElement("td");
        td.textContent = (rec[col] ?? "").toString();
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);

    return { shown: toShow.length, total: filtered.length };
  };

  hostEl.appendChild(table);

  return { render, columns };
}

function inferColumns(records) {
  const set = new Set();
  for (const r of records.slice(0, 200)) {
    Object.keys(r || {}).forEach(k => set.add(k));
  }
  // Prefer common fields first if present
  const preferred = ["Site_ID", "Site_Name", "Site", "Project", "Description", "Customer", "Panel", "Revision_ID"];
  const cols = [];
  for (const p of preferred) if (set.has(p)) cols.push(p);
  for (const k of Array.from(set)) if (!cols.includes(k)) cols.push(k);
  return cols;
}
