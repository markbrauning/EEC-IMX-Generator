# EEC IMX Generator (Web UI) — Phase 0 (in-browser generator)

This folder contains a **static web UI** that:
1) Loads CSV tables from `web/srcdata/` at startup (Option A)
2) Displays a **Site list** (like the Excel `SiteList` sheet)
3) Lets the user select **one Site_ID**
4) Runs the IMX generator **in the browser** and downloads an `.imx` file

> The IMX generator logic is intentionally isolated in `web/src/generator/` so you can later migrate it to a backend service.

---

## 1) Put your CSVs in the right place

Copy the exported tables into:

```
web/srcdata/
  _manifest.csv
  ITKRackLayout.csv
  ITKIOPoint.csv
  tCardWiring.csv
  ...
```

### About `ITKSiteList.csv`
The UI expects a site list table named `ITKSiteList.csv` (table name: `ITKSiteList`) with a `Site_ID` column.

- If `ITKSiteList.csv` is missing, the UI will **fall back** to a derived list of unique `Site_ID` values found in `ITKRackLayout.csv`.

You can change these names in `web/src/config.js`.

---

## 2) Run locally

Browsers block `fetch()` from `file://` URLs, so use a local server.

### Option A: Python
From the `web/` folder:

```bash
python -m http.server 8000
```

Then open:
http://localhost:8000

### Option B: VS Code Live Server
Open `web/index.html` and click "Go Live".

---

## 3) Where to implement the real IMX output

Replace the placeholder generator in:

- `web/src/generator/imxGenerator.js`

The only required interface is:

```js
generateIMX({ tables, siteId, options }) -> { imxText, warnings, stats }
```

Where `tables` is a map like:

```js
tables["ITKRackLayout"].records // array of row objects
tables["tCardWiring"].records   // etc.
```

---

## 4) Deploy (optional)

If you host this with GitHub Pages, ensure `srcdata/` is included in the published site output.
