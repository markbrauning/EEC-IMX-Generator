# Development Workflow

## Prerequisites

- Python 3 (for a simple local static server), or any equivalent static file server.
- Node.js (for `tools/test_imx.js`).

## Run locally

From `web/`:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Basic manual verification

1. Confirm loading completes and table summary appears.
2. Select a `Customer_Name` and `Name`.
3. Verify `Selected Site_ID` updates.
4. Click **Generate IMX** and confirm:
   - Output preview is populated.
   - Download link appears.
   - Warning messages (if any) are visible.

## Programmatic validation

Run from repository root:

```bash
node tools/test_imx.js
```

Behavior:

- Always generates output for a default site (`EPLANTRAINING`, unless provided as arg).
- If a golden `.imx` file exists anywhere in the repo, compares generated output and exits non-zero on mismatch.
- If no golden file exists, prints a warning and exits zero.

With explicit site ID:

```bash
node tools/test_imx.js <SITE_ID>
```

## Adding/changing source tables

- Place CSV files in `web/srcdata`.
- Keep `_manifest.csv` aligned with required loading behavior.
- If adding a new required table for generation, update:
  - `web/src/generator/imxSchema.js`
  - `web/src/generator/validators.js` (if needed)
  - Any corresponding lookup logic in `web/src/generator/lookups.js`

## Debugging tips

- Use browser devtools console for load/generation exceptions shown in UI.
- Inspect table headers for exact key names (CSV header mismatches are a common failure mode).
- For parity work, pair this repo's generator output with `docs/IMX_E104_reverse_engineering.md` and VBA modules in `ExcelVBA/`.
