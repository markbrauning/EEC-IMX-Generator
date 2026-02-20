import { makeMoNode, append, serializeDocument } from "./imxSchema.js";
import {
  buildLookups,
  findCardWiringMatches,
  getFuseSize,
  getKeyRowsByPartNumber,
  getKeyingMainMacro,
  getTermStyleDefinition
} from "./lookups.js";
import { cleanAlphaNum, compareMixed, dateStringToMMDDYY, pad2Digits, splitOnFirstDelimiter } from "./formatting.js";
import { requireTables } from "./validators.js";

// VBA origin: HelperEplanCardTypicalParser.ParseCardTypical
function parseCardTypical(text) {
  const out = new Map();
  const s = String(text || "").trim();
  if (!s) return out;

  const parts = [];
  let token = "";
  let inQuotes = false;
  for (const ch of s) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      token += ch;
      continue;
    }
    if (!inQuotes && ch === ';') {
      parts.push(token);
      token = "";
      continue;
    }
    token += ch;
  }
  parts.push(token);

  for (const item of parts) {
    const chunk = String(item || "").trim();
    if (!chunk) continue;
    const p = chunk.indexOf(":=");
    if (p < 0) continue;
    const key = chunk.slice(0, p).trim();
    let val = chunk.slice(p + 2).trim();
    if (!key) continue;
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/""/g, '"');
    }
    out.set(key.toUpperCase(), val);
  }
  return out;
}

function mapIODelimiter(cardType, ioFormat) {
  const ct = String(cardType || "").toUpperCase();
  const fmt = String(ioFormat || "").toUpperCase();
  let out = ct === "INPUT" ? "I" : ct === "OUTPUT" ? "O" : "X";
  if (fmt === "ANALOG") out += ".";
  else if (fmt === "DISCRETE") out += "/";
  else out += "|";
  return out;
}

export function generateIMX({ tables, siteId, options = {} }) {
  requireTables(tables, ["ITKRackLayout", "ITKIOPoint", "tCardWiring", "tMacroList", "tTermOptions", "tKeyingPattern", "tKeyingMainMacro", "tFuseSizes"]);
  const sid = String(siteId || "").trim();
  if (!sid) throw new Error("Missing siteId.");

  const warnings = [];
  const siteCol = options.siteIdColumn || "Site_ID";
  const rackForSite = (tables.ITKRackLayout.records || [])
    .filter(r => String(r[siteCol] ?? "").trim() === sid)
    .sort((a, b) => compareMixed(a.Panel, b.Panel) || compareMixed(a.Rack_And_Slot, b.Rack_And_Slot));
  const ioForSite = (tables.ITKIOPoint.records || []).filter(r => String(r[siteCol] ?? "").trim() === sid);

  const ioByAddress = new Map(ioForSite.map(r => [String(r.Address_Formula || "").trim(), r]));
  const lookups = buildLookups({ ...tables, ITKIOPoint: { records: ioForSite } });

  const root = makeMoNode("EECGeneratedE104s", "GeneratorProject", true, {});

  const seenSlots = new Set();
  const panelNodes = new Map();
  let lastPanel = "";
  let lastRack = "";
  let cardsGenerated = 0;

  for (const card of rackForSite) {
    if (String(card.Rack_Status || "").toUpperCase() !== "READY") continue;

    const slotId = String(card.IO_Slot_ID || "").trim();
    if (!slotId || seenSlots.has(slotId)) continue;
    seenSlots.add(slotId);

    const typical = parseCardTypical(card.EPlan_Card_Typical);
    const pn = typical.get("PN") || "";
    const cw = typical.get("CW") || "";
    const ts = typical.get("TS") || "";
    if (!pn || !cw) {
      warnings.push(`${card.Rack_And_Slot}: Empty PN/CW in EPlan_Card_Typical`);
      continue;
    }
    if (String(card.IO_Card_Type_Cd || "") !== pn) {
      warnings.push(`${card.Rack_And_Slot}: Mismatched Card Part Number`);
      continue;
    }

    const wiringMatches = findCardWiringMatches(lookups, pn, cw)
      .slice()
      .sort((a, b) =>
        compareMixed(a["EEC Page"], b["EEC Page"]) || compareMixed(a["EEC Channel"], b["EEC Channel"]) || compareMixed(a["EEC Rung"], b["EEC Rung"]) || compareMixed(a["EEC PLC Side"], b["EEC PLC Side"])
      );
    if (!wiringMatches.length) {
      warnings.push(`${card.Rack_And_Slot}: missing tCardWiring for ${pn}/${cw}`);
      continue;
    }

    const cardType = String(wiringMatches[0]["EEC Page Type"] || "").toUpperCase();
    const pageCount = Number.parseInt(wiringMatches[0]["EEC Page Count"], 10) || 1;
    const channelCount = Number.parseInt(wiringMatches[0]["Card Max Channel Count"], 10) || 0;
    const channelDensity = Number.parseInt(wiringMatches[0]["EEC Channel Density"], 10) || 1;
    const channelsPerPage = 8 / channelDensity;
    const ioFormat = String(wiringMatches[0]["EEC IO Address Format"] || "");
    const addressDelimiter = mapIODelimiter(cardType, ioFormat);

    const cardCategory = String(wiringMatches[0].Category || "");
    const eplanPart1 = String(wiringMatches[0].Part1 || "");
    const termStyleDef = getTermStyleDefinition(lookups, cw, ts);
    const fuseSize = getFuseSize(lookups, pn, cw);

    const panelName = String(card.Panel || "").split(":")[0];
    const panelClean = cleanAlphaNum(panelName);
    const rackClean = cleanAlphaNum(card.Logical_Rack_Cd);

    if (panelClean !== lastPanel) {
      const panelNode = makeMoNode(`Panel_${panelClean}`, "Panel", false, { PanelName: panelName });
      panelNodes.set(panelClean, panelNode);
      append(root, panelNode);
      lastPanel = panelClean;
      lastRack = "";
    }

    const panelNode = panelNodes.get(panelClean);
    let rackNode;
    if (rackClean !== lastRack || !panelNode.children.some(c => c.name === `Rack_${rackClean}`)) {
      rackNode = makeMoNode(`Rack_${rackClean}`, "Rack", false, { RackName: rackClean });
      append(panelNode, rackNode);
      lastRack = rackClean;
    } else {
      rackNode = panelNode.children.find(c => c.name === `Rack_${rackClean}`);
    }

    const cardNode = makeMoNode(`Card_${rackClean}_${card.Slot_Cd}`, "Card", false, {
      NumberOfPagesString: String(pageCount),
      CardSlotNumber: String(card.Slot_Cd || ""),
      CardModel: String(card.IO_Card_Type_Cd || ""),
      CardType: cardType,
      CardBasePageNum: String(card.Card_Drawing_Number || ""),
      RevNum1: "",
      RevDesc1: "",
      RevDft1: "",
      RevDate1: "",
      RevNum2: "",
      RevDesc2: "",
      RevDft2: "",
      RevDate2: "",
      RevNum3: "",
      RevDesc3: "",
      RevDft3: "",
      RevDate3: "",
      RevNum4: "",
      RevDesc4: "",
      RevDft4: "",
      RevDate4: "",
      RevNum5: "",
      RevDesc5: "",
      RevDft5: "",
      RevDate5: ""
import { buildLookups, findCardWiringMatches, getFuseSize, getKeyRowsByPartNumber, getKeyingMainMacro, getTermStyleDefinition } from "./lookups.js";
import { cleanAlphaNum, compareMixed, dateStringToMMDDYY } from "./formatting.js";
import { requireTables } from "./validators.js";

// VBA origin: HelperEplanCardTypicalParser.ParseCardTypical
function parseCardTypical(text) {
  const out = new Map();
  for (const chunk of String(text || "").split(";")) {
    const raw = chunk.trim();
    if (!raw) continue;
    const m = raw.match(/^([^:=]+):=(.*)$/);
    if (!m) continue;
    const key = m[1].trim().toUpperCase();
    const value = m[2].trim().replace(/^"|"$/g, "");
    out.set(key, value);
  }
  return out;
}

export function generateIMX({ tables, siteId, options = {} }) {
  requireTables(tables, ["ITKRackLayout", "ITKIOPoint", "tCardWiring", "tMacroList", "tTermOptions", "tKeyingPattern", "tKeyingMainMacro", "tFuseSizes"]);
  const sid = String(siteId || "").trim();
  if (!sid) throw new Error("Missing siteId.");

  const warnings = [];
  const siteCol = options.siteIdColumn || "Site_ID";
  const rackForSite = (tables.ITKRackLayout.records || [])
    .filter(r => String(r[siteCol] ?? "").trim() === sid)
    .sort((a, b) => compareMixed(a.Panel, b.Panel) || compareMixed(a.Rack_And_Slot, b.Rack_And_Slot));
  const ioForSite = (tables.ITKIOPoint.records || []).filter(r => String(r[siteCol] ?? "").trim() === sid);

  const ioByAddress = new Map(ioForSite.map(r => [String(r.Address_Formula || "").trim(), r]));
  const lookups = buildLookups({ ...tables, ITKIOPoint: { records: ioForSite } });

  const root = makeMoNode("EECGeneratedE104s", "GeneratorProject", true, {});
  const panels = new Map();
  const seenSlots = new Set();
  let processedCards = 0;

  for (const card of rackForSite) {
    if (String(card.Rack_Status || "").toUpperCase() !== "READY") continue;
    const slotId = String(card.IO_Slot_ID || "").trim();
    if (!slotId || seenSlots.has(slotId)) continue;
    seenSlots.add(slotId);

    const typical = parseCardTypical(card.EPlan_Card_Typical);
    const pn = typical.get("PN") || "";
    const cw = typical.get("CW") || "";
    const ts = typical.get("TS") || "";
    if (!pn || !cw) {
      warnings.push(`${card.Rack_And_Slot}: missing PN/CW in EPlan_Card_Typical`);
      continue;
    }

    const wiring = findCardWiringMatches(lookups, pn, cw).slice().sort((a, b) =>
      compareMixed(a["EEC Page"], b["EEC Page"]) || compareMixed(a["EEC Channel"], b["EEC Channel"]) || compareMixed(a["EEC Rung"], b["EEC Rung"]) || compareMixed(a["EEC PLC Side"], b["EEC PLC Side"])
    );
    if (!wiring.length) {
      warnings.push(`${card.Rack_And_Slot}: no tCardWiring rows for ${pn}/${cw}`);
      continue;
    }

    const panelName = cleanAlphaNum(String(card.Panel || "").split(":")[0]);
    const rackName = cleanAlphaNum(card.Logical_Rack_Cd);
    const rackAndSlot = `${rackName}:${card.Slot_Cd}`;

    if (!panels.has(panelName)) {
      const panel = makeMoNode(panelName, "Panel", false, {});
      panels.set(panelName, { node: panel, racks: new Map() });
      append(root, panel);
    }
    const panelObj = panels.get(panelName);
    if (!panelObj.racks.has(rackName)) {
      const rack = makeMoNode(rackName, "Rack", false, {});
      panelObj.racks.set(rackName, rack);
      append(panelObj.node, rack);
    }

    const cardType = String(wiring[0]["EEC Page Type"] || "").toUpperCase();
    const pageCount = Number.parseInt(wiring[0]["EEC Page Count"], 10) || 1;
    const channelDensity = Number.parseInt(wiring[0]["EEC Channel Density"], 10) || 1;
    const channelsPerPage = 8 / channelDensity;
    const rungsPerChannel = 4 * channelDensity;
    const cardCategory = String(wiring[0].Category || "");
    const fuse = getFuseSize(lookups, pn, cw);
    const terminalStyle = getTermStyleDefinition(lookups, cw, ts);

    const cardNode = makeMoNode(rackAndSlot, "Card", false, {
      CardPartNumber: pn,
      CardLocation: rackAndSlot,
      DrawingNumber: card.Card_Drawing_Number || "",
      CardPageType: cardType,
      ChannelDensity: String(channelDensity),
      TerminalStyleDefinition: terminalStyle,
      FuseSize: fuse,
      EPLANPart1: wiring[0].Part1 || "",
      EPLANPart2: wiring[0].Part2 || "",
      EPLANPart3: wiring[0].Part3 || "",
      EPLANPart4: wiring[0].Part4 || ""
    });

    const revRows = rackForSite
      .filter(r => String(r.Card_Drawing_Revision_ID || "") === String(card.Card_Drawing_Revision_ID || ""))
      .sort((a, b) => compareMixed(a.Revision_Order, b.Revision_Order));
    const latestFirst = revRows.slice(-5).reverse();
    latestFirst.forEach((r, i) => {
      const n = String(i + 1);
      cardNode.params[`RevNum${n}`] = String(r.Revision_Cd || "");
      cardNode.params[`RevDesc${n}`] = String(r.Revision_Desc || "");
      cardNode.params[`RevDft${n}`] = String(r.Drafter_Initials || "");
      cardNode.params[`RevDate${n}`] = dateStringToMMDDYY(r.Revision_Dt);
    });

    for (let xPage = 0; xPage <= pageCount - 1; xPage += 1) {
      const pageNode = makeMoNode(`Page_${xPage}`, "Page", false, { PageType: "WIRING DIAGRAM" });

      const plcParams = {
        PLCBox_Engraving_Text: `${rackClean} SLOT ${card.Slot_Cd}`,
        PLCBox_Function_Text: `${channelCount} POINT CARD`,
        PLCBox_Mounting_Site: rackClean,
        PLCBox_Name: `${rackClean}.${Number.parseInt(card.Slot_Cd, 10)}`,
        PLCBox_Technical_Characteristics: String(card.IO_Card_Type_Cd || ""),
        PLCBox_PartNum: eplanPart1,
        PLCBox_RackID_Placement: "",
        PLCBox_RackID: "",
        PLCBox_Slot_Position: String(Number.parseInt(card.Slot_Cd, 10)),
        PLCBox_Main_Function: xPage === 0 ? "TRUE" : "FALSE"
      };
      append(pageNode, makeMoNode(`Page_PLCBox_${xPage}`, "Page_PLCBox", false, plcParams));

      const keyRows = getKeyRowsByPartNumber(lookups, pn);
      const keyingMainMacro = getKeyingMainMacro(lookups, cardCategory);
      if (xPage === 0 && keyRows.length && keyingMainMacro) {
        append(pageNode, makeMoNode(`KeyingMain_${xPage}`, keyingMainMacro, false, {
          KP_Notes_Line1: String(keyRows[0]["Notes Line1"] || ""),
          KP_Notes_Line2: String(keyRows[0]["Notes Line2"] || "")
        }));
      }

      const startChannel = xPage * channelsPerPage;
      const endChannel = startChannel + channelsPerPage - 1;

      for (let xChannel = -1; xChannel <= channelsPerPage; xChannel += 1) {
        let xChannelTB = "";
        if (xChannel === -1) xChannelTB = "T";
        if (xChannel === channelsPerPage) xChannelTB = "B";

        const xChannelIndex = xChannelTB || String(xChannel);
        const xChannelFull = xChannelTB ? "CardPwr" : String(startChannel + xChannel + 1);
        const channelName = xChannelTB ? `Channel_${xChannelTB}` : `Channel_${xChannel}`;
        const channelNode = makeMoNode(channelName, "Channel", false, {
          ChannelNumberFull: xChannelTB ? `${xChannelFull}_${xChannelTB}` : xChannelFull,
          ChannelNumberIndex: xChannelIndex
        });

        const ioAddress = `${card.Rack_And_Slot}:${addressDelimiter}${pad2Digits(xChannelFull)}`;
        if (ioByAddress.has(ioAddress)) {
          const io = ioByAddress.get(ioAddress);
          const macroName = String(io.EPlan_Field_Graphic || "");
          if (macroName && lookups.macroByAlias.has(macroName)) {
            append(channelNode, makeMoNode(`${macroName}_${xChannelFull}`, macroName, false, {
              End_Device_Name: String(io.Tag_Formula || ""),
              End_Device_Description: String(io.EPLAN_Desc || ""),
              End_Device_PartNum: String(io.Model_Number || "")
            }));
          }
        }

        const xRungMax = xChannelTB ? 0 : 3;
        for (let xRung = 0; xRung <= xRungMax; xRung += 1) {
          append(channelNode, makeMoNode(`PanelRung_${xRung}`, "PanelRung", false, { RungNumberFull: String(xRung) }));
          const endDeviceRung = makeMoNode(`EndDeviceRung_${xRung}`, "EndDeviceRung", false, { RungNumberFull: String(xRung) });
          if (ioByAddress.has(ioAddress)) {
            const io = ioByAddress.get(ioAddress);
            for (const side of ["Left", "Right"]) {
              const col = `EPlan_Field_Terminal_${xRung + 1}_${side}`;
              const raw = String(io[col] || "");
              if (!raw) continue;
              const [designation, description] = splitOnFirstDelimiter(";", raw);
              const macroName = `DTerm_${side}`;
              if (!lookups.macroByAlias.has(macroName)) continue;
              append(endDeviceRung, makeMoNode(`${macroName}_${xRung + 1}Left`, macroName, false, {
                Connection_Point_Description_Field_Device: designation,
                Connection_Point_Designation_Field_Device: description
              }));
            }
          }
          append(channelNode, endDeviceRung);
        }

        append(pageNode, channelNode);
      }

      append(cardNode, pageNode);
    }

    append(rackNode, cardNode);
    cardsGenerated += 1;

    if (!termStyleDef && !fuseSize) {
      // no-op; keep function calls to maintain port parity intent
    }
    revRows.forEach((rev, idx) => {
      cardNode.params[`Revision_${idx + 1}_Number`] = rev.Revision_Cd || "";
      cardNode.params[`Revision_${idx + 1}_Description`] = rev.Revision_Desc || "";
      cardNode.params[`Revision_${idx + 1}_Drafter`] = rev.Drafter_Initials || "";
      cardNode.params[`Revision_${idx + 1}_Engineer`] = rev.Engineer_Initials || "";
      cardNode.params[`Revision_${idx + 1}_Date`] = dateStringToMMDDYY(rev.Revision_Dt);
    });

    const keyRows = getKeyRowsByPartNumber(lookups, pn);
    if (keyRows.length) {
      const keyMain = getKeyingMainMacro(lookups, cardCategory);
      if (keyMain) append(cardNode, makeMoNode(`KeyingMain_${rackAndSlot}`, keyMain, false, {}));
    }

    for (let page = 1; page <= pageCount; page += 1) {
      const pageNode = makeMoNode(`Page_${page}`, "Page", false, { PageNumber: String(page), PageType: cardType });
      append(cardNode, pageNode);
      for (let ch = 1; ch <= channelsPerPage; ch += 1) {
        const channelNode = makeMoNode(`Channel_${page}_${ch}`, "Channel", false, { Channel: String(ch) });
        append(pageNode, channelNode);
        for (let rung = 0; rung < rungsPerChannel; rung += 1) {
          const panelRung = makeMoNode(`PanelRung_${rung}`, "PanelRung", false, { RungNumberFull: String(rung) });
          append(channelNode, panelRung);

          const address = `${card.IO_Slot_ID}:${page}:${ch}:${rung}`;
          const io = ioByAddress.get(address);
          if (io) {
            panelRung.params.FieldDeviceTag = io.Tag_Formula || "";
            panelRung.params.FieldDeviceDesc = io.EPLAN_Desc || "";
          }
        }
      }
    }

    append(panelObj.racks.get(rackName), cardNode);
    processedCards += 1;
  }

  return {
    imxText: serializeDocument(root),
    warnings,
    stats: {
      rackForSite: rackForSite.length,
      ioForSite: ioForSite.length,
      cardsGenerated
      cardsGenerated: processedCards,
      panels: panels.size
    }
  };
}
