import { Router } from "express";
import { fromZonedTime } from "date-fns-tz";
import { config } from "../config.js";
import {
  cancelReminder,
  createReminder,
  listReminders,
  listUpcoming,
} from "../db.js";

export const remindersRouter = Router();

remindersRouter.get("/", (_req, res) => {
  const status = _req.query.status;
  if (status === "pending") {
    res.json(listUpcoming(100));
    return;
  }
  res.json(listReminders({ limit: 100 }));
});

remindersRouter.post("/", (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  const dueAtRaw = String(req.body?.dueAt ?? "").trim();

  if (!text || !dueAtRaw) {
    res.status(400).json({ error: "text and dueAt are required" });
    return;
  }

  // datetime-local is wall clock without TZ; interpret in configured TZ
  const normalized = dueAtRaw.length === 16 ? `${dueAtRaw}:00` : dueAtRaw;
  const dueAt = fromZonedTime(normalized, config.tz);

  if (Number.isNaN(dueAt.getTime())) {
    res.status(400).json({ error: "Invalid dueAt datetime" });
    return;
  }

  if (dueAt.getTime() <= Date.now()) {
    res.status(400).json({ error: "dueAt must be in the future" });
    return;
  }

  const reminder = createReminder({ text, dueAt, source: "web" });
  res.status(201).json(reminder);
});

remindersRouter.post("/:id/cancel", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const cancelled = cancelReminder(id);
  if (!cancelled) {
    res.status(404).json({
      error: "Reminder not found or not pending",
    });
    return;
  }

  res.json(cancelled);
});
