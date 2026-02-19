import { makeMoNode, append, serializeDocument } from "./imxSchema.js";
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
      cardsGenerated: processedCards,
      panels: panels.size
    }
  };
}
