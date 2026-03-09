# Architecture

## Overview

The repository implements a static, browser-hosted IMX generator:

1. CSV tables are loaded from `web/srcdata`.
2. Site selection is resolved from `ITKSiteList` (`Customer_Name` + `Name` -> `Site_ID`).
3. Generator logic transforms tables into `.imx` XML text.
4. The UI displays preview text and exposes a download link.

The core generator is intentionally DOM-free so it can be reused in a backend service later.

## Module layout

- `web/src/app.js`
  - Application orchestration (load tables, wire UI events, call generator).
- `web/src/data/`
  - CSV parsing and table loading (`csv.js`, `loadTables.js`).
- `web/src/site/`
  - Site indexing and selected `Site_ID` derivation (`siteIndex.js`).
- `web/src/generator/`
  - IMX generation and support functions:
    - `imxGenerator.js` (card-level + site-level generation entry points)
    - `lookups.js` (lookup maps over reference tables)
    - `formatting.js` (string/date/utility helpers)
    - `imxSchema.js` (required-table definitions)
    - `validators.js` (table/generator validation helpers)
- `web/src/ui/`
  - DOM access and view updates (`appView.js`, `siteListView.js`).
- `tools/test_imx.js`
  - CLI validation script: generates output and compares with first discovered golden `.imx` (if present).

## Startup and runtime flow

At startup:

- `load()` in `app.js` resets UI state.
- `loadAllTables()` reads `_manifest.csv` and then loads table CSV files.
- `ITKSiteList` column presence is validated (`Customer_Name`, `Name`, `Site_ID`).
- Site indexes are built and customer dropdown values are populated.

When generating output:

- Selected site is resolved from the two dropdowns.
- `generateSiteIMX({ tables, siteId, options })` is called for full-site output.
- `generateCardIMX({ tables, siteId, options })` is available when only Card-and-below XML is needed.
- Returned `imxText`, warnings, and stats are rendered in the UI.
- A sanitized filename (`E104_<Site_ID>.imx`) is offered for download.

## Data and contract boundaries

Generator contract:

```js
generateCardIMX({ tables, siteId, options }) -> {
  imxText: string,
  warnings: string[],
  stats: Record<string, number>
}

generateSiteIMX({ tables, siteId, options }) -> {
  imxText: string,
  warnings: string[],
  stats: Record<string, number>
}
```

Key constraints:

- Table names are inferred from CSV file names in `web/srcdata`.
- Generator assumes `tables[tableName].records` with header-based object keys.
- `options.siteIdColumn` defaults behavior for filtering by site.

## Design goals

- **Deterministic generation** from sorted/filtered table inputs.
- **Separation of concerns** between UI and generation logic.
- **Incremental VBA parity** with warnings where behavior is incomplete.
- **Low-friction deployment** as a static website.
