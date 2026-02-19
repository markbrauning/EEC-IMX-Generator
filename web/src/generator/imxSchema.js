export function makeMoNode(name, typeClass, save, params = {}) {
  return { name, typeClass, save, params, children: [] };
}

export function append(parent, child) {
  if (child) parent.children.push(child);
}

function esc(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function serializeNode(node, depth = 0) {
  const pad = "  ".repeat(depth);
  const attrs = [`name=\"${esc(node.name)}\"`, `typeClass=\"${esc(node.typeClass)}\"`];
  if (typeof node.save === "boolean") attrs.push(`save=\"${node.save ? "true" : "false"}\"`);
  const out = [`${pad}<mo ${attrs.join(" ")}>`];
  for (const [key, value] of Object.entries(node.params || {})) {
    out.push(`${pad}  <parameter name=\"${esc(key)}\" type=\"String\" value=\"${esc(value)}\"/>`);
  }
  for (const c of node.children || []) out.push(serializeNode(c, depth + 1));
  out.push(`${pad}</mo>`);
  return out.join("\n");
}

export function serializeDocument(rootNode) {
  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n${serializeNode(rootNode)}`;
}
