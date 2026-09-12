// Version 1: public coinbase observations, never authenticated client identity.
// Kept dependency-free so block details and the API use the same interpretation.
const SOFTWARE_LABELS = {
  zebra: "Zebra",
  zakura: "Zakura",
  other: "Other identified",
  unknown: "Unmarked",
  conflicting: "Conflicting markers",
  missing: "Coinbase unavailable",
};
function classifyMiningSoftware(hex) {
  if (
    typeof hex !== "string" ||
    !hex ||
    hex.length % 2 ||
    !/^[0-9a-f]+$/i.test(hex)
  )
    return "missing";
  const bytes = hex.toLowerCase().match(/../g);
  const text = bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join("");
  const marked = new Set();
  // Searching decoded bytes prevents a match straddling hexadecimal nibbles.
  if (text.includes("\xf0\x9f\xa6\x93")) marked.add("zebra");
  if (text.includes("\xf0\x9f\x8c\xb8")) marked.add("zakura");
  for (const match of text.matchAll(
    /(?=\/(zebra|zakura|zcashd)[: ]?v?\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.]+)?\/)/gi,
  ))
    marked.add(
      match[1].toLowerCase() === "zcashd" ? "other" : match[1].toLowerCase(),
    );
  return marked.size > 1
    ? "conflicting"
    : marked.values().next().value || "unknown";
}
module.exports = { SOFTWARE_LABELS, classifyMiningSoftware };
