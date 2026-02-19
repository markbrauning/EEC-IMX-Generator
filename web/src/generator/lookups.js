function k(...parts) {
  return parts.map(p => String(p ?? "").trim().toUpperCase()).join("|");
}

export function buildLookups(tables) {
  const macroByAlias = new Map((tables.tMacroList?.records || []).map(r => [String(r.alias || "").trim(), r]));
  const ioByAddress = new Map((tables.ITKIOPoint?.records || []).map(r => [String(r.Address_Formula || "").trim(), r]));

  const wiringByPartCW = new Map();
  for (const row of tables.tCardWiring?.records || []) {
    const key = k(row["Part Number"], row["I/O Type Specific"]);
    if (!wiringByPartCW.has(key)) wiringByPartCW.set(key, []);
    wiringByPartCW.get(key).push(row);
  }

  const fuseByPartCW = new Map((tables.tFuseSizes?.records || []).map(r => [k(r["Part Number"], r["I/O Type Specific"]), r["Fuse Size"] || ""]));

  const keyingByPart = new Map();
  for (const row of tables.tKeyingPattern?.records || []) {
    const key = k(row["Part Number"]);
    if (!keyingByPart.has(key)) keyingByPart.set(key, []);
    keyingByPart.get(key).push(row);
  }

  const keyingMainByCategory = new Map((tables.tKeyingMainMacro?.records || []).map(r => [k(r.Category), r["EEC Main Macro Name"] || ""]));
  const termStyleByIOAndTS = new Map((tables.tTermOptions?.records || []).map(r => [k(r["I/O Type Specific"], r["Terminal Style"]), r["Terminal Style Definition"] || ""]));

  return { macroByAlias, ioByAddress, wiringByPartCW, fuseByPartCW, keyingByPart, keyingMainByCategory, termStyleByIOAndTS };
}

export function findCardWiringMatches(lookups, pn, cw) {
  return lookups.wiringByPartCW.get(k(pn, cw)) || [];
}

export function getTermStyleDefinition(lookups, ioTypeSpecific, ts) {
  return lookups.termStyleByIOAndTS.get(k(ioTypeSpecific, ts)) || "";
}

export function getFuseSize(lookups, pn, cw) {
  return lookups.fuseByPartCW.get(k(pn, cw)) || "";
}

export function getKeyRowsByPartNumber(lookups, pn) {
  return lookups.keyingByPart.get(k(pn)) || [];
}

export function getKeyingMainMacro(lookups, category) {
  return lookups.keyingMainByCategory.get(k(category)) || "";
}
