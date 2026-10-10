const form = document.getElementById("create-form");
const titleInput = document.getElementById("title");
const startDateInput = document.getElementById("startDate");
const dueDateInput = document.getElementById("dueDate");
const formError = document.getElementById("form-error");
const listEl = document.getElementById("documents");
const emptyEl = document.getElementById("empty");
const ganttEmpty = document.getElementById("gantt-empty");
const ganttViews = document.getElementById("gantt-views");

/** @type {any} */
let gantt = null;
let currentView = "Week";
/** @type {any[]} */
let cachedDocs = [];
let refreshing = false;

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(isoDate) {
  if (!isoDate) return null;
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRange(startDate, dueDate) {
  if (!startDate && !dueDate) return "No dates set";
  if (startDate && dueDate) {
    return `${formatDate(startDate)} → ${formatDate(dueDate)}`;
  }
  if (startDate) return `Starts ${formatDate(startDate)}`;
  return `Due ${formatDate(dueDate)}`;
}

function dueClass(dueDate, done) {
  if (done || !dueDate) return "";
  const key = todayKey();
  if (dueDate < key) return "overdue";
  if (dueDate === key) return "due-today";
  return "";
}

function toIsoDate(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(value).slice(0, 10);
}

/** Frappe end is exclusive; callback may be midnight or end-1s. */
function exclusiveEndToDue(end) {
  const d = end instanceof Date ? new Date(end.getTime()) : new Date(end);
  if (
    d.getHours() === 0 &&
    d.getMinutes() === 0 &&
    d.getSeconds() === 0 &&
    d.getMilliseconds() === 0
  ) {
    d.setDate(d.getDate() - 1);
  }
  return toIsoDate(d);
}

function docsToTasks(docs) {
  const startDefault = todayKey();
  return docs.map((doc) => {
    let start = doc.start_date;
    let due = doc.due_date;

    if (!start && !due) {
      start = startDefault;
      due = addDays(startDefault, 6);
    } else if (!start && due) {
      start = addDays(due, -6);
    } else if (start && !due) {
      due = addDays(start, 6);
    }

    if (start > due) {
      due = start;
    }

    // Frappe Gantt end date is exclusive
    return {
      id: String(doc.id),
      name: doc.title,
      start,
      end: addDays(due, 1),
      progress: doc.done ? 100 : 0,
      custom_class: doc.done ? "bar-done" : "",
    };
  });
}

function renderChecklist(docs) {
  listEl.innerHTML = "";
  emptyEl.hidden = docs.length > 0;

  for (const doc of docs) {
    const li = document.createElement("li");
    if (doc.done) li.classList.add("done");

    const label = document.createElement("label");
    label.className = "check-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = doc.done;
    checkbox.addEventListener("change", async () => {
      await fetch(`/api/visa/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: checkbox.checked }),
      });
      await loadDocuments();
    });

    const meta = document.createElement("span");
    meta.className = "meta";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = doc.title;

    const when = document.createElement("span");
    when.className = `when ${dueClass(doc.due_date, doc.done)}`.trim();
    when.textContent = formatRange(doc.start_date, doc.due_date);

    meta.append(title, when);
    label.append(checkbox, meta);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "cancel-btn";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      await fetch(`/api/visa/${doc.id}`, { method: "DELETE" });
      await loadDocuments();
    });

    li.append(label, del);
    listEl.append(li);
  }
}

function renderGantt(docs) {
  ganttEmpty.hidden = docs.length > 0;
  const wrap = document.querySelector(".gantt-wrap");
  if (wrap) wrap.hidden = docs.length === 0;

  if (docs.length === 0) {
    gantt = null;
    const svg = document.getElementById("gantt");
    if (svg) svg.innerHTML = "";
    return;
  }

  const Gantt = window.Gantt;
  if (typeof Gantt !== "function") {
    console.error("Frappe Gantt failed to load");
    return;
  }

  const tasks = docsToTasks(docs);
  const svg = document.getElementById("gantt");
  svg.innerHTML = "";

  gantt = new Gantt("#gantt", tasks, {
    view_mode: currentView,
    bar_height: 22,
    padding: 14,
    on_date_change: async (task, start, end) => {
      if (refreshing) return;
      const startDate = toIsoDate(start);
      let dueDate = exclusiveEndToDue(end);
      if (dueDate < startDate) dueDate = startDate;

      refreshing = true;
      try {
        const res = await fetch(`/api/visa/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, dueDate }),
        });
        if (!res.ok) return;
        // Refresh checklist only — keep the bar where the user dropped it
        const listRes = await fetch("/api/visa");
        cachedDocs = await listRes.json();
        renderChecklist(cachedDocs);
      } finally {
        refreshing = false;
      }
    },
  });
}

async function loadDocuments(options = {}) {
  const res = await fetch("/api/visa");
  const docs = await res.json();
  cachedDocs = docs;
  renderChecklist(docs);
  if (!options.skipGantt) {
    renderGantt(docs);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const title = titleInput.value.trim();
  const startDate = startDateInput.value.trim() || null;
  const dueDate = dueDateInput.value.trim() || null;

  if (startDate && dueDate && startDate > dueDate) {
    formError.textContent = "Start date must be on or before due date";
    formError.hidden = false;
    return;
  }

  const res = await fetch("/api/visa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, startDate, dueDate }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    formError.textContent = data.error || "Could not add document";
    formError.hidden = false;
    return;
  }

  form.reset();
  titleInput.focus();
  await loadDocuments();
});

ganttViews.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  currentView = btn.dataset.view;
  for (const b of ganttViews.querySelectorAll("button")) {
    b.classList.toggle("active", b === btn);
  }
  if (gantt && typeof gantt.change_view_mode === "function") {
    gantt.change_view_mode(currentView);
  } else {
    renderGantt(cachedDocs);
  }
});

void loadDocuments();
