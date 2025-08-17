// server/server.js
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// ===== Endpoint per ottenere la quotazione da JustETF =====
app.get("/api/quote", async (req, res) => {
  const isin = req.query.isin;
  if (!isin) return res.status(400).json({ error: "Missing ISIN" });

  const url = `https://www.justetf.com/api/etfs/${isin}/quote?locale=it&currency=EUR&isin=${isin}`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0", // evita blocchi da parte di JustETF
        Accept: "application/json",
      },
    });
    if (!r.ok) throw new Error(`JustETF API error: ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Servi i file statici della build React
app.use(express.static(path.join(__dirname, "../client/build")));

// Tutte le altre richieste restituiscono index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/build", "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
