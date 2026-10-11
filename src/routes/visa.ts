import { Router } from "express";
import {
  createVisaDocument,
  deleteVisaDocument,
  getVisaDigestSchedule,
  getVisaDocumentById,
  listVisaDocuments,
  setVisaDigestSchedule,
  setVisaDocumentDone,
  updateVisaDocumentDates,
} from "../db.js";
import { sendVisaDigestNow } from "../visa-digest.js";

export const visaRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

visaRouter.get("/schedule", (_req, res) => {
  res.json(getVisaDigestSchedule());
});

visaRouter.put("/schedule", (req, res) => {
  const days = req.body?.days;
  const times = req.body?.times;

  if (!Array.isArray(days) || !Array.isArray(times)) {
    res.status(400).json({ error: "days and times arrays are required" });
    return;
  }

  try {
    const schedule = setVisaDigestSchedule({ days, times });
    res.json(schedule);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

visaRouter.post("/schedule/test", async (_req, res) => {
  try {
    const result = await sendVisaDigestNow({ test: true });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: message });
  }
});

function parseDateField(
  raw: unknown,
  field: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === "") {
    return { ok: true, value: null };
  }
  const value = String(raw).trim();
  if (!DATE_RE.test(value)) {
    return { ok: false, error: `${field} must be YYYY-MM-DD` };
  }
  return { ok: true, value };
}

visaRouter.get("/", (_req, res) => {
  res.json(listVisaDocuments());
});

visaRouter.post("/", (req, res) => {
  const title = String(req.body?.title ?? "").trim();

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  let startDate: string | null = null;
  if (req.body?.startDate !== undefined) {
    const parsed = parseDateField(req.body.startDate, "startDate");
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    startDate = parsed.value;
  }

  let dueDate: string | null = null;
  if (req.body?.dueDate !== undefined) {
    const parsed = parseDateField(req.body.dueDate, "dueDate");
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    dueDate = parsed.value;
  }

  if (startDate && dueDate && startDate > dueDate) {
    res.status(400).json({ error: "startDate must be on or before dueDate" });
    return;
  }

  const doc = createVisaDocument({ title, startDate, dueDate });
  res.status(201).json(doc);
});

visaRouter.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const hasDone = typeof req.body?.done === "boolean";
  const hasStart = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    "startDate"
  );
  const hasDue = Object.prototype.hasOwnProperty.call(
    req.body ?? {},
    "dueDate"
  );

  if (!hasDone && !hasStart && !hasDue) {
    res.status(400).json({
      error: "Provide done and/or startDate and/or dueDate",
    });
    return;
  }

  if (!getVisaDocumentById(id)) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  if (hasDone) {
    setVisaDocumentDone(id, req.body.done);
  }

  if (hasStart || hasDue) {
    const current = getVisaDocumentById(id)!;

    let startDate = current.start_date;
    let dueDate = current.due_date;

    if (hasStart) {
      const parsed = parseDateField(req.body.startDate, "startDate");
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      startDate = parsed.value;
    }

    if (hasDue) {
      const parsed = parseDateField(req.body.dueDate, "dueDate");
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      dueDate = parsed.value;
    }

    if (startDate && dueDate && startDate > dueDate) {
      res.status(400).json({ error: "startDate must be on or before dueDate" });
      return;
    }

    try {
      updateVisaDocumentDates(id, { startDate, dueDate });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
      return;
    }
  }

  res.json(getVisaDocumentById(id));
});

visaRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = deleteVisaDocument(id);
  if (!deleted) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.status(204).send();
});
