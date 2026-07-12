// engine.js — pure functions only. No DOM, no localStorage.
// Everything here can be tested by calling it with plain data.

// ---- Dates ----

// The key for a calendar day, in the user's own timezone: "2026-07-12".
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---- The daily deal ----

// A small deterministic hash (FNV-1a). Same string in, same number out.
// Used so ties in the deal break the same way all day long.
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// The whole algorithm: circulating entries, never-shown first,
// then least recently shown. Ties break by a random order seeded
// from the date, so the deal is a fixture of the day.
export function dealOrder(entries, dateKey) {
  const circulating = entries.filter((e) => e.status === "circulating");
  return circulating.slice().sort((a, b) => {
    const aNever = a.lastShown == null;
    const bNever = b.lastShown == null;
    if (aNever !== bNever) return aNever ? -1 : 1;
    if (!aNever && a.lastShown !== b.lastShown) {
      return a.lastShown < b.lastShown ? -1 : 1;
    }
    return hashString(dateKey + a.id) - hashString(dateKey + b.id);
  });
}

// ---- Library helpers ----

// Plain substring search across text, source and author.
export function searchEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) =>
    (e.text || "").toLowerCase().includes(q) ||
    (e.source || "").toLowerCase().includes(q) ||
    (e.author || "").toLowerCase().includes(q)
  );
}

// Filter by status ("all" | "circulating" | "retired"), source, and tag.
export function filterEntries(entries, { status = "all", source = "", tag = "" } = {}) {
  return entries.filter((e) => {
    if (status !== "all" && e.status !== status) return false;
    if (source && (e.source || "") !== source) return false;
    if (tag && !(e.tags || []).includes(tag)) return false;
    return true;
  });
}

export function sortNewestFirst(entries) {
  return entries.slice().sort((a, b) => (a.created < b.created ? 1 : -1));
}

// Counts for the small stats line.
export function libraryStats(entries) {
  const circulating = entries.filter((e) => e.status === "circulating").length;
  const retired = entries.filter((e) => e.status === "retired").length;
  const sources = new Set(
    entries.map((e) => (e.source || "").trim()).filter((s) => s !== "")
  ).size;
  return { total: entries.length, circulating, retired, sources };
}

// Unique non-empty values of a field, for source/author autocomplete
// and the library filter menus. For "tags" the arrays are flattened.
export function uniqueValues(entries, field) {
  const seen = new Set();
  for (const e of entries) {
    if (field === "tags") {
      for (const t of e.tags || []) if (t.trim()) seen.add(t.trim());
    } else {
      const v = (e[field] || "").trim();
      if (v) seen.add(v);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// A short excerpt for library rows.
export function excerpt(text, max = 160) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// Parse a comma-separated tags field into a clean array.
export function parseTags(raw) {
  return (raw || "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

// The stats line, with words spelled out around the numbers.
export function statsLine(stats) {
  const parts = [];
  parts.push(
    stats.circulating === 1
      ? "1 passage in circulation"
      : `${stats.circulating} passages in circulation`
  );
  if (stats.retired > 0) {
    parts.push(`${stats.retired} retired`);
  }
  if (stats.sources > 0) {
    parts.push(
      stats.sources === 1 ? "from 1 source" : `from ${stats.sources} sources`
    );
  }
  return parts.join(", ") + ".";
}
