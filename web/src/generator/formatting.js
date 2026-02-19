export function cleanAlphaNum(input = "") {
  return String(input).replace(/[^a-z0-9]/gi, "");
}

export function pad2Digits(v) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return "00";
  return String(n).padStart(2, "0");
}

export function dateStringToMMDDYY(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2Digits(d.getMonth() + 1)}/${pad2Digits(d.getDate())}/${String(d.getFullYear()).slice(-2)}`;
}

export function splitOnFirstDelimiter(delimiter, input) {
  const text = String(input ?? "");
  const idx = text.indexOf(delimiter);
  if (idx < 0) return [text.trim(), ""];
  return [text.slice(0, idx).trim(), text.slice(idx + delimiter.length).trim()];
}

export function compareMixed(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}
