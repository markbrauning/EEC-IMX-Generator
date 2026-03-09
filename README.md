# EEC IMX Generator

This repository contains both:

- the original Excel/VBA implementation (`EPlan E104 Generator.xlsm`, `ExcelVBA/`), and
- a static web application in `web/` that generates E104 `.imx` output directly in the browser.

The current active app is the web version.

## What the web app does

The browser app loads CSV tables from `web/srcdata/`, lets you select a site from `ITKSiteList.csv`, runs the IMX generator, and provides a downloadable `.imx` file.

Current UI behavior includes:

- Customer/Site dropdowns backed by `ITKSiteList.csv` (`Customer_Name` + `Name` -> `Site_ID`)
- IO card preview table based on rack layout data
- warning display per rack/slot (when generation emits warnings)
- generation output preview + download link
- reload controls for data tables
- dark/gray/light theme selector persisted in local storage

## Repository layout

- `web/` — static app (`index.html`, `styles.css`, JS modules under `web/src/`)
- `web/src/generator/` — DOM-free generator logic (`generateCardIMX` / `generateSiteIMX`) and helpers
- `web/srcdata/` — CSV source tables and `_manifest.csv`
- `tools/test_imx.js` — CLI script to generate and compare output to a golden `.imx` file if present
- `docs/` — architecture, reverse-engineering notes, and development workflow
- `ExcelVBA/` — extracted VBA modules from the workbook implementation

## Required site list columns

`web/srcdata/ITKSiteList.csv` must include:

- `Customer_Name`
- `Name`
- `Site_ID`

## Run locally

From `web/`:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Validate generation from the command line

From repository root:

```bash
node tools/test_imx.js
```

Optional explicit site ID:

```bash
node tools/test_imx.js <SITE_ID>
```

If a `.imx` file exists in the repo, the script compares generated output and fails on mismatch. If no golden file exists, it prints a warning and exits successfully.

## Core generator interface

`web/src/generator/imxGenerator.js` exports:

```js
generateCardIMX({ tables, siteId, options }) -> { imxText, warnings, stats }
generateSiteIMX({ tables, siteId, options }) -> { imxText, warnings, stats }
```

This module is intentionally independent from the DOM so it can be reused in a future backend service.
