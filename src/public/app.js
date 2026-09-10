const form = document.getElementById("create-form");
const textInput = document.getElementById("text");
const dueAtInput = document.getElementById("dueAt");
const formError = document.getElementById("form-error");
const listEl = document.getElementById("reminders");
const emptyEl = document.getElementById("empty");
const filterButtons = document.querySelectorAll("[data-filter]");

let filter = "pending";

function defaultDueAt() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

dueAtInput.value = defaultDueAt();

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function loadReminders() {
  const url =
    filter === "pending"
      ? "/api/reminders?status=pending"
      : "/api/reminders";
  const res = await fetch(url);
  const reminders = await res.json();

  listEl.innerHTML = "";
  if (!reminders.length) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  for (const r of reminders) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = r.text;

    const badge = document.createElement("span");
    badge.className = `badge ${r.status}`;
    badge.textContent = r.status;
    title.appendChild(badge);

    const when = document.createElement("div");
    when.className = "when";
    when.textContent = `#${r.id} · ${formatWhen(r.due_at)} · ${r.source}`;

    meta.appendChild(title);
    meta.appendChild(when);
    li.appendChild(meta);

    if (r.status === "pending") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cancel-btn";
      btn.textContent = "Cancel";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await fetch(`/api/reminders/${r.id}/cancel`, { method: "POST" });
        await loadReminders();
      });
      li.appendChild(btn);
    }

    listEl.appendChild(li);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const res = await fetch("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: textInput.value.trim(),
      dueAt: dueAtInput.value,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    formError.textContent = data.error || "Could not create reminder";
    formError.hidden = false;
    return;
  }

  textInput.value = "";
  dueAtInput.value = defaultDueAt();
  filter = "pending";
  filterButtons.forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === "pending");
  });
  await loadReminders();
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
    void loadReminders();
  });
});

void loadReminders();
setInterval(() => void loadReminders(), 30_000);
