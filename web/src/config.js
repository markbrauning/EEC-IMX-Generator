export const CONFIG = {
  // Folder (relative to index.html) where CSVs live:
  SRC_DATA_BASE_PATH: "./srcdata",

  // Preferred site list table exported from Excel / InterTrak:
  // If missing, the UI will fall back to a derived list from ITKRackLayout.
  SITE_LIST_TABLE_NAME: "ITKSiteList",

  // Column name to read from the site list (and used to filter RackLayout/IOPoint)
  SITE_ID_COLUMN: "Site_ID",

  // Safety: avoid rendering huge site lists. (Does not affect generation.)
  MAX_RENDER_ROWS: 500
};
