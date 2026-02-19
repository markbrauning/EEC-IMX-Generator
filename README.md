# EEC IMX Generator (Web UI) — Phase 0 (in-browser generator)

This repository folder contains a **static web UI** that:

1) Loads CSV tables from `web/srcdata/` at startup (Option A)
2) Presents **two dropdowns** from `ITKSiteList.csv`:
   - `Customer_Name` → filters → `Name`
3) Resolves that selection to a single `Site_ID`
4) Runs the IMX generator **in the browser** and downloads an `.imx` file

> The IMX generator logic is isolated in `web/src/generator/` so you can later migrate it to a backend service.

---

## Required `ITKSiteList.csv`

Place `ITKSiteList.csv` in `web/srcdata/` with headers:

- `Customer_Name`
- `Name`
- `Site_ID`

Example:

```
Customer_Name,Name,Site_ID
SANDBOX,"SIOUX CENTER, IA",D0D42789-6062-4C76-B678-0159E1996DF4
```

The UI uses:
- Dropdown 1: unique `Customer_Name`
- Dropdown 2: unique `Name` values for the selected customer
- Result: the **first** `Site_ID` found for that `(Customer_Name, Name)` pair (duplicates shouldn’t happen)

---

## Run locally

From the `web/` folder:

```bash
python -m http.server 8000
```

Open: http://localhost:8000

---

## Implement real IMX generation

Edit:

- `web/src/generator/imxGenerator.js`

Interface:

```js
generateIMX({ tables, siteId, options }) -> { imxText, warnings, stats }
```
