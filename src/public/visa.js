const form = document.getElementById("create-form");
const titleInput = document.getElementById("title");
const startDateInput = document.getElementById("startDate");
const dueDateInput = document.getElementById("dueDate");
const formError = document.getElementById("form-error");
const listEl = document.getElementById("documents");
const emptyEl = document.getElementById("empty");
const ganttEmpty = document.getElementById("gantt-empty");
const ganttViews = document.getElementById("gantt-views");
const weekdayToggles = document.getElementById("weekday-toggles");
const scheduleTimeInput = document.getElementById("schedule-time");
const addTimeBtn = document.getElementById("add-time-btn");
const scheduleTimesEl = document.getElementById("schedule-times");
const saveScheduleBtn = document.getElementById("save-schedule-btn");
const testDigestBtn = document.getElementById("test-digest-btn");
const scheduleStatus = document.getElementById("schedule-status");
const scheduleError = document.getElementById("schedule-error");

/** @type {any} */
let gantt = null;
let currentView = "Week";
/** @type {any[]} */
let cachedDocs = [];
let refreshing = false;
/** @type {string[]} */
let scheduleTimes = [];

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

function normalizeTimeValue(raw) {
  const value = String(raw || "").trim();
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5);
  return null;
}

function renderScheduleTimes() {
  scheduleTimesEl.innerHTML = "";
  for (const time of scheduleTimes) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = time;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cancel-btn";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      scheduleTimes = scheduleTimes.filter((t) => t !== time);
      renderScheduleTimes();
    });
    li.append(label, remove);
    scheduleTimesEl.append(li);
  }
}

function applyScheduleToForm(schedule) {
  const daySet = new Set(schedule.days.map(Number));
  for (const input of weekdayToggles.querySelectorAll('input[type="checkbox"]')) {
    input.checked = daySet.has(Number(input.value));
  }
  scheduleTimes = [...schedule.times].sort();
  renderScheduleTimes();
}

async function loadSchedule() {
  scheduleError.hidden = true;
  scheduleStatus.hidden = true;
  const res = await fetch("/api/visa/schedule");
  if (!res.ok) {
    scheduleError.textContent = "Could not load schedule";
    scheduleError.hidden = false;
    return;
  }
  applyScheduleToForm(await res.json());
}

addTimeBtn.addEventListener("click", () => {
  scheduleError.hidden = true;
  const time = normalizeTimeValue(scheduleTimeInput.value);
  if (!time) {
    scheduleError.textContent = "Pick a valid time";
    scheduleError.hidden = false;
    return;
  }
  if (!scheduleTimes.includes(time)) {
    scheduleTimes.push(time);
    scheduleTimes.sort();
    renderScheduleTimes();
  }
  scheduleTimeInput.value = "";
});

saveScheduleBtn.addEventListener("click", async () => {
  scheduleError.hidden = true;
  scheduleStatus.hidden = true;

  const days = [
    ...weekdayToggles.querySelectorAll('input[type="checkbox"]:checked'),
  ].map((input) => Number(input.value));

  if (days.length === 0) {
    scheduleError.textContent = "Select at least one day";
    scheduleError.hidden = false;
    return;
  }
  if (scheduleTimes.length === 0) {
    scheduleError.textContent = "Add at least one time";
    scheduleError.hidden = false;
    return;
  }

  const res = await fetch("/api/visa/schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days, times: scheduleTimes }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    scheduleError.textContent = data.error || "Could not save schedule";
    scheduleError.hidden = false;
    return;
  }

  applyScheduleToForm(await res.json());
  scheduleStatus.textContent = "Schedule saved.";
  scheduleStatus.hidden = false;
});

testDigestBtn.addEventListener("click", async () => {
  scheduleError.hidden = true;
  scheduleStatus.hidden = true;
  testDigestBtn.disabled = true;
  try {
    const res = await fetch("/api/visa/schedule/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      scheduleError.textContent =
        data.error || "Could not send test reminder";
      scheduleError.hidden = false;
      return;
    }
    scheduleStatus.textContent =
      data.count > 0
        ? `Test sent (${data.count} active doc${data.count === 1 ? "" : "s"}). Check Telegram.`
        : "Test sent (no documents active today). Check Telegram.";
    scheduleStatus.hidden = false;
  } finally {
    testDigestBtn.disabled = false;
  }
});

void loadDocuments();
void loadSchedule();
