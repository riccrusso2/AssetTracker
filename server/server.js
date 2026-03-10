const path = require("path");
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

// Serve i file statici del frontend React
app.use(express.static(path.join(__dirname, "../build")));

app.get("/api/quote", async (req, res) => {
  const isin = req.query.isin;
  if (!isin) return res.status(400).json({ error: "Missing ISIN" });

  const url = `https://www.justetf.com/api/etfs/${isin}/quote?locale=it&currency=EUR&isin=${isin}`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
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

// Tutte le altre richieste servono index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../build", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
