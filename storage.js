// storage.js — everything that touches localStorage, plus export/import.
// The shape of the stored document matches the PRD schema exactly.

const DATA_KEY = "marginalia.data";
const META_KEY = "marginalia.meta";
const TODAY_KEY = "marginalia.today";

// ---- The library document ----

export function newData() {
  const now = new Date().toISOString();
  return { schemaVersion: 1, created: now, modified: now, entries: [] };
}

export function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.entries)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveData(data) {
  data.modified = new Date().toISOString();
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

// ---- Small app metadata (backup age, first-visit intro) ----

export function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) || { lastBackup: null };
  } catch {
    return { lastBackup: null };
  }
}

export function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

// ---- Today's dealt cards ----
// This is view state, not the schedule: it remembers which cards were
// dealt today so a reload shows the same stack. The deal itself is
// always derived from the entries and the date; if this record is
// lost, nothing breaks. It is deliberately not part of the export.

export function loadDailyState() {
  try {
    const s = JSON.parse(localStorage.getItem(TODAY_KEY));
    if (!s || !Array.isArray(s.dealtIds)) return null;
    if (typeof s.responses !== "object" || s.responses === null) s.responses = {};
    return s;
  } catch {
    return null;
  }
}

export function saveDailyState(state) {
  localStorage.setItem(TODAY_KEY, JSON.stringify(state));
}

// ---- Export ----

export function exportFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `marginalia-backup-${y}-${m}-${d}.json`;
}

// Offers the whole library as a .json download.
export function downloadExport(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- Import ----

// Checks a parsed import file. Returns { ok: true, data } or { ok: false, error }.
export function validateImport(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "That file does not look like a Marginalia backup." };
  }
  if (parsed.schemaVersion !== 1) {
    return {
      ok: false,
      error: `This backup uses schema version ${parsed.schemaVersion ?? "unknown"}, and this app reads version 1.`,
    };
  }
  if (!Array.isArray(parsed.entries)) {
    return { ok: false, error: "The backup file has no entries list." };
  }
  return { ok: true, data: parsed };
}

// Merge: keep everything already here, add imported entries whose id is new.
// Returns how many were added.
export function mergeEntries(data, incomingEntries) {
  const existing = new Set(data.entries.map((e) => e.id));
  let added = 0;
  for (const entry of incomingEntries) {
    if (!entry || !entry.id || existing.has(entry.id)) continue;
    data.entries.push(entry);
    existing.add(entry.id);
    added++;
  }
  return added;
}

// ---- Backup age ----

export function backupAgeText(lastBackupIso, now = new Date()) {
  if (!lastBackupIso) return "Last backup: never.";
  const then = new Date(lastBackupIso);
  const days = Math.floor((now - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Last backup: today.";
  if (days === 1) return "Last backup: 1 day ago.";
  return `Last backup: ${days} days ago.`;
}
