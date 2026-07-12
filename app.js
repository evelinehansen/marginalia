// app.js — rendering and event wiring. All logic lives in engine.js,
// all saving in storage.js.

import {
  todayKey, dealOrder, searchEntries, filterEntries, sortNewestFirst,
  libraryStats, uniqueValues, excerpt, parseTags, statsLine,
} from "./engine.js";
import * as store from "./storage.js";

// ---- State ----

let data = store.loadData();
let meta = store.loadMeta();
let daily = store.loadDailyState();
let currentView = "today";
let editingId = null;          // id of the entry being edited, or null for a new one
let pendingImport = null;      // parsed backup waiting on the merge-or-replace choice
let pendingDeleteId = null;
let toastTimer = null;

// First visit: seed the three example passages so the daily card
// demonstrates itself. They are ordinary entries; retire or delete freely.
if (!data) {
  data = store.newData();
  seedExamples();
  store.saveData(data);
}

function seedExamples() {
  const now = new Date().toISOString();
  const examples = [
    {
      id: "example-thoreau",
      text: "I went to the woods because I wished to live deliberately, to front only the essential facts of life, and see if I could not learn what it had to teach, and not, when I came to die, discover that I had not lived.",
      source: "Walden",
      author: "Henry David Thoreau",
      location: "Where I Lived, and What I Lived For",
      tags: ["attention"],
      thought: "",
    },
    {
      id: "example-eliot",
      text: "If we had a keen vision and feeling of all ordinary human life, it would be like hearing the grass grow and the squirrel's heart beat, and we should die of that roar which lies on the other side of silence.",
      source: "Middlemarch",
      author: "George Eliot",
      location: "ch. 20",
      tags: ["attention"],
      thought: "",
    },
    {
      id: "example-whitman",
      text: "Do I contradict myself?\nVery well then I contradict myself,\n(I am large, I contain multitudes.)",
      source: "Song of Myself",
      author: "Walt Whitman",
      location: "sec. 51",
      tags: [],
      thought: "Permission to change my mind.",
    },
  ];
  for (const e of examples) {
    data.entries.push({
      ...e,
      created: now,
      lastShown: null,
      timesShown: 0,
      status: "circulating",
    });
  }
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function findEntry(id) {
  return data.entries.find((e) => e.id === id);
}

// ---- Small DOM helpers ----

const $ = (sel) => document.querySelector(sel);

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ---- Today view ----

function ensureDailyState() {
  const dateKey = todayKey();
  if (!daily || daily.date !== dateKey) {
    daily = { date: dateKey, dealtIds: [], responses: {} };
    store.saveDailyState(daily);
  }
}

// Deal a card: record the meeting on the entry and remember it for today.
function dealEntry(entry) {
  entry.lastShown = daily.date;
  entry.timesShown = (entry.timesShown || 0) + 1;
  daily.dealtIds.push(entry.id);
  store.saveData(data);
  store.saveDailyState(daily);
}

function nextUndealt() {
  const order = dealOrder(data.entries, daily.date);
  return order.find((e) => !daily.dealtIds.includes(e.id)) || null;
}

function attributionHtml(entry) {
  const bits = [];
  if (entry.source) bits.push(`<span class="source">${esc(entry.source)}</span>`);
  if (entry.author) bits.push(esc(entry.author));
  if (entry.location) bits.push(`<span class="loc">${esc(entry.location)}</span>`);
  return bits.join(" · ");
}

function cardHtml(entry) {
  const response = daily.responses[entry.id];
  let footer;
  if (entry.status === "retired") {
    footer = `
      <div class="card-state">
        <span>Retired with thanks.</span>
        <button class="btn ghost small" data-action="unretire" data-id="${entry.id}">Undo</button>
      </div>`;
  } else if (response === "kept") {
    footer = `<div class="card-state"><span>Kept in circulation.</span></div>`;
  } else {
    footer = `
      <div class="card-responses">
        <button class="btn primary" data-action="keep" data-id="${entry.id}">Still hits</button>
        <button class="btn quiet" data-action="retire" data-id="${entry.id}">Retire</button>
      </div>`;
  }
  return `
    <article class="daily-card">
      <p class="passage">${esc(entry.text)}</p>
      ${attributionHtml(entry) ? `<p class="attribution">${attributionHtml(entry)}</p>` : ""}
      ${entry.thought ? `<p class="thought">${esc(entry.thought)}</p>` : ""}
      ${footer}
    </article>`;
}

function renderToday() {
  ensureDailyState();

  const emptyEl = $("#today-empty");
  const cardsEl = $("#today-cards");
  const actionsEl = $("#today-actions");
  const statsEl = $("#today-stats");
  const introEl = $("#today-intro");

  const stats = libraryStats(data.entries);

  if (data.entries.length === 0) {
    emptyEl.hidden = false;
    introEl.hidden = true;
    cardsEl.innerHTML = "";
    actionsEl.innerHTML = "";
    statsEl.textContent = "";
    return;
  }
  emptyEl.hidden = true;

  // Show the three-line loop explanation while the library is still
  // only the shipped examples.
  const onlyExamples = data.entries.every((e) => e.id.startsWith("example-"));
  introEl.hidden = !onlyExamples;

  // Deal the day's fixture card if nothing has been dealt yet.
  if (daily.dealtIds.length === 0) {
    const first = nextUndealt();
    if (first) dealEntry(first);
  }

  const dealt = daily.dealtIds.map(findEntry).filter(Boolean);

  if (dealt.length === 0) {
    // Everything is retired: a quiet note rather than an error.
    cardsEl.innerHTML = `<p class="all-met">Nothing is circulating right now. Every passage rests in the archive.</p>`;
    actionsEl.innerHTML = "";
    statsEl.textContent = statsLine(stats);
    return;
  }

  cardsEl.innerHTML = dealt.map(cardHtml).join("");

  if (nextUndealt()) {
    actionsEl.innerHTML = `<button class="btn ghost" id="btn-another">Deal another</button>`;
  } else if (stats.circulating > 0) {
    actionsEl.innerHTML = `<p class="all-met">You have met every circulating passage today.</p>`;
  } else {
    actionsEl.innerHTML = "";
  }

  statsEl.textContent = statsLine(stats);
}

// Card responses, via event delegation on the cards container.
$("#view-today").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-action]");
  if (btn) {
    const entry = findEntry(btn.dataset.id);
    if (!entry) return;
    if (btn.dataset.action === "keep") {
      entry.lastShown = daily.date;
      daily.responses[entry.id] = "kept";
      store.saveData(data);
      store.saveDailyState(daily);
      renderToday();
    } else if (btn.dataset.action === "retire") {
      retireEntry(entry);
    } else if (btn.dataset.action === "unretire") {
      unretireEntry(entry);
    }
    return;
  }
  if (event.target.id === "btn-another") {
    const next = nextUndealt();
    if (next) dealEntry(next);
    renderToday();
  }
});

function retireEntry(entry) {
  entry.status = "retired";
  daily.responses[entry.id] = "retired";
  store.saveData(data);
  store.saveDailyState(daily);
  renderToday();
  renderLibrary();
  showToast("Retired with thanks.", "Undo", () => unretireEntry(entry));
}

function unretireEntry(entry) {
  entry.status = "circulating";
  delete daily.responses[entry.id];
  store.saveData(data);
  store.saveDailyState(daily);
  hideToast();
  renderToday();
  renderLibrary();
}

// ---- Library view ----

const libraryState = { query: "", status: "all", source: "", tag: "" };

function renderLibraryFilters() {
  const sources = uniqueValues(data.entries, "source");
  const tags = uniqueValues(data.entries, "tags");

  const sourceSel = $("#lib-source");
  sourceSel.innerHTML =
    `<option value="">All sources</option>` +
    sources.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  sourceSel.value = sources.includes(libraryState.source) ? libraryState.source : "";
  libraryState.source = sourceSel.value;

  const tagSel = $("#lib-tag");
  tagSel.innerHTML =
    `<option value="">All tags</option>` +
    tags.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  tagSel.value = tags.includes(libraryState.tag) ? libraryState.tag : "";
  libraryState.tag = tagSel.value;
}

function entryRowHtml(entry) {
  const meta = [];
  if (entry.source || entry.author) {
    meta.push(esc([entry.source, entry.author].filter(Boolean).join(" · ")));
  }
  for (const t of entry.tags || []) {
    meta.push(`<span class="tag-chip">${esc(t)}</span>`);
  }
  if (entry.status === "retired") {
    meta.push(`<span class="retired-badge">retired</span>`);
  }
  return `
    <button class="entry-row ${entry.status}" data-id="${entry.id}">
      <p class="excerpt">${esc(excerpt(entry.text))}</p>
      ${meta.length ? `<span class="entry-meta">${meta.join(" ")}</span>` : ""}
    </button>`;
}

function renderLibrary() {
  renderLibraryFilters();

  const stats = libraryStats(data.entries);
  const headingEl = $("#lib-heading");

  if (libraryState.status === "retired") {
    // The retired shelf: a record of a relationship, not a trash can.
    headingEl.textContent = `${stats.total} passages met, ${stats.retired} retired.`;
  } else {
    headingEl.textContent = data.entries.length ? statsLine(stats) : "";
  }

  let list = filterEntries(data.entries, libraryState);
  list = searchEntries(list, libraryState.query);
  list = sortNewestFirst(list);

  const listEl = $("#lib-list");
  if (data.entries.length === 0) {
    listEl.innerHTML = `<p class="no-results">Nothing saved yet. The library fills as you read.</p>`;
  } else if (list.length === 0) {
    listEl.innerHTML = `<p class="no-results">No passages match.</p>`;
  } else {
    listEl.innerHTML = list.map(entryRowHtml).join("");
  }
}

$("#lib-search").addEventListener("input", (e) => {
  libraryState.query = e.target.value;
  renderLibrary();
});

document.querySelectorAll(".chip[data-status]").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip[data-status]").forEach((c) =>
      c.classList.toggle("selected", c === chip)
    );
    libraryState.status = chip.dataset.status;
    renderLibrary();
  });
});

$("#lib-source").addEventListener("change", (e) => {
  libraryState.source = e.target.value;
  renderLibrary();
});

$("#lib-tag").addEventListener("change", (e) => {
  libraryState.tag = e.target.value;
  renderLibrary();
});

$("#lib-list").addEventListener("click", (e) => {
  const row = e.target.closest(".entry-row");
  if (row) openPanel(row.dataset.id);
});

// ---- Views ----

function showView(name) {
  currentView = name;
  $("#view-today").hidden = name !== "today";
  $("#view-library").hidden = name !== "library";
  document.querySelectorAll(".tab").forEach((tab) => {
    if (tab.dataset.view === name) {
      tab.setAttribute("aria-current", "page");
    } else {
      tab.removeAttribute("aria-current");
    }
  });
  if (name === "today") renderToday();
  if (name === "library") renderLibrary();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

// ---- Capture and edit panel ----

function openPanel(entryId = null) {
  editingId = entryId;
  const entry = entryId ? findEntry(entryId) : null;

  $("#panel-title").textContent = entry ? "Edit passage" : "Save a passage";
  $("#f-text").value = entry ? entry.text : "";
  $("#f-source").value = entry ? entry.source || "" : "";
  $("#f-author").value = entry ? entry.author || "" : "";
  $("#f-location").value = entry ? entry.location || "" : "";
  $("#f-tags").value = entry ? (entry.tags || []).join(", ") : "";
  $("#f-thought").value = entry ? entry.thought || "" : "";
  $("#btn-save-entry").textContent = entry ? "Save changes" : "Save passage";
  $("#length-nudge").hidden = !entry || entry.text.length <= 1000;

  const statusBtn = $("#btn-toggle-status");
  statusBtn.hidden = !entry;
  if (entry) {
    statusBtn.textContent =
      entry.status === "retired" ? "Return to circulation" : "Retire";
  }
  $("#btn-delete").hidden = !entry;

  // Autocomplete: a book typed once completes forever.
  $("#dl-sources").innerHTML = uniqueValues(data.entries, "source")
    .map((s) => `<option value="${esc(s)}"></option>`).join("");
  $("#dl-authors").innerHTML = uniqueValues(data.entries, "author")
    .map((a) => `<option value="${esc(a)}"></option>`).join("");

  $("#panel-backdrop").hidden = false;
  $("#panel").classList.add("open");
  $("#panel").scrollTop = 0;
  $("#f-text").focus();
}

function closePanel() {
  $("#panel").classList.remove("open");
  $("#panel-backdrop").hidden = true;
  editingId = null;
}

$("#btn-capture").addEventListener("click", () => openPanel());
$("#btn-empty-capture").addEventListener("click", () => openPanel());
$("#btn-panel-close").addEventListener("click", closePanel);
$("#panel-backdrop").addEventListener("click", closePanel);

// The soft length nudge, past 1000 characters. Never blocks saving.
$("#f-text").addEventListener("input", (e) => {
  $("#length-nudge").hidden = e.target.value.length <= 1000;
});

$("#entry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("#f-text").value.trim();
  if (!text) return;

  const fields = {
    text,
    source: $("#f-source").value.trim(),
    author: $("#f-author").value.trim(),
    location: $("#f-location").value.trim(),
    tags: parseTags($("#f-tags").value),
    thought: $("#f-thought").value.trim(),
  };

  if (editingId) {
    const entry = findEntry(editingId);
    Object.assign(entry, fields);
    showToast("Saved.");
  } else {
    data.entries.push({
      id: newId(),
      ...fields,
      created: new Date().toISOString(),
      lastShown: null,
      timesShown: 0,
      status: "circulating",
    });
    showToast("Saved to your library.");
  }

  store.saveData(data);
  closePanel();
  renderToday();
  renderLibrary();
});

$("#btn-toggle-status").addEventListener("click", () => {
  const entry = findEntry(editingId);
  if (!entry) return;
  if (entry.status === "retired") {
    unretireEntry(entry);
    showToast("Back in circulation.");
    closePanel();
  } else {
    closePanel();
    retireEntry(entry);
  }
});

// ---- Delete, behind a confirmation ----

$("#btn-delete").addEventListener("click", () => {
  pendingDeleteId = editingId;
  $("#modal-backdrop").hidden = false;
  $("#modal-delete").hidden = false;
});

function closeModals() {
  $("#modal-backdrop").hidden = true;
  $("#modal-delete").hidden = true;
  $("#modal-import").hidden = true;
  pendingDeleteId = null;
  pendingImport = null;
}

$("#btn-delete-cancel").addEventListener("click", closeModals);
$("#modal-backdrop").addEventListener("click", closeModals);

$("#btn-delete-confirm").addEventListener("click", () => {
  const id = pendingDeleteId;
  data.entries = data.entries.filter((e) => e.id !== id);
  daily.dealtIds = daily.dealtIds.filter((d) => d !== id);
  delete daily.responses[id];
  store.saveData(data);
  store.saveDailyState(daily);
  closeModals();
  closePanel();
  renderToday();
  renderLibrary();
  showToast("Passage deleted.");
});

// ---- Export and import ----

function renderBackupAge() {
  $("#backup-age").textContent = store.backupAgeText(meta.lastBackup);
}

$("#btn-export").addEventListener("click", () => {
  store.downloadExport(data);
  meta.lastBackup = new Date().toISOString();
  store.saveMeta(meta);
  renderBackupAge();
  showToast("Library exported.");
});

$("#btn-import").addEventListener("click", () => $("#import-file").click());

$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    showToast("That file could not be read as JSON.");
    return;
  }

  const check = store.validateImport(parsed);
  if (!check.ok) {
    showToast(check.error);
    return;
  }

  pendingImport = check.data;
  const n = pendingImport.entries.length;
  $("#import-summary").textContent =
    n === 1 ? "This file holds 1 passage." : `This file holds ${n} passages.`;
  $("#modal-backdrop").hidden = false;
  $("#modal-import").hidden = false;
});

$("#btn-import-cancel").addEventListener("click", closeModals);

$("#btn-import-merge").addEventListener("click", () => {
  const added = store.mergeEntries(data, pendingImport.entries);
  store.saveData(data);
  closeModals();
  renderToday();
  renderLibrary();
  showToast(added === 1 ? "1 passage added." : `${added} passages added.`);
});

$("#btn-import-replace").addEventListener("click", () => {
  data = pendingImport;
  daily = { date: todayKey(), dealtIds: [], responses: {} };
  store.saveData(data);
  store.saveDailyState(daily);
  closeModals();
  renderToday();
  renderLibrary();
  showToast("Library replaced from the file.");
});

// ---- Toast ----

function showToast(message, actionLabel = null, onAction = null) {
  clearTimeout(toastTimer);
  $("#toast-text").textContent = message;
  const actionBtn = $("#toast-action");
  if (actionLabel) {
    actionBtn.textContent = actionLabel;
    actionBtn.hidden = false;
    actionBtn.onclick = onAction;
  } else {
    actionBtn.hidden = true;
    actionBtn.onclick = null;
  }
  $("#toast").hidden = false;
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  clearTimeout(toastTimer);
  $("#toast").hidden = true;
}

// ---- Keyboard ----

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("#modal-delete").hidden || !$("#modal-import").hidden) {
      closeModals();
    } else if ($("#panel").classList.contains("open")) {
      closePanel();
    }
  }
});

// ---- Start ----

renderBackupAge();
showView("today");
