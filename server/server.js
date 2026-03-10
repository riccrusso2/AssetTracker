const path = require("path");
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

// Serve i file statici del frontend React
app.use(express.static(path.join(__dirname, "../build")));

// ===== Quotazione attuale =====
app.get("/api/quote", async (req, res) => {
  const isin = req.query.isin;
  if (!isin) return res.status(400).json({ error: "Missing ISIN" });

  const url = `https://www.justetf.com/api/etfs/${isin}/quote?locale=it&currency=EUR&isin=${isin}`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        Referer: "https://www.justetf.com/",
      },
    });
    if (!r.ok) throw new Error(`JustETF API error: ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Storico prezzi =====
// range: 1m | 3m | 6m | 1y | 3y | 5y
app.get("/api/history", async (req, res) => {
  const { isin, range } = req.query;
  if (!isin) return res.status(400).json({ error: "Missing ISIN" });

  const rangeMap = { "1m": 30, "3m": 90, "6m": 180, "1y": 365, "3y": 1095, "5y": 1825 };
  const days = rangeMap[range] || 365;

  const endDate   = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const url = `https://www.justetf.com/api/etfs/${isin}/performance-chart?locale=it&currency=EUR&isin=${isin}&startDate=${startDate}&endDate=${endDate}`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
        "Accept-Language": "it-IT,it;q=0.9",
        Referer: `https://www.justetf.com/it/etf-profile.html?isin=${isin}`,
        Origin: "https://www.justetf.com",
      },
    });
    if (!r.ok) throw new Error(`JustETF history error: ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Fallback → index.html =====
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../build", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
