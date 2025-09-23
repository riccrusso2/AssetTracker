// app.js
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  LabelList,
} from "recharts";
import {
  RefreshCw,
  Plus,
  TrendingUp,
  TrendingDown,
  PieChart as PieChartIcon,
  BarChart2,
  LineChart as LineChartIcon,
  Target,
  Info,
  Trash2,
} from "lucide-react";
import "./styles.css";

// --- Utility helpers ---
const LS_ASSETS = "pf.assets.v4";
const LS_HISTORY = "pf.history.v4"; // [{t: ISO, v: number}]

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

function PerfBadge({ value }) {
  const positive = value >= 0;
  return (
    <span
      className={`px-2 py-1 rounded text-sm font-semibold ${
        positive ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
      }`}
    >
      {value.toFixed(2)}%
    </span>
  );
}

function isMaybeISIN(v) {
  return /^[A-Z0-9]{12}$/i.test((v || "").trim());
}

function formatCurrency(n, currency = "EUR") {
  if (n == null || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

// Funzione di simulazione
function simulateGrowth(initialValue: number, monthlyBudget: number, annualRate: number, years: number) {
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  let value = initialValue;
  const data = [];

  for (let month = 0; month <= years * 12; month++) {
    if (month > 0) {
      value = (value + monthlyBudget) * (1 + monthlyRate);
    }
    data.push({
      month,
      year: Math.floor(month / 12),
      value,
    });
  }

  return data;
}


function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// --- Component ---
export default function PortfolioDashboard() {


   const [assets, setAssets] = useState(() => {
  try {
    const fromLS = localStorage.getItem(LS_ASSETS);
    if (fromLS) {
      const parsed = JSON.parse(fromLS);
      // Se è un array con almeno 1 elemento → lo uso
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error("Errore parsing localStorage:", e);
  }

  // fallback: lista iniziale di asset
  return [
      {
        id: "ftseallworld",
        name: "FTSE All-World USD (Acc)",
        identifier: "IE00BK5BQT80",
        quantity: 58.02327,
        currency: "",
        costBasis: 132.05,
        targetWeight: 75,
        lastPrice: null,
        lastUpdated: null,
        assetClass: "ETF", 
      },
      {
        id: "coremsciemimi",
        name: "Core MSCI EM IMI USD (Acc)",
        identifier: "IE00BKM4GZ66",
        quantity: 8.108108,
        currency: "",
        costBasis: 37.12,
        targetWeight: 4 ,
        lastPrice: null,
        lastUpdated: null,
        assetClass: "ETF", 
      },
      {
        id: "gold",
        name: "Physical Gold USD (Acc)",
        identifier: "IE00B4ND3602",
        quantity:16.8364,
        currency: "",
        costBasis: 54.88,
        targetWeight: 10,
        lastPrice: null,
        lastUpdated: null,
        assetClass: "Commodity",
        
      },
      {
        id: "bitcoin",
        name: "Bitcoin",
        identifier: "BTC", // non ha ISIN
        ticker: "BTC", // useremo questo per fetch separato
        quantity: 0.004131, // esempio, cambia con il tuo
        currency: "",
        costBasis: 95481.04 , // prezzo medio di carico
        targetWeight: 4, // obiettivo percentuale
        lastPrice: null,
        lastUpdated: null,
        assetClass: "Crypto",
      },
    {
        id: "uranium",
        name: "Uranium And Nuclear Technologies USD (Acc)",
        identifier: "IE000M7V94E1",
        quantity: 5.104352,
        currency: "",
        costBasis: 29.68 ,
        targetWeight: 1,
        lastPrice: null,
        lastUpdated: null,
      assetClass: "ETF", 
      },
    {
        id: "quantum",
        name: "VanEck Quantum Computing UCITS ETF A",
        identifier: "IE0007Y8Y157",
        quantity: 11.737449,
        currency: "",
        costBasis: 20.62,
        targetWeight: 1,
        lastPrice: null,
        lastUpdated: null,
      assetClass: "ETF", 
      },
    {
    id: "eqt-nexus",
    name: "EQT Nexus ELTIF",
    identifier: "LU3176111881",
    quantity: 0, // o quante quote hai
    currency: "",
    costBasis: 0,
    targetWeight: 2.5, // puoi metterlo al valore desiderato
    lastPrice: 0, // inizialmente uguale al costo di carico
    lastUpdated: null,
    assetClass: "Private equity",
    manual: true, // 🔹 flag custom per saltare fetch
  },
  {
    id: "apollo-global",
    name: "Apollo Global Private Markets ELTIF",
    identifier: "LU3170240538",
    quantity: 0,
    currency: "",
    costBasis: 0,
    targetWeight: 2.5,
    lastPrice: 0,
    lastUpdated: null,
    assetClass: "Private equity",
    manual: true, // 🔹 flag custom per saltare fetch
  },
    ];
  });

  const [history, setHistory] = useState(() => {
    const fromLS = localStorage.getItem(LS_HISTORY);
    return fromLS ? JSON.parse(fromLS) : [];
  });

  const [form, setForm] = useState({
    name: "",
    identifier: "", // ISIN
    quantity: "",
    costBasis: "",
    targetWeight: "",
  });
  const [loadingIds, setLoadingIds] = useState({});
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const [startup, setStartup] = useState(() => {
  const fromLS = localStorage.getItem("pf.startup.v1");
  return fromLS ? JSON.parse(fromLS) : [
    // esempio iniziale
    { id: cryptoRandomId(), name: "Rhyde 2.0", invested: 248, fee: 19.84 },
    { id: cryptoRandomId(), name: "Hymalaia", invested: 300, fee: 24 },
    { id: cryptoRandomId(), name: "Favikon", invested: 300, fee: 24 },
    { id: cryptoRandomId(), name: "Orbital Paradigm", invested: 300, fee: 24 },
  ];
});
    // [QUI puoi copiare le sezioni "rebalance", "pieData", "barData", "lineData" e JSX dal tuo file attuale]
    const totalEquityValue = assets.reduce(
  (acc, a) => acc + (a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0),
  0
);
const totalPEValue = startup.reduce((acc, p) => acc + (p.invested || 0), 0);
  const MONTHLY_BUDGET = 2500; // € da investire ogni mese
  const totalCash = 10000; // esempio, la liquidità totale
  


 // --- Derived stats ---
const totals = useMemo(() => {
  let totalValue = 0;
  let totalCost = 0;

  assets.forEach((a) => {
    if (a.lastPrice && a.quantity) {
      totalValue += a.lastPrice * a.quantity;
    }
    if (a.costBasis && a.quantity) {
      totalCost += a.costBasis * a.quantity;
    }
  });

  const totalReturn = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0;

  const perfArr = assets
    .filter((a) => a.lastPrice && a.costBasis)
    .map((a) => ({
      id: a.id,
      name: a.name,
      perf: (a.lastPrice - a.costBasis) / a.costBasis,
    }));

  let best = null;
  let worst = null;
  if (perfArr.length) {
    best = perfArr.reduce((p, c) => (c.perf > p.perf ? c : p));
    worst = perfArr.reduce((p, c) => (c.perf < p.perf ? c : p));
  }

  return { totalValue, totalCost, totalReturn, best, worst };
}, [assets]);


// 1. Distribuzione per asset class
const classDistribution = useMemo(() => {
  const map = {};
  assets.forEach((a) => {
    const value = a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0;
    if (value > 0) {
      map[a.assetClass] = (map[a.assetClass] || 0) + value;
    }
  });
  return Object.entries(map).map(([name, value]) => ({
    name,
    value: round2(value),
  }));
}, [assets]);

// 2. Asset class + startup
const classWithStartup = useMemo(() => {
  const base = [...classDistribution];
  if (totalPEValue > 0) {
    base.push({ name: "Startup", value: round2(totalPEValue) });
  }
  return base;
}, [classDistribution, totalPEValue]);

// 3. Asset class + startup + liquidità
const classWithStartupAndCash = useMemo(() => {
  const base = [...classWithStartup];
  if (totalCash > 0) {
    base.push({ name: "Liquidità", value: round2(totalCash) });
  }
  return base;
}, [classWithStartup, totalCash]);

const returns = history.map((h, i) =>
  i === 0 ? 0 : (h.v - history[i - 1].v) / history[i - 1].v
);

const contributions = assets.map((a) => {
  const contrib =
    a.lastPrice && a.costBasis ? (a.lastPrice - a.costBasis) * a.quantity : 0;
  return { name: a.name, value: contrib };
});


  const weights = useMemo(() => {
    const tv = totals.totalValue || 0;
    return assets.map((a) => {
      const value = a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0;
      const weight = tv > 0 ? (value / tv) * 100 : 0;
      return {
        id: a.id,
        name: a.name,
        value,
        weight,
        target: a.targetWeight || 0,
      };
    });
  }, [assets, totals.totalValue]);

  // --- Persist state ---
  useEffect(() => {
    localStorage.setItem(LS_ASSETS, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem(LS_HISTORY, JSON.stringify(history));
  }, [history]);

  // --- Fetch prezzo da JustETF ---
  const fetchPriceForAsset = useCallback(async (asset) => {
    setLoadingIds((s) => ({ ...s, [asset.id]: true }));
    setError(null);

    try {
      if (asset.manual) {
  // asset aggiornato solo manualmente
  return { price: asset.lastPrice, currency: "EUR", lastUpdated: Date.now() };
}
      if (asset.ticker === "BTC") {
        // fetch da un API cripto, esempio CoinGecko
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur`
        );
        if (!res.ok) throw new Error(`Quote fetch failed: ${res.status}`);
        const data = await res.json();
        return {
          price: data.bitcoin.eur,
          currency: "",
          lastUpdated: Date.now(),
        };
      }

      const isin = asset.identifier?.trim();
      if (!isMaybeISIN(isin)) {
        throw new Error(`Identificatore non valido (serve un ISIN): ${isin}`);
      }

      const res = await fetch(`/api/quote?isin=${encodeURIComponent(isin)}`);
      if (!res.ok) throw new Error(`Quote fetch failed: ${res.status}`);
      const data = await res.json();

      if (!data.latestQuote?.raw) {
        throw new Error(`Nessun dato per ISIN ${isin}`);
      }

      return {
        price: parseFloat(data.latestQuote.raw),
        currency: "EUR",
        lastUpdated: Date.now(),
      };
    } catch (e) {
      setError(e.message);
      return { price: null };
    } finally {
      setLoadingIds((s) => {
        const copy = { ...s };
        delete copy[asset.id];
        return copy;
      });
    }
  }, []);

  const assetsRef = useRef(assets);
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  const fetchAllPrices = useCallback(async () => {
    const updated = await Promise.all(
      (assetsRef.current || []).map(async (a) => {
        const res = await fetchPriceForAsset(a);
        if (res.price !== null) {
          return {
            ...a,
            lastPrice: res.price,
            lastUpdated: new Date().toISOString(),
          };
        }
        return a;
      })
    );

    setAssets(updated);

    const totalNow = updated.reduce(
      (acc, a) => acc + (a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0),
      0
    );
    setHistory((h) =>
      [...h, { t: new Date().toISOString(), v: round2(totalNow) }].slice(-500)
    );
  }, [fetchPriceForAsset]);

  useEffect(() => {
    fetchAllPrices();
    intervalRef.current = setInterval(fetchAllPrices, 900000); // 15 min
    return () => clearInterval(intervalRef.current);
  }, [fetchAllPrices]);



const allocationData = [
  { name: "Azioni", value: totalEquityValue },
  { name: "startup", value: totalPEValue },
];

  // --- Handlers ---
  const handleAddOrUpdate = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const identifier = form.identifier.trim(); // ISIN
    const quantity = parseFloat(form.quantity);
    const costBasis = parseFloat(form.costBasis);
    const targetWeight = parseFloat(form.targetWeight);

    if (!name || !identifier || isNaN(quantity)) {
      setError("Inserisci Nome, ISIN e quantità valide.");
      return;
    }

    setError(null);

    setAssets((s) => {
      const idx = s.findIndex(
        (a) => a.identifier.toUpperCase() === identifier.toUpperCase()
      );
      if (idx !== -1) {
        const copy = [...s];
        copy[idx] = {
          ...copy[idx],
          name,
          quantity,
          costBasis: isNaN(costBasis) ? copy[idx].costBasis || null : costBasis,
          targetWeight: isNaN(targetWeight)
            ? copy[idx].targetWeight || 0
            : targetWeight,
        };
        return copy;
      }
      return [
        ...s,
        {
          id: cryptoRandomId(),
          name,
          identifier,
          quantity,
          currency: "EUR",
          costBasis: isNaN(costBasis) ? null : costBasis,
          targetWeight: isNaN(targetWeight) ? 0 : targetWeight,
          lastPrice: null,
          lastUpdated: null,
        },
      ];
    });

    setForm({
      name: "",
      identifier: "",
      quantity: "",
      costBasis: "",
      targetWeight: "",
    });
  };

  const handleDelete = (id) => {
    setAssets((s) => s.filter((a) => a.id !== id));
  };

  const handleManualRefresh = async (id) => {
    const asset = assets.find((a) => a.id === id);
    if (!asset) return;
    const res = await fetchPriceForAsset(asset);
    if (res.price !== null) {
      setAssets((s) =>
        s.map((it) =>
          it.id === id
            ? {
                ...it,
                lastPrice: res.price,
                lastUpdated: new Date().toISOString(),
              }
            : it
        )
      );
    }
  };



  // --- Rebalancing suggestions ---
  const rebalance = useMemo(() => {
  const tv = totals.totalValue || 0;
  if (tv <= 0) return { actions: [], diffSummary: [], monthlyBudget: MONTHLY_BUDGET };

  // Normalizza target a 100
  const sumTarget = assets.reduce((acc, a) => acc + (a.targetWeight || 0), 0) || 0;
  const normFactor = sumTarget > 0 ? 100 / sumTarget : 1;

  // Calcolo stato attuale vs target
  const actions = assets.map((a) => {
    const currentValue = (a.lastPrice || 0) * (a.quantity || 0);
    const currentWeight = tv > 0 ? (currentValue / tv) * 100 : 0;
    const targetW = (a.targetWeight || 0) * normFactor; // %
    const targetValue = (targetW / 100) * tv;
    const deltaValue = targetValue - currentValue; // + da comprare, - sovrappeso
    const qty = a.lastPrice ? deltaValue / a.lastPrice : 0;
    return {
      id: a.id,
      name: a.name,
      identifier: a.identifier,
      currentWeight,
      targetWeight: targetW,
      deltaValue,
      qty,
      lastPrice: a.lastPrice,
    };
  });

  // Piano PAC mensile: no-sell, delta-aware
  const baseAlloc = assets.map(
    (a) => ((a.targetWeight || 0) * normFactor / 100) * MONTHLY_BUDGET
  );
  const deltas = actions.map((x) => x.deltaValue);
  const underIdx = deltas.map((d, i) => (d > 0 ? i : -1)).filter((i) => i !== -1);

  let buy = baseAlloc.slice();

  if (underIdx.length > 0) {
    // 1) Clamp sovrappesi a 0, raccogli "freed" da redistribuire
    let freed = 0;
    buy = buy.map((amt, i) => {
      if (deltas[i] <= 0) {
        freed += amt;
        return 0;
      }
      return amt;
    });

    // 2) Redistribuisci il freed in proporzione ai Δ positivi
    const sumPos = underIdx.reduce((acc, i) => acc + deltas[i], 0);
    if (sumPos > 0) {
      buy = buy.map((amt, i) => (deltas[i] > 0 ? amt + (freed * (deltas[i] / sumPos)) : amt));
    }

    // 3) Cap: non superare il Δ dell’asset; redistribuzione iterativa dell’avanzo
    let leftover = 0;
    buy = buy.map((amt, i) => {
      if (deltas[i] > 0 && amt > deltas[i]) {
        leftover += amt - deltas[i];
        return deltas[i];
      }
      return amt;
    });

    let guard = 0;
    while (leftover > 0.01 && guard < 8) {
      guard++;
      const room = buy.map((amt, i) => (deltas[i] > 0 ? Math.max(0, deltas[i] - amt) : 0));
      const roomTotal = room.reduce((a, b) => a + b, 0);
      if (roomTotal <= 0) break;
      buy = buy.map((amt, i) =>
        deltas[i] > 0 ? Math.min(deltas[i], amt + (leftover * (room[i] / roomTotal))) : amt
      );
      const spent = buy.reduce((acc, amt, i) => acc + (deltas[i] > 0 ? amt : 0), 0);
      leftover = Math.max(0, MONTHLY_BUDGET - spent);
    }

    // 4) Se abbiamo coperto tutti i Δ ma resta budget, torna ai pesi target
    const sumBuy = buy.reduce((a, b) => a + b, 0);
    if (MONTHLY_BUDGET - sumBuy > 0.01) {
      const baseTotal = baseAlloc.reduce((a, b) => a + b, 0) || 1;
      buy = buy.map((amt, i) => amt + ((MONTHLY_BUDGET - sumBuy) * (baseAlloc[i] / baseTotal)));
    }
  } else {
    // Nessun sottopeso: compra per target puro
    buy = baseAlloc;
  }

  // Arrotonda e derivare quantità
  const actionsWithPlan = actions.map((x, i) => {
    const monthlyBuyEUR = round2(Math.max(0, buy[i] || 0));
    const monthlyQty = x.lastPrice ? round2(monthlyBuyEUR / x.lastPrice) : null;
    return { ...x, monthlyBuyEUR, monthlyQty };
  });

  const diffSummary = actionsWithPlan.map((x) => ({
    name: x.name,
    deltaValue: x.deltaValue,
    qty: x.qty,
    monthlyBuyEUR: x.monthlyBuyEUR,
  }));

  return { actions: actionsWithPlan, diffSummary, monthlyBudget: MONTHLY_BUDGET };
}, [assets, totals.totalValue]);


  // --- Charts data ---
  const pieData = useMemo(
    () => weights.map((w) => ({ name: w.name, value: round2(w.weight) })),
    [weights]
  );

  const barData = useMemo(
    () =>
      assets.map((a) => ({
        name: a.name,
        performance:
          a.costBasis && a.lastPrice
            ? round2(((a.lastPrice - a.costBasis) / a.costBasis) * 100)
            : 0,
      })),
    [assets]
  );

  const lineData = useMemo(
    () =>
      history.map((h) => ({
        time: new Date(h.t).toLocaleTimeString(),
        value: h.v,
      })),
    [history]
  );

  // Mappa dei nomi completi agli acronimi
  const acronyms = {
    "FTSE All-World USD (Acc)": "FTSE AW",
    "Core MSCI EM IMI USD (Acc)": "MSCI EM",
    "Physical Gold USD (Acc)": "GOLD",
    "Uranium And Nuclear Technologies USD (Acc)": "URANIUM",
    Bitcoin: "BTC",
    "VanEck Quantum Computing UCITS ETF A" : "QUANTUM"
    
  };

  // Palette per il Pie (opzionale, ma garantiamo differenze visuali; se non vuoi colori espliciti, rimuovi "fill" da <Cell>)
  const COLORS = [
    "#2563eb",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#14b8a6",
    "#f97316",
    "#22c55e",
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Dashboard Portafoglio — Monitoraggio & Ribilanciamento
          </h1>
          <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
            <Info className="w-4 h-4" /> Aggiornamento automatico ogni 15s
          </p>
        </div>
        {/* Nuovo bottone refresh globale */}
        <button
          onClick={fetchAllPrices}
          className="bg-white text-sky-600 font-semibold px-4 py-2 rounded-2xl inline-flex items-center gap-2 
             shadow-[4px_4px_8px_rgba(0,0,0,0.06),-4px_-4px_8px_rgba(255,255,255,0.8)]
             hover:shadow-[2px_2px_4px_rgba(0,0,0,0.08),-2px_-2px_4px_rgba(255,255,255,0.9)]
             transition-shadow duration-150"
        >
          <RefreshCw className="w-4 h-4" /> Aggiorna tutti i prezzi
        </button>
      </header>

      {/* Tabella asset */}
      <section className="bg-white p-4 rounded-2xl shadow">
        <h2 className="font-semibold mb-4">Asset nel portafoglio</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b">
                <th className="py-2 px-3 text-left">Nome</th>
                <th className="px-3 text-left">Ticker/ISIN</th>
                <th className="px-3 text-right">Prezzo unitario</th>
                <th className="px-3 text-right">Valore attuale</th>
                <th className="px-3 text-right">Perf. €</th>
                <th className="px-3 text-center">Perf. %</th>
                <th className="px-3 text-center">Peso attuale</th>
                <th className="px-3 text-right">Asset Class</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => {
                const value = a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0;
                const perfEuro =
                  a.costBasis && a.lastPrice
                    ? (a.lastPrice - a.costBasis) * (a.quantity || 0)
                    : 0;
                const perfPct =
                  a.costBasis && a.lastPrice
                    ? ((a.lastPrice - a.costBasis) / a.costBasis) * 100
                    : 0;
                const weight = weights.find((item) => item.id === a.id)?.weight || 0;

                return (
                  <tr
                    key={a.id}
                    className={`border-b ${
                      i % 2 === 0 ? "bg-white" : "bg-gray-50"
                    } hover:bg-gray-100`}
                  >
                    <td className="py-2 px-3 font-medium">{a.name}</td>
                    <td className="px-3 text-gray-500">{a.identifier}</td>
                  
                    {/* Prezzo unitario */}
                    <td className="px-3 text-right">
                      {loadingIds[a.id]
                        ? "↻"
                        : a.lastPrice !== null
                        ? `${formatCurrency(a.lastPrice)} ${a.currency || ""}`
                        : "—"}
                    </td>
                  
                    {/* Valore attuale */}
                    <td className="px-3 text-right">
                      {formatCurrency(value)}
                    </td>
                  
                    {/* Perf. € con colore condizionale */}
                    <td
                      className={`px-3 text-right ${
                        perfEuro >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {perfEuro >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(perfEuro))}
                    </td>
                  
                    {/* Perf. % */}
                    <td className="px-3 text-center">
                      <PerfBadge value={perfPct} />
                    </td>
                  
                    {/* Peso */}
                    <td className="px-3 text-center">{weight.toFixed(2)}%</td>
                  
                    {/* Asset Class */}
                    <td className="px-3 text-center">{a.assetClass}</td>
                  </tr>

                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white p-4 rounded-2xl shadow">
  <h2 className="font-semibold mb-4">Investimenti startup</h2>
  <div className="overflow-x-auto">
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-gray-50 text-gray-600 border-b">
          <th className="py-2 px-3 text-left">Nome startup</th>
          <th className="px-3 text-right">Commissioni</th>
          <th className="px-3 text-right">Importo investito</th>
        </tr>
      </thead>
      <tbody>
        {startup.map((p, i) => (
          <tr
            key={p.id}
            className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}
          >
            <td className="py-2 px-3 font-medium">{p.name}</td>
            <td className="px-3 text-right">{formatCurrency(p.fee)}</td>
            <td className="px-3 text-right">{formatCurrency(p.invested)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</section>



      {/* Statistiche automatiche */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Migliore performance
          </h3>
          {totals.best ? (
            <div>
              <div className="text-lg font-semibold">{totals.best.name}</div>
              <div className="text-green-600">
                {(totals.best.perf * 100).toFixed(2)}%
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Dati insufficienti</div>
          )}
        </div>
        <div className="bg-white p-4 rounded-2xl shadow">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <TrendingDown className="w-5 h-5" /> Peggiore performance
          </h3>
          {totals.worst ? (
            <div>
              <div className="text-lg font-semibold">{totals.worst.name}</div>
              <div
                className={
                  totals.worst.perf >= 0 ? "text-green-600" : "text-red-600"
                }
              >
                {(totals.worst.perf * 100).toFixed(2)}%
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Dati insufficienti</div>
          )}
        </div>
        <div className="bg-white p-4 rounded-2xl shadow">
  <h3 className="font-semibold mb-2 flex items-center gap-2">
    <Target className="w-5 h-5" /> Rendimento portafoglio
  </h3>
  <div
    className={`text-3xl font-bold ${
      totals.totalReturn >= 0 ? "text-green-600" : "text-red-600"
    }`}
  >
    {(totals.totalReturn * 100).toFixed(2)}%
  </div>
  <div className="mt-2 text-sm space-y-1">
    <div>
      <span className="text-gray-500">Capitale investito: </span>
      <span className="font-semibold">{formatCurrency(totals.totalCost)}</span>
    </div>
    <div>
      <span className="text-gray-500">Valore attuale: </span>
      <span className="font-semibold">{formatCurrency(totals.totalValue)}</span>
    </div>
  </div>
</div>
</section>


      {/* Grafici */}

<section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow">
  <h3 className="font-semibold mb-2 flex items-center gap-2">
    <PieChartIcon className="w-5 h-5" /> Distribuzione per Asset Class
  </h3>
  <div className="h-72">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={classDistribution}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={110}
          label={(d) => d.name}
        >
          {classDistribution.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <ReTooltip formatter={(v, name) => [`${round2((v / totals.totalValue) * 100)}%`, name]} />
      </PieChart>
    </ResponsiveContainer>
  </div>
</div>

        <div className="bg-white p-4 rounded-2xl shadow">
  <h3 className="font-semibold mb-2 flex items-center gap-2">
    <PieChartIcon className="w-5 h-5" /> Distribuzione per Asset Class + Startup
  </h3>
  <div className="h-72">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={classWithStartup}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={110}
          label={(d) => d.name}
        >
          {classWithStartup.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <ReTooltip formatter={(v, name) => [`${round2((v / (totals.totalValue + totalPEValue)) * 100)}%`, name]} />
      </PieChart>
    </ResponsiveContainer>
  </div>
</div>

    <div className="bg-white p-4 rounded-2xl shadow">
  <h3 className="font-semibold mb-2 flex items-center gap-2">
    <PieChartIcon className="w-5 h-5" /> Distribuzione per Asset Class + Startup + Liquidità
  </h3>
  <div className="h-72">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={classWithStartupAndCash}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={110}
          label={(d) => d.name}
        >
          {classWithStartupAndCash.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <ReTooltip formatter={(v, name) => [
          `${round2((v / (totals.totalValue + totalPEValue + totalCash)) * 100)}%`, name
        ]} />
      </PieChart>
    </ResponsiveContainer>
  </div>
</div>


          </section>


      {/* Suggerimenti per ribilanciamento */}
      <section className="bg-white p-4 rounded-2xl shadow">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Target className="w-5 h-5" /> Suggerimenti di ribilanciamento
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-sm text-gray-500 border-b">
                <th className="py-2">Asset</th>
                <th>Attuale %</th>
                <th>Target % (normalizzato)</th>
                <th>Delta valore</th>
                <th>Quantità stimata</th>
                <th className="text-right">Acquisto mese</th>
              </tr>
            </thead>
            <tbody>
              {rebalance.actions.map((x) => (
                <tr key={x.id} className="border-b">
                  <td className="py-2">{x.name}</td>
                  <td>{x.currentWeight.toFixed(2)}%</td>
                  <td>{x.targetWeight.toFixed(2)}%</td>
                  <td
                    className={
                      x.deltaValue >= 0 ? "text-green-600" : "text-red-600"
                    }
                  >
                    {formatCurrency(x.deltaValue)}
                  </td>
                  <td>{x.qty.toFixed(4)}</td>
                  <td className="text-right text-green-600">
                    {formatCurrency(x.monthlyBuyEUR)}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Nota: il target % viene normalizzato per sommare a 100%. Le quantità
          sono stime basate sugli ultimi prezzi e non includono commissioni o
          slippage.
        </p>
      </section>
    </div>

<section className="bg-white p-4 rounded-2xl shadow">
  <h2 className="font-semibold mb-4">Simulazioni di crescita</h2>
  <ResponsiveContainer width="100%" height={300}>
    <LineChart
      data={simulateGrowth(
        totals.totalValue + totalPEValue + totalCash, 
        MONTHLY_BUDGET, 
        0.05, // 5% annuo (modificabile)
        10     // 10 anni
      )}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="month" tickFormatter={(m) => `${Math.floor(m/12)}y`} />
      <YAxis tickFormatter={(v) => formatCurrency(v)} />
      <Tooltip formatter={(v) => formatCurrency(v as number)} />
      <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>
</section>

  );
}
