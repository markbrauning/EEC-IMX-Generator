# IMX E104 Reverse Engineering (VBA → JS)

## Scope
Reverse-engineered from `IMXGenerator_E104` in VBA and helper modules under `ExcelVBA/`.

## Call graph
- `IMXGenerator_E104`
  - Table access / shaping:
    - `GetTableByName`
    - `SortListObjectAsc2IfNeeded`
    - `BuildColumnIndexMap`
    - `LoadTableToRowDicts`
    - `LoadTableToRowDicts_headerKey`
  - Typical parsing / text helpers:
    - `ParseCardTypical`
    - `DictGet`
    - `SplitOnFirstDelimiter`
    - `CleanAlphaNum`
    - `DateStringToMMDDYY`
    - `Pad2Digits`
  - Lookup initializers and readers:
    - `InitFuseSizeLookup`, `TryGetFuseSize`, `GetFuseSizeOrDefault`
    - `InitKeyLookup`, `GetKeyRowsByPartNumber`
    - `InitKeyingMainMacroLookup`, `TryGetEECMainMacroName`
    - `InitTermOptionsLookup`, `TryGetTerminalStyleDefinition`
    - `FindCardWiringMatches`
  - Terminal/interruption logic:
    - `TermDefDict`
      - `TryGetYCoord`
      - `TryGetTermSymbol`
      - `TryGetTermCatalog` (via term catalog helper)
    - `termDictRefactor`
    - `GetCardPowerIntrPs`
    - `GetCardPowerIntrP_Macros`
  - XML output:
    - `MakeMoNode`
    - `SaveXmlDocToFolder`

## Input tables and key columns
- Primary transactional
  - `ITKRackLayout`: `Panel`, `Logical_Rack_Cd`, `Slot_Cd`, `Rack_And_Slot`, `IO_Card_Type_Cd`, `Rack_Status`, `EPlan_Card_Typical`, `Card_Drawing_Number`, `Terminal_Block`, `Card_Drawing_Revision_ID`, `Revision_*`, `IO_Slot_ID`, `Site_ID`.
  - `ITKIOPoint`: keyed by `Address_Formula`, includes `Tag_Formula`, `EPLAN_Desc`, and `EPlan_Field_Terminal_*_(Left|Right)`.
- Lookup/reference
  - `tCardWiring`: by `Part Number` + `I/O Type Specific`; includes page/channel/rung/macro mapping and part metadata.
  - `tMacroList`: alias → realName map used to validate macro IDs.
  - `tFuseSizes`: by `Part Number` + `I/O Type Specific`.
  - `tKeyingPattern`: by `Part Number`; slot rows and macro names.
  - `tKeyingMainMacro`: by `Category`.
  - `tTermOptions`: by `I/O Type Specific` + `Terminal Style`.
  - `tTermCatalog`, `tYCoords`, `tTermSymbols`: used by terminal expansion.

## Processing rules (high level)
1. Load all required tables and initialize lookup dictionaries.
2. Sort rack layout by `Panel`, `Rack_And_Slot`.
3. Iterate rack rows and process only first occurrence of each `IO_Slot_ID` where `Rack_Status == READY`.
4. Parse `EPlan_Card_Typical` (`PN:=...;CW:=...;TS:=...`).
5. Match `tCardWiring` by (`PN`, `CW`) and derive card metadata (page count/type, densities, parts, IO format).
6. Build optional keying data and terminal definitions (`TS` + term options + catalogs).
7. Compute interruption-point macros from wiring+term dictionaries.
8. Emit nested XML `<mo>` nodes: Project → Panel → Rack → Card → Page → Channel → (PanelRung, EndDeviceRung, macros).
9. Save pretty-printed UTF-8 XML text to `.imx` file (VBA writes via Unicode text stream).

## Output structure
- XML declaration + nested `<mo>` nodes.
- Node attributes: `name`, `typeClass`, optional `save`.
- Child `<parameter name="..." type="String" value="..."/>` entries.
- Ordering is deterministic from sorted rack rows and loop ordering over pages/channels/rungs.

## JS port notes
- JS port keeps generator logic in `/web/src/generator/` and DOM-free.
- Function boundary preserved around parsing/lookups/schema/validation.
- Current implementation focuses on core card/page/channel structure and primary lookup behavior.

## Known gaps / assumptions
- A golden `.imx` file was not found in this repository snapshot, so exact byte-for-byte parity is not yet verifiable.
- VBA terminal/interruption expansion includes many macro permutations; current JS implementation emits core structure and principal parameters, with warnings for skipped details.
- If golden file is added later, run `/tools/test_imx.js` and iterate remaining mismatches (especially macro detail nodes and parameter naming nuances).
