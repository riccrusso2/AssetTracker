const path = require("path");
const fs   = require("fs");
const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

// ── Data directory ────────────────────────────────────────────
const DATA_DIR       = path.join(__dirname, "../data");
const SNAPSHOTS_FILE = path.join(DATA_DIR, "snapshots.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SNAPSHOTS_FILE)) fs.writeFileSync(SNAPSHOTS_FILE, "[]");

function readSnapshots() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOTS_FILE, "utf8")); }
  catch { return []; }
}

function writeSnapshots(data) {
  fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(data, null, 2));
}

// ── JustETF price endpoint ────────────────────────────────────
app.get("/api/quote", async (req, res) => {
  const isin = req.query.isin;
  if (!isin) return res.status(400).json({ error: "Missing ISIN" });

  const url = `https://www.justetf.com/api/etfs/${isin}/quote?locale=it&currency=EUR&isin=${isin}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`JustETF API error: ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/snapshots ────────────────────────────────────────
app.get("/api/snapshots", (req, res) => {
  try { res.json(readSnapshots()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/snapshot ────────────────────────────────────────
app.post("/api/snapshot", (req, res) => {
  try {
    const snap = req.body;
    if (!snap || !snap.label || !snap.assets)
      return res.status(400).json({ error: "Dati snapshot non validi" });

    const snapshots = readSnapshots();
    const existing  = snapshots.findIndex(
      (s) => s.month === snap.month && s.year === snap.year
    );
    const entry = { ...snap, savedAt: new Date().toISOString() };

    if (existing >= 0) snapshots[existing] = entry;
    else snapshots.push(entry);

    snapshots.sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );

    writeSnapshots(snapshots);
    res.json({ ok: true, total: snapshots.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/snapshot/:label ───────────────────────────────
app.delete("/api/snapshot/:label", (req, res) => {
  try {
    const label     = decodeURIComponent(req.params.label);
    const snapshots = readSnapshots().filter((s) => s.label !== label);
    writeSnapshots(snapshots);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/snapshots/all ─────────────────────────────────
app.delete("/api/snapshots/all", (req, res) => {
  try {
    writeSnapshots([]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve React frontend ──────────────────────────────────────
app.use(express.static(path.join(__dirname, "../build")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../build", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
