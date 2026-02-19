export const CONFIG = {
  // Folder (relative to index.html) where CSVs live:
  SRC_DATA_BASE_PATH: "./srcdata",

  // Site list table (required)
  SITE_LIST_TABLE_NAME: "ITKSiteList",

  // Required columns in ITKSiteList.csv
  SITE_LIST_COLUMNS: {
    CUSTOMER: "Customer_Name",
    NAME: "Name",
    SITE_ID: "Site_ID"
  },

  // Column name used to filter ITKRackLayout/ITKIOPoint
  SITE_ID_COLUMN: "Site_ID"
};
