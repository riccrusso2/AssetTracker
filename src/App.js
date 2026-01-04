
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

// ==================== CONSTANTS ====================
const STORAGE_KEYS = {
  ASSETS: "pf.assets.v4",
  HISTORY: "pf.history.v4",
  STARTUP: "pf.startup.v1",
  PRIVATE_EQUITY: "pf.privateequity.v1",
};

const MONTHLY_BUDGET = 500;
const TOTAL_CASH = 10800;
const AUTO_REFRESH_INTERVAL = 900000; // 15 minutes

const DEFAULT_PROJECTION_YEARS = 10;
const DEFAULT_ANNUAL_RETURN = 7;
const DEFAULT_MONTHLY_CONTRIBUTION = 800;

const CHART_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#22c55e",
];

// ==================== UTILITY FUNCTIONS ====================
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const formatCurrency = (n, currency = "EUR") => {
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
};

const isMaybeISIN = (v) => /^[A-Z0-9]{12}$/i.test((v || "").trim());

const cryptoRandomId = () => Math.random().toString(36).slice(2, 10);

const getFromLocalStorage = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error(`Error parsing localStorage for ${key}:`, e);
  }
  return defaultValue;
};

const saveToLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving to localStorage for ${key}:`, e);
  }
};

// ==================== INITIAL DATA ====================
const getInitialAssets = () => [
  {
    id: "ftseallworld",
    name: "FTSE All-World USD",
    identifier: "IE00BK5BQT80",
    quantity: 96.164474,
    currency: "",
    costBasis: 135.73,
    targetWeight: 65,
    lastPrice: null,
    lastUpdated: null,
    assetClass: "ETF",
  },
  {
    id: "worldquality",
    name: "iShares Edge MSCI World Quality Factor UCITS ETF (Acc)",
    identifier: "IE00BP3QZ601",
    quantity: 22,
    currency: "",
    costBasis: 67.88818,
    targetWeight: 7,
    lastPrice: null,
    lastUpdated: null,
    assetClass: "ETF",
  },
  {
    id: "worldmomentum",
    name: "iShares Edge MSCI World Momentum Factor UCITS ETF (Acc)",
    identifier: "IE00BP3QZ825",
    quantity: 14,
    currency: "",
    costBasis: 83.075,
    targetWeight: 6,
    lastPrice: null,
    lastUpdated: null,
    assetClass: "ETF",
  },
  {
    id: "worldvalue",
    name: "iShares Edge MSCI World Value Factor UCITS ETF (Acc)",
    identifier: "IE00BP3QZB59",
    quantity: 23,
    currency: "",
    costBasis: 50.07434,
    targetWeight: 7,
    lastPrice: null,
    lastUpdated: null,
    assetClass: "ETF",
  },
  {
    id: "gold",
    name: "Physical Gold USD (Acc)",
    identifier: "IE00B4ND3602",
    quantity: 27.524299,
    currency: "",
    costBasis: 58.64,
    targetWeight: 10,
    lastPrice: null,
    lastUpdated: null,
    assetClass: "Commodity",
  },
  {
    id: "bitcoin",
    name: "Bitcoin",
    identifier: "XS2940466316",
    quantity: 87,
    currency: "",
    costBasis: 7.6274,
    targetWeight: 4,
    lastPrice: null,
    lastUpdated: null,
    assetClass: "Crypto",
  },
  {
    id: "quantum",
    name: "VanEck Quantum Computing UCITS ETF A",
    identifier: "IE0007Y8Y157",
    quantity: 15.939786,
    currency: "",
    costBasis: 21.0,
    targetWeight: 1,
    lastPrice: null,
    lastUpdated: null,
    assetClass: "ETF",
  },
];

const getInitialStartups = () => [
  { id: cryptoRandomId(), name: "Rhyde 2.0", invested: 248, fee: 19.84 },
  { id: cryptoRandomId(), name: "Hymalaia", invested: 300, fee: 24 },
  { id: cryptoRandomId(), name: "Favikon", invested: 300, fee: 24 },
  { id: cryptoRandomId(), name: "Orbital Paradigm", invested: 300, fee: 24 },
  { id: cryptoRandomId(), name: "Yasu", invested: 300, fee: 24 },
  { id: cryptoRandomId(), name: "Reental", invested: 300, fee: 24 },
  { id: cryptoRandomId(), name: "Fintower", invested: 300, fee: 24 },
  { id: cryptoRandomId(), name: "Epic Games", invested: 300, fee: 24 },
  { id: cryptoRandomId(), name: "Mega", invested: 300, fee: 24 },
];

const getInitialPrivateEquity = () => [
  {
    id: "eqt-nexus",
    name: "EQT Nexus ELTIF",
    identifier: "LU3176111881",
    costBasis: 500,
    lastPrice: 500,
    targetWeight: 0,
    assetClass: "Private equity",
    manual: true,
  },
  {
    id: "apollo-global",
    name: "Apollo Global Private Markets ELTIF",
    identifier: "LU3170240538",
    costBasis: 500,
    lastPrice: 500,
    targetWeight: 0,
    assetClass: "Private equity",
    manual: true,
  },
];

// ==================== COMPONENTS ====================
const PerfBadge = ({ value }) => {
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
};

// ==================== CUSTOM HOOKS ====================
const useLocalStorage = (key, initialValue) => {
  const [value, setValue] = useState(() =>
    getFromLocalStorage(key, initialValue)
  );

  useEffect(() => {
    saveToLocalStorage(key, value);
  }, [key, value]);

  return [value, setValue];
};

const usePriceFetcher = () => {
  const [loadingIds, setLoadingIds] = useState({});
  const [error, setError] = useState(null);

  const fetchPrice = useCallback(async (asset) => {
    setLoadingIds((s) => ({ ...s, [asset.id]: true }));
    setError(null);

    try {
      if (asset.manual) {
        return {
          price: asset.lastPrice,
          currency: "EUR",
          lastUpdated: Date.now(),
        };
      }

      if (asset.ticker === "BTCC") {
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
        throw new Error(`Invalid identifier (ISIN required): ${isin}`);
      }

      const res = await fetch(`/api/quote?isin=${encodeURIComponent(isin)}`);
      if (!res.ok) throw new Error(`Quote fetch failed: ${res.status}`);
      const data = await res.json();

      if (!data.latestQuote?.raw) {
        throw new Error(`No data for ISIN ${isin}`);
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

  return { fetchPrice, loadingIds, error };
};

// ==================== CALCULATIONS ====================
const calculateTotals = (assets) => {
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
};

const calculateWeights = (assets, totalValue) => {
  const tv = totalValue || 0;
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
};

const calculateClassDistribution = (assets) => {
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
};

const calculateProjection = (startValue, monthlyInvest, annualReturn, years) => {
  const monthlyRate = annualReturn / 100 / 12;
  const months = years * 12;
  const data = [];
  
  let currentValue = startValue;
  
  for (let month = 0; month <= months; month++) {
    if (month % 12 === 0) {
      data.push({
        year: month / 12,
        value: round2(currentValue),
      });
    }
    
    if (month < months) {
      currentValue = currentValue * (1 + monthlyRate) + monthlyInvest;
    }
  }
  
  return data;
};

const calculateRebalancing = (assets, totalValue, monthlyBudget) => {
  const tv = totalValue || 0;
  if (tv <= 0)
    return { actions: [], diffSummary: [], monthlyBudget };

  const sumTarget = assets.reduce((acc, a) => acc + (a.targetWeight || 0), 0) || 0;
  const normFactor = sumTarget > 0 ? 100 / sumTarget : 1;

  const actions = assets.map((a) => {
    const currentValue = (a.lastPrice || 0) * (a.quantity || 0);
    const currentWeight = tv > 0 ? (currentValue / tv) * 100 : 0;
    const targetW = (a.targetWeight || 0) * normFactor;
    const targetValue = (targetW / 100) * tv;
    const deltaValue = targetValue - currentValue;
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

  const baseAlloc = assets.map(
    (a) => (((a.targetWeight || 0) * normFactor) / 100) * monthlyBudget
  );
  const deltas = actions.map((x) => x.deltaValue);
  const underIdx = deltas
    .map((d, i) => (d > 0 ? i : -1))
    .filter((i) => i !== -1);

  let buy = baseAlloc.slice();

  if (underIdx.length > 0) {
    let freed = 0;
    buy = buy.map((amt, i) => {
      if (deltas[i] <= 0) {
        freed += amt;
        return 0;
      }
      return amt;
    });

    const sumPos = underIdx.reduce((acc, i) => acc + deltas[i], 0);
    if (sumPos > 0) {
      buy = buy.map((amt, i) =>
        deltas[i] > 0 ? amt + (freed * deltas[i]) / sumPos : amt
      );
    }

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
      const room = buy.map((amt, i) =>
        deltas[i] > 0 ? Math.max(0, deltas[i] - amt) : 0
      );
      const roomTotal = room.reduce((a, b) => a + b, 0);
      if (roomTotal <= 0) break;
      buy = buy.map((amt, i) =>
        deltas[i] > 0
          ? Math.min(deltas[i], amt + (leftover * room[i]) / roomTotal)
          : amt
      );
      const spent = buy.reduce(
        (acc, amt, i) => acc + (deltas[i] > 0 ? amt : 0),
        0
      );
      leftover = Math.max(0, monthlyBudget - spent);
    }

    const sumBuy = buy.reduce((a, b) => a + b, 0);
    if (monthlyBudget - sumBuy > 0.01) {
      const baseTotal = baseAlloc.reduce((a, b) => a + b, 0) || 1;
      buy = buy.map(
        (amt, i) => amt + ((monthlyBudget - sumBuy) * baseAlloc[i]) / baseTotal
      );
    }
  }

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

  return { actions: actionsWithPlan, diffSummary, monthlyBudget };
};

// ==================== MAIN COMPONENT ====================
export default function PortfolioDashboard() {
  const [projectionYears, setProjectionYears] = useState(DEFAULT_PROJECTION_YEARS);
  const [expectedReturn, setExpectedReturn] = useState(DEFAULT_ANNUAL_RETURN);
  const [monthlyContribution, setMonthlyContribution] = useState(DEFAULT_MONTHLY_CONTRIBUTION);

  const [assets, setAssets] = useLocalStorage(
    STORAGE_KEYS.ASSETS,
    getInitialAssets()
  );
  const [privateEquity, setPrivateEquity] = useLocalStorage(
    STORAGE_KEYS.PRIVATE_EQUITY,
    getInitialPrivateEquity()
  );
  const [startup, setStartup] = useLocalStorage(
    STORAGE_KEYS.STARTUP,
    getInitialStartups()
  );
  const [history, setHistory] = useLocalStorage(STORAGE_KEYS.HISTORY, []);

  const { fetchPrice, loadingIds, error } = usePriceFetcher();
  const intervalRef = useRef(null);
  const assetsRef = useRef(assets);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  const totals = useMemo(() => calculateTotals(assets), [assets]);
  const weights = useMemo(
    () => calculateWeights(assets, totals.totalValue),
    [assets, totals.totalValue]
  );

  const totalEquityValue = useMemo(
    () =>
      assets.reduce(
        (acc, a) => acc + (a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0),
        0
      ),
    [assets]
  );

  const totalPEValue = useMemo(
    () => startup.reduce((acc, p) => acc + (p.invested || 0), 0),
    [startup]
  );

  const totalPrivateEquityValue = useMemo(
    () => privateEquity.reduce((acc, f) => acc + (f.lastPrice || 0), 0),
    [privateEquity]
  );

  const classDistribution = useMemo(
    () => calculateClassDistribution(assets),
    [assets]
  );

  const classWithStartup = useMemo(() => {
    const base = [...classDistribution];
    if (totalPEValue > 0) {
      base.push({ name: "Startup", value: round2(totalPEValue) });
    }
    if (totalPrivateEquityValue > 0) {
      base.push({ name: "Private Equity", value: round2(totalPrivateEquityValue) });
    }
    return base;
  }, [classDistribution, totalPEValue, totalPrivateEquityValue]);

  const classWithStartupAndCash = useMemo(() => {
    const base = [...classWithStartup];
    if (TOTAL_CASH > 0) {
      base.push({ name: "Liquidità", value: round2(TOTAL_CASH) });
    }
    return base;
  }, [classWithStartup]);

  const rebalance = useMemo(
    () => calculateRebalancing(assets, totals.totalValue, MONTHLY_BUDGET),
    [assets, totals.totalValue]
  );

  const projectionData = useMemo(() => {
    const startValue = totalEquityValue + TOTAL_CASH + totalPEValue + totalPrivateEquityValue;
    return calculateProjection(startValue, monthlyContribution, expectedReturn, projectionYears);
  }, [totalEquityValue, totalPEValue, totalPrivateEquityValue, monthlyContribution, expectedReturn, projectionYears]);

  const finalProjectedValue = useMemo(() => {
    return projectionData.length > 0 ? projectionData[projectionData.length - 1].value : 0;
  }, [projectionData]);

  const totalContributed = useMemo(() => {
    const startValue = totalEquityValue + TOTAL_CASH + totalPEValue + totalPrivateEquityValue;
    return startValue + (monthlyContribution * 12 * projectionYears);
  }, [totalEquityValue, totalPEValue, totalPrivateEquityValue, monthlyContribution, projectionYears]);

  const projectedGain = useMemo(() => {
    return finalProjectedValue - totalContributed;
  }, [finalProjectedValue, totalContributed]);

  const fetchAllPrices = useCallback(async () => {
    const updated = await Promise.all(
      (assetsRef.current || []).map(async (a) => {
        const res = await fetchPrice(a);
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
  }, [fetchPrice, setAssets, setHistory]);

  useEffect(() => {
    fetchAllPrices();
    intervalRef.current = setInterval(fetchAllPrices, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchAllPrices]);

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Dashboard Portafoglio — Monitoraggio & Ribilanciamento
          </h1>
          <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
            <Info className="w-4 h-4" /> Aggiornamento automatico ogni 15 min
          </p>
        </div>
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <section className="bg-white p-4 rounded-2xl shadow">
        <h2 className="font-semibold mb-4">Asset nel portafoglio</h2>
        <span className="text-sm text-gray-600">
          Totale: {formatCurrency(totalEquityValue)}
        </span>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b">
                <th className="py-2 px-3 text-left">Nome</th>
                <th className="px-3 text-left">Ticker/ISIN</th>
                <th className="px-3 text-right">Valore attuale</th>
                <th className="px-3 text-right">Perf. €</th>
                <th className="px-3 text-right">Perf. %</th>
                <th className="px-3 text-right">Peso attuale</th>
                <th className="px-3 text-right">Peso target</th>
                <th className="px-3 text-right">Asset Class</th>
              </tr>
            </thead>
            <tbody>
              {assets
                .filter((a) => a.assetClass !== "Private equity")
                .map((a, i) => {
                  const value = a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0;
                  const perfEuro =
                    a.costBasis && a.lastPrice
                      ? (a.lastPrice - a.costBasis) * (a.quantity || 0)
                      : 0;
                  const perfPct =
                    a.costBasis && a.lastPrice
                      ? ((a.lastPrice - a.costBasis) / a.costBasis) * 100
                      : 0;
                  const weight =
                    weights.find((item) => item.id === a.id)?.weight || 0;

                  return (
                    <tr
                      key={a.id}
                      className={`border-b ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50"
                      } hover:bg-gray-100`}
                    >
                      <td className="py-2 px-3 font-medium text-left">{a.name}</td>
                      <td className="px-3 text-gray-500 text-left">
                        {a.identifier}
                      </td>
                      <td className="px-3 text-right">{formatCurrency(value)}</td>
                      <td
                        className={`px-3 text-right ${
                          perfEuro >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {perfEuro >= 0 ? "+" : "-"}
                        {formatCurrency(Math.abs(perfEuro))}
                      </td>
                      <td className="px-3 text-right">
                        <PerfBadge value={perfPct} />
                      </td>
                      <td className="px-3 text-right">{weight.toFixed(2)}%</td>
                      <td className="px-3 text-right">{a.targetWeight}%</td>
                      <td className="px-3 text-right">{a.assetClass}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white p-4 rounded-2xl shadow">
        <h2 className="font-semibold mb-4">Investimenti startup</h2>
        <span className="text-sm text-gray-600">
          Totale: {formatCurrency(totalPEValue)}
        </span>
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
                  className={`border-b ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } hover:bg-gray-100`}
                >
                  <td className="py-2 px-3 font-medium">{p.name}</td>
                  <td className="px-3 text-right">{formatCurrency(p.fee)}</td>
                  <td className="px-3 text-right">
                    {formatCurrency(p.invested)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white p-4 rounded-2xl shadow">
        <h2 className="font-semibold mb-4">Investimenti Private Equity</h2>
        <span className="text-sm text-gray-600">
          Totale: {formatCurrency(totalPrivateEquityValue)}
        </span>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b">
                <th className="py-2
