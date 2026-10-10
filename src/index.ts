import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { remindersRouter } from "./routes/reminders.js";
import { visaRouter } from "./routes/visa.js";
import { startScheduler } from "./scheduler.js";
import { startBot } from "./telegram/bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

initDb();

const app = express();

app.use(express.json());

app.use("/api/reminders", remindersRouter);
app.use("/api/visa", visaRouter);
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, tz: config.tz });
});

startBot();
startScheduler();

app.listen(config.port, () => {
  console.log(`Reminder assistant listening on http://localhost:${config.port}`);
  console.log(`Timezone: ${config.tz}`);
});
