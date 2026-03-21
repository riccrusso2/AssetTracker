// App.js — Portfolio Tracker — Generic Edition
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
  Legend, AreaChart, Area, ReferenceLine,
} from "recharts";
import {
  RefreshCw, TrendingUp, TrendingDown, PieChart as PieChartIcon,
  BarChart2, LineChart as LineChartIcon, Target, Info, Trash2,
  Edit2, Moon, Sun, Download, Search, X, AlertTriangle,
  Activity, LayoutDashboard, Briefcase, Plus, CheckCircle,
  Shield, ChevronUp, ChevronDown, Wallet, Camera, Upload,
  Settings, DollarSign,
} from "lucide-react";
import "./styles.css";

// ====================== CONSTANTS ======================
const STORAGE_KEYS = {
  ASSETS:   "pft.assets.v1",
  DARK_MODE:"pft.dark.v1",
  CASH:     "pft.cash.v1",
};

const CONFIG_VERSION  = 1;
const AUTO_REFRESH_MS = 900_000; // 15 min

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const ASSET_CLASSES = [
  "ETF","Stock","Commodity","Crypto","Bond","Private Equity","Real Estate","Other",
];

// ====================== UTILITIES ======================
const r2  = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const uid = ()  => Math.random().toString(36).slice(2, 10);

const fmt = (n, compact = false) => {
  if (n == null || Number.isNaN(n)) return "—";
  try {
    if (compact && Math.abs(n) >= 10_000) {
      return new Intl.NumberFormat("en-US", {
        style: "currency", currency: "EUR",
        notation: "compact", maximumFractionDigits: 1,
      }).format(n);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "EUR", maximumFractionDigits: 2,
    }).format(n);
  } catch { return n.toFixed(2) + " €"; }
};

const fmtPct = (n) => (n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%");
const isISIN = (v) => /^[A-Z0-9]{12}$/i.test((v || "").trim());

const ls = {
  get: (key, def) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
};

// ====================== RISK METRICS ======================
const calcCAGR = (history) => {
  if (history.length < 2) return null;
  const years = (new Date(history.at(-1).t) - new Date(history[0].t)) / (365.25 * 864e5);
  if (years <= 0 || history[0].v <= 0) return null;
  return Math.pow(history.at(-1).v / history[0].v, 1 / years) - 1;
};

const calcReturns = (history) => {
  const r = [];
  for (let i = 1; i < history.length; i++)
    r.push((history[i].v - history[i - 1].v) / history[i - 1].v);
  return r;
};

const calcVolatility = (history) => {
  const r = calcReturns(history);
  if (r.length < 2) return null;
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length;
  return Math.sqrt(variance * 252);
};

const calcMaxDrawdown = (history) => {
  let peak = -Infinity, mdd = 0;
  for (const h of history) {
    if (h.v > peak) peak = h.v;
    const dd = (h.v - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd;
};

const calcSharpe = (history, rf = 0.03) => {
  const cagr = calcCAGR(history);
  const vol  = calcVolatility(history);
  if (!cagr || !vol || vol === 0) return null;
  return (cagr - rf) / vol;
};

const calcSortino = (history, rf = 0.03) => {
  const r = calcReturns(history);
  if (r.length < 2) return null;
  const meanAnn = r.reduce((a, b) => a + b, 0) / r.length * 252;
  const neg = r.filter((x) => x < 0);
  if (!neg.length) return null;
  const downDev = Math.sqrt(neg.reduce((a, b) => a + b ** 2, 0) / neg.length * 252);
  return downDev === 0 ? null : (meanAnn - rf) / downDev;
};

// ====================== SNAPSHOT HELPERS ======================
const buildChartData = (snapshots) => {
  if (!snapshots.length) return { data: [], assetIds: [] };
  const base = snapshots[0];
  const baseTotal = base.totalValue || 1;
  const baseByAssetId = {};
  (base.assets || []).forEach((a) => { baseByAssetId[a.id] = a.price || 1; });
  const assetIdSet = new Set();
  snapshots.forEach((s) => (s.assets || []).forEach((a) => assetIdSet.add(a.id)));
  const assetIds = [...assetIdSet];
  const data = snapshots.map((snap) => {
    const point = { label: snap.label };
    point["__total__"] = r2(((snap.totalValue || 0) / baseTotal) * 100);
    (snap.assets || []).forEach((a) => {
      const b = baseByAssetId[a.id] || a.price || 1;
      point[a.id] = r2(((a.price || 0) / b) * 100);
    });
    return point;
  });
  return { data, assetIds };
};

// ====================== CALCULATIONS ======================
const calcTotals = (assets) => {
  let val = 0, cost = 0;
  for (const a of assets) {
    if (a.lastPrice && a.quantity) val  += a.lastPrice * a.quantity;
    if (a.costBasis && a.quantity) cost += a.costBasis * a.quantity;
  }
  const ret = cost > 0 ? (val - cost) / cost : 0;
  const perfs = assets
    .filter((a) => a.lastPrice && a.costBasis)
    .map((a) => ({ id: a.id, name: a.name, perf: (a.lastPrice - a.costBasis) / a.costBasis }));
  const best  = perfs.length ? perfs.reduce((p, c) => c.perf > p.perf ? c : p) : null;
  const worst = perfs.length ? perfs.reduce((p, c) => c.perf < p.perf ? c : p) : null;
  return { val, cost, ret, best, worst };
};

const calcWeights = (assets, totalVal) => {
  const tv = totalVal || 0;
  return assets.map((a) => {
    const value  = a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0;
    const weight = tv > 0 ? (value / tv) * 100 : 0;
    return { id: a.id, name: a.name, value, weight, target: a.targetWeight || 0 };
  });
};

const calcClassDist = (assets) => {
  const map = {};
  for (const a of assets) {
    const v = a.lastPrice ? a.lastPrice * (a.quantity || 0) : 0;
    if (v > 0) map[a.assetClass] = (map[a.assetClass] || 0) + v;
  }
  return Object.entries(map).map(([name, value]) => ({ name, value: r2(value) }));
};

const calcDrift = (assets, totalVal) => {
  if (!totalVal) return 0;
  return assets.reduce((acc, a) => {
    const v = (a.lastPrice || 0) * (a.quantity || 0);
    const actual = (v / totalVal) * 100;
    return acc + Math.abs(actual - (a.targetWeight || 0));
  }, 0);
};

const calcProjectionScenarios = (start, monthly, baseReturn, years) => {
  const pessimistic = Math.max(baseReturn - 3, 0);
  const optimistic  = baseReturn + 3;
  const m = baseReturn / 100 / 12, mp = pessimistic / 100 / 12, mo = optimistic / 100 / 12;
  const months = years * 12;
  const data = [];
  let vb = start, vp = start, vo = start;
  for (let i = 0; i <= months; i++) {
    if (i % 12 === 0) data.push({ year: i / 12, base: r2(vb), pessimistic: r2(vp), optimistic: r2(vo) });
    if (i < months) { vb = vb * (1 + m) + monthly; vp = vp * (1 + mp) + monthly; vo = vo * (1 + mo) + monthly; }
  }
  return data;
};

const calcRebalancing = (assets, totalVal, budget) => {
  if (!totalVal || totalVal <= 0) return { actions: [] };
  const sumTarget = assets.reduce((acc, a) => acc + (a.targetWeight || 0), 0) || 1;
  const norm = 100 / sumTarget;
  const actions = assets.map((a) => {
    const cur   = (a.lastPrice || 0) * (a.quantity || 0);
    const curW  = (cur / totalVal) * 100;
    const tgtW  = (a.targetWeight || 0) * norm;
    const delta = (tgtW / 100) * totalVal - cur;
    const qty   = a.lastPrice ? delta / a.lastPrice : 0;
    return { ...a, curW, tgtW, delta, qty };
  });
  const buy = new Array(actions.length).fill(0);
  let eligible = actions.map((_, i) => i).filter((i) => actions[i].delta > 0);
  let remaining = budget;
  for (let iter = 0; iter < 20 && eligible.length > 0 && remaining > 0.005; iter++) {
    const sumEligTgt = eligible.reduce((acc, i) => acc + actions[i].tgtW, 0);
    if (sumEligTgt <= 0) break;
    const nextEligible = [];
    let allocated = 0;
    for (const i of eligible) {
      const proportional = (actions[i].tgtW / sumEligTgt) * remaining;
      const room = actions[i].delta - buy[i];
      if (proportional >= room) { buy[i] = actions[i].delta; allocated += room; }
      else { buy[i] += proportional; allocated += proportional; nextEligible.push(i); }
    }
    remaining -= allocated;
    eligible = nextEligible;
  }
  if (remaining > 0.005) {
    const sumAllTgt = actions.reduce((acc, a) => acc + a.tgtW, 0);
    if (sumAllTgt > 0) actions.forEach((a, i) => { buy[i] += (a.tgtW / sumAllTgt) * remaining; });
  }
  const rawBuys = actions.map((_, i) => Math.max(0, buy[i] || 0));
  const rounded = rawBuys.map(r2);
  const roundDiff = r2(budget - rounded.reduce((a, b) => a + b, 0));
  if (Math.abs(roundDiff) > 0) { const maxIdx = rounded.indexOf(Math.max(...rounded)); rounded[maxIdx] = r2(rounded[maxIdx] + roundDiff); }
  return {
    actions: actions.map((a, i) => ({
      ...a,
      monthlyBuy: rounded[i],
      monthlyQty: a.lastPrice && rounded[i] > 0 ? r2(rounded[i] / a.lastPrice) : 0,
    })),
  };
};

const exportCSV = (assets) => {
  const header = "Name,ISIN/Ticker,Quantity,Avg Buy Price,Current Price,Value,P&L €,P&L %,Asset Class";
  const rows = assets.map((a) => {
    const v   = a.lastPrice ? r2(a.lastPrice * (a.quantity || 0)) : 0;
    const pE  = a.costBasis && a.lastPrice ? r2((a.lastPrice - a.costBasis) * (a.quantity || 0)) : 0;
    const pPct= a.costBasis && a.lastPrice ? r2(((a.lastPrice - a.costBasis) / a.costBasis) * 100) : 0;
    return [a.name, a.identifier || "", a.quantity || 0, a.costBasis || 0,
      a.lastPrice || 0, v, pE, pPct + "%", a.assetClass || ""].join(",");
  });
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
};

// ====================== COLORS ======================
const PALETTE = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
                 "#14b8a6","#f97316","#22c55e","#e879f9","#60a5fa"];

const TOTAL_LINE_COLOR       = "#ffffff";
const TOTAL_LINE_COLOR_LIGHT = "#1e293b";

// ====================== COMPONENTS ======================

const Badge = ({ value, suffix = "%" }) => {
  const pos = value >= 0;
  return (
    <span className={`badge ${pos ? "badge-pos" : "badge-neg"}`}>
      {pos ? "+" : ""}{typeof value === "number" ? value.toFixed(2) : value}{suffix}
    </span>
  );
};

const KpiCard = ({ label, value, sub, icon: Icon, trend, color = "blue", compact = false }) => (
  <div className={`kpi-card kpi-${color}`}>
    <div className="kpi-top">
      <span className="kpi-label">{label}</span>
      {Icon && <Icon className="kpi-icon" />}
    </div>
    <div className={`kpi-value ${compact ? "kpi-compact" : ""}`}>{value}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
    {trend != null && (
      <div className={`kpi-trend ${trend >= 0 ? "pos" : "neg"}`}>
        {trend >= 0 ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        {Math.abs(trend).toFixed(2)}%
      </div>
    )}
  </div>
);

const RiskCard = ({ label, value, fmt: fmtFn, tooltip, quality }) => {
  const display = value == null ? "—" : (fmtFn ? fmtFn(value) : value);
  const qualColor = quality === "good" ? "var(--green)" : quality === "bad" ? "var(--red)" : "var(--text-muted)";
  return (
    <div className="risk-card" title={tooltip}>
      <div className="risk-label">{label}</div>
      <div className="risk-value" style={{ color: qualColor }}>{display}</div>
    </div>
  );
};

// ---- Empty State ----
const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="empty-state">
    <div className="empty-icon"><Icon size={32} /></div>
    <h3 className="empty-title">{title}</h3>
    <p className="empty-desc">{description}</p>
    {action && <button className="btn btn-primary" onClick={action.onClick}><Plus size={15}/>{action.label}</button>}
  </div>
);

// ---- Asset Modal ----
const AssetModal = ({ asset, onSave, onClose }) => {
  const [form, setForm] = useState(asset || {
    name: "", identifier: "", quantity: "", costBasis: "",
    targetWeight: "", assetClass: "ETF", currency: "EUR",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name || !form.quantity || !form.costBasis) return;
    onSave({
      ...form,
      id:           form.id || uid(),
      quantity:     parseFloat(form.quantity)     || 0,
      costBasis:    parseFloat(form.costBasis)    || 0,
      targetWeight: parseFloat(form.targetWeight) || 0,
      lastPrice:    form.lastPrice    ?? null,
      lastUpdated:  form.lastUpdated  ?? null,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{asset?.id ? "Edit Asset" : "Add Asset"}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">
          {[
            { label: "Name",              key: "name",         type: "text",   placeholder: "e.g. iShares MSCI World" },
            { label: "ISIN / Ticker",     key: "identifier",   type: "text",   placeholder: "e.g. IE00B4L5Y983" },
            { label: "Quantity",          key: "quantity",     type: "number", placeholder: "e.g. 10" },
            { label: "Avg Buy Price (€)", key: "costBasis",    type: "number", placeholder: "e.g. 80.00" },
            { label: "Target Weight (%)", key: "targetWeight", type: "number", placeholder: "e.g. 40" },
          ].map(({ label, key, type, placeholder }) => (
            <label key={key} className="field-label">
              {label}
              <input type={type} value={form[key] ?? ""} placeholder={placeholder}
                onChange={(e) => set(key, e.target.value)} className="field-input" step="any"/>
            </label>
          ))}
          <label className="field-label">
            Asset Class
            <select value={form.assetClass} onChange={(e) => set("assetClass", e.target.value)} className="field-input">
              {ASSET_CLASSES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          {/* Manual price override for non-ISIN assets */}
          <label className="field-label">
            Current Price (€) — optional override
            <input type="number" step="any" value={form.lastPrice ?? ""}
              placeholder="Leave empty to fetch automatically"
              onChange={(e) => set("lastPrice", e.target.value === "" ? null : parseFloat(e.target.value))}
              className="field-input"/>
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}
            disabled={!form.name || !form.quantity || !form.costBasis}>
            <CheckCircle size={15}/> Save
          </button>
        </div>
      </div>
    </div>
  );
};

// ---- Custom Recharts tooltip ----
const CustomTooltip = ({ active, payload, label, currency = true }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tooltip-row">
          <span style={{ color: p.color }}>{p.name}</span>
          <span>{currency ? fmt(p.value) : p.value?.toFixed(2) + "%"}</span>
        </div>
      ))}
    </div>
  );
};

const SnapshotTooltip = ({ active, payload, label, snapshots }) => {
  if (!active || !payload?.length) return null;
  const snap = snapshots.find((s) => s.label === label);
  return (
    <div className="chart-tooltip" style={{ minWidth: 200, maxHeight: 320, overflowY: "auto" }}>
      <div className="tooltip-label">{label}</div>
      {payload.map((p, i) => {
        if (p.dataKey === "__total__") {
          return (
            <div key={i} className="tooltip-row">
              <span style={{ color: p.color, fontWeight: 700 }}>Portfolio</span>
              <span style={{ fontWeight: 700 }}>
                {p.value?.toFixed(1)} &nbsp;
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  ({snap ? fmt(snap.totalValue) : ""})
                </span>
              </span>
            </div>
          );
        }
        const assetSnap = snap?.assets?.find((a) => a.id === p.dataKey);
        return (
          <div key={i} className="tooltip-row">
            <span style={{ color: p.color }}>{p.name}</span>
            <span>
              {p.value?.toFixed(1)} &nbsp;
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                ({assetSnap ? fmt(assetSnap.price) : ""})
              </span>
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>Index 100 = first snapshot</div>
    </div>
  );
};

// ====================== HOOKS ======================
const useLS = (key, init) => {
  const [v, setV] = useState(() => ls.get(key, init));
  useEffect(() => ls.set(key, v), [key, v]);
  return [v, setV];
};

const usePriceFetcher = () => {
  const [loading, setLoading] = useState({});
  const [error,   setError]   = useState(null);

  const fetchOne = useCallback(async (a) => {
    setLoading((s) => ({ ...s, [a.id]: true }));
    setError(null);
    try {
      // If asset has a manually set price, skip fetch
      if (a.manual || a.manualPrice) return { price: a.lastPrice, currency: "EUR", ts: Date.now() };
      const isin = (a.identifier || "").trim();
      if (!isISIN(isin)) throw new Error(`Invalid ISIN: ${isin}`);
      const res  = await fetch(`/api/quote?isin=${encodeURIComponent(isin)}`);
      if (!res.ok) throw new Error(`Fetch error: ${res.status}`);
      const data = await res.json();
      if (!data.latestQuote?.raw) throw new Error(`No data for ${isin}`);
      return { price: parseFloat(data.latestQuote.raw), currency: "EUR", ts: Date.now() };
    } catch (e) {
      setError(e.message);
      return { price: null };
    } finally {
      setLoading((s) => { const c = { ...s }; delete c[a.id]; return c; });
    }
  }, []);

  return { fetchOne, loading, error };
};

// ====================== TABS ======================
const TABS = [
  { id: "overview",    label: "Overview",     icon: LayoutDashboard },
  { id: "portfolio",   label: "Portfolio",    icon: Briefcase },
  { id: "analytics",   label: "Analytics",   icon: BarChart2 },
  { id: "projection",  label: "Projection",  icon: LineChartIcon },
  { id: "rebalancing", label: "Rebalancing", icon: Target },
];

// ====================== MAIN APP ======================
export default function App() {
  // ---- State ----
  const [dark,      setDark]   = useLS(STORAGE_KEYS.DARK_MODE, true);
  const [assets,    setAssets] = useLS(STORAGE_KEYS.ASSETS,    []);  // starts empty
  const [totalCash, setCash]   = useLS(STORAGE_KEYS.CASH,      0);

  const [snapshots,      setSnapshots]      = useState([]);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotMsg,    setSnapshotMsg]    = useState(null);

  const [hiddenLines, setHiddenLines] = useState(new Set());
  const [tab,         setTab]         = useState("overview");
  const [search,      setSearch]      = useState("");

  const [assetModal, setAssetModal] = useState(null);
  const [editCash,   setEditCash]   = useState(false);
  const [cashInput,  setCashInput]  = useState("");
  const [configMsg,  setConfigMsg]  = useState(null);

  const [projYears,   setProjY] = useState(10);
  const [projReturn,  setProjR] = useState(7);
  const [projMonthly, setProjM] = useState(500);
  const [monthBudget, setBudget]= useState(500);

  const { fetchOne, loading, error } = usePriceFetcher();
  const assetsRef = useRef(assets);
  useEffect(() => { assetsRef.current = assets; }, [assets]);

  // ---- Dark mode ----
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  // ---- Load snapshots from backend ----
  useEffect(() => {
    fetch("/api/snapshots")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSnapshots(data); })
      .catch(() => {});
  }, []);

  // ---- Derived ----
  const totals    = useMemo(() => calcTotals(assets),              [assets]);
  const weights   = useMemo(() => calcWeights(assets, totals.val), [assets, totals.val]);
  const classDist = useMemo(() => calcClassDist(assets),           [assets]);
  const drift     = useMemo(() => calcDrift(assets, totals.val),   [assets, totals.val]);

  const grandTotal = totals.val + totalCash;

  const fullClassDist = useMemo(() => {
    const base = [...classDist];
    if (totalCash > 0) base.push({ name: "Cash", value: r2(totalCash) });
    return base;
  }, [classDist, totalCash]);

  const rebalance = useMemo(() =>
    calcRebalancing(assets, totals.val, monthBudget),
    [assets, totals.val, monthBudget]
  );

  const projData = useMemo(() =>
    calcProjectionScenarios(grandTotal, projMonthly, projReturn, projYears),
    [grandTotal, projMonthly, projReturn, projYears]
  );

  const finalVal     = projData.at(-1)?.base ?? 0;
  const totalContrib = grandTotal + projMonthly * 12 * projYears;
  const projGain     = finalVal - totalContrib;
  const projROI      = totalContrib > 0 ? (projGain / totalContrib) * 100 : 0;

  const histForRisk = useMemo(() =>
    snapshots.map((s) => ({ t: s.savedAt || `${s.year}-${String(s.month).padStart(2,"0")}-01`, v: s.totalValue })),
    [snapshots]
  );

  const riskMetrics = useMemo(() => ({
    cagr:    calcCAGR(histForRisk),
    vol:     calcVolatility(histForRisk),
    mdd:     calcMaxDrawdown(histForRisk),
    sharpe:  calcSharpe(histForRisk),
    sortino: calcSortino(histForRisk),
  }), [histForRisk]);

  const { data: snapshotChartData, assetIds } = useMemo(
    () => buildChartData(snapshots),
    [snapshots]
  );

  const assetNameMap = useMemo(() => {
    const m = {};
    assets.forEach((a) => { m[a.id] = a.chartLabel || a.name.split(" ").slice(0, 3).join(" "); });
    return m;
  }, [assets]);

  const perfBarData = useMemo(() =>
    assets
      .filter((a) => a.lastPrice && a.costBasis)
      .map((a) => ({
        name:  a.name.split(" ").slice(0, 3).join(" "),
        value: r2(((a.lastPrice - a.costBasis) / a.costBasis) * 100),
      }))
      .sort((a, b) => b.value - a.value),
    [assets]
  );

  const weightBarData = useMemo(() =>
    weights.map((w) => ({
      name:    w.name.split(" ").slice(0, 3).join(" "),
      current: r2(w.weight),
      target:  w.target,
    })).filter((w) => w.target > 0 || w.current > 0.5),
    [weights]
  );

  const filteredAssets = useMemo(() =>
    search.trim()
      ? assets.filter((a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          (a.identifier || "").toLowerCase().includes(search.toLowerCase())
        )
      : assets,
    [assets, search]
  );

  // ---- Actions ----
  const fetchAllPrices = useCallback(async () => {
    if (!assetsRef.current?.length) return;
    const updated = await Promise.all(
      (assetsRef.current || []).map(async (a) => {
        const res = await fetchOne(a);
        return res.price != null
          ? { ...a, lastPrice: res.price, lastUpdated: new Date().toISOString() }
          : a;
      })
    );
    setAssets(updated);
  }, [fetchOne, setAssets]);

  const intervalRef = useRef(null);
  useEffect(() => {
    if (assets.length > 0) fetchAllPrices();
    intervalRef.current = setInterval(fetchAllPrices, AUTO_REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchAllPrices]);

  // ---- Monthly Snapshot ----
  const saveMonthlySnapshot = useCallback(async () => {
    const missing = assets.filter((a) => !a.manual && !a.manualPrice && !a.lastPrice).map((a) => a.name);
    if (missing.length > 0) {
      setSnapshotMsg({ type: "err", text: `Missing prices: ${missing.join(", ")}` });
      setTimeout(() => setSnapshotMsg(null), 5000);
      return;
    }
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();
    const label = `${MONTH_LABELS[month - 1]} ${year}`;
    const snapshotData = {
      label, month, year,
      totalValue: r2(grandTotal),
      assets: assets.filter((a) => a.lastPrice).map((a) => ({
        id: a.id, name: a.name, price: a.lastPrice,
        quantity: a.quantity, value: r2((a.lastPrice || 0) * (a.quantity || 0)),
      })),
    };
    setSnapshotSaving(true);
    setSnapshotMsg(null);
    try {
      const res = await fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshotData),
      });
      const json = await res.json();
      if (!json.ok) throw new Error("Invalid server response");
      const updated = await fetch("/api/snapshots").then((r) => r.json());
      if (Array.isArray(updated)) setSnapshots(updated);
      setSnapshotMsg({ type: "ok", text: `✓ Snapshot "${label}" saved (${json.total} total)` });
    } catch (e) {
      setSnapshotMsg({ type: "err", text: `Error: ${e.message}` });
    } finally {
      setSnapshotSaving(false);
      setTimeout(() => setSnapshotMsg(null), 5000);
    }
  }, [assets, grandTotal]);

  const exportSnapshotsFile = useCallback(() => {
    const blob = new Blob([JSON.stringify(snapshots, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `snapshots_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href);
  }, [snapshots]);

  const importSnapshotsRef = useRef(null);
  const importSnapshots = useCallback(async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("File must contain an array of snapshots.");
      setSnapshotMsg({ type: "ok", text: "Importing…" });
      let count = 0;
      for (const snap of parsed) {
        const res = await fetch("/api/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snap) });
        const json = await res.json();
        if (json.ok) count++;
      }
      const updated = await fetch("/api/snapshots").then((r) => r.json());
      if (Array.isArray(updated)) setSnapshots(updated);
      setSnapshotMsg({ type: "ok", text: `✓ Imported ${count} snapshots` });
    } catch (e) {
      setSnapshotMsg({ type: "err", text: `Import error: ${e.message}` });
    } finally {
      setTimeout(() => setSnapshotMsg(null), 5000);
    }
  }, []);

  // ---- Config Export / Import ----
  const exportConfig = useCallback(() => {
    const config = { version: CONFIG_VERSION, exportedAt: new Date().toISOString(), totalCash, assets };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `portfolio_config_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href);
    showConfigMsg("ok", "✓ Configuration exported");
  }, [assets, totalCash]);

  const configImportRef = useRef(null);
  const importConfig = useCallback(async (file) => {
    if (!file) return;
    try {
      const text   = await file.text();
      const config = JSON.parse(text);
      if (!config.version || !Array.isArray(config.assets))
        throw new Error("Invalid file: missing 'version' or 'assets'.");
      setAssets(config.assets);
      if (typeof config.totalCash === "number") setCash(config.totalCash);
      showConfigMsg("ok", `✓ Configuration imported (${config.exportedAt?.slice(0,10) ?? "?"})`);
    } catch (e) {
      showConfigMsg("err", `Error: ${e.message}`);
    }
  }, []);

  const showConfigMsg = (type, text) => {
    setConfigMsg({ type, text });
    setTimeout(() => setConfigMsg(null), 5000);
  };

  // ---- CRUD ----
  const saveAsset = (a) => {
    setAssets((prev) => {
      const idx = prev.findIndex((x) => x.id === a.id);
      return idx >= 0 ? prev.map((x) => x.id === a.id ? a : x) : [...prev, a];
    });
  };
  const deleteAsset = (id) => setAssets((prev) => prev.filter((a) => a.id !== id));

  const isLoading = Object.keys(loading).length > 0;

  const toggleLine = (dataKey) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      next.has(dataKey) ? next.delete(dataKey) : next.add(dataKey);
      return next;
    });
  };

  const tabLoading = isLoading && (
    <span className="loading-dot-row">
      <span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/>
    </span>
  );

  // ====================== TAB: OVERVIEW ======================
  const renderOverview = () => (
    <div className="tab-content">
      {assets.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Your portfolio is empty"
          description="Add your first asset to start tracking your investments. Go to the Portfolio tab to get started."
          action={{ label: "Add Asset", onClick: () => setTab("portfolio") }}
        />
      ) : (
        <>
          <div className="grid-4">
            <KpiCard label="Total Portfolio"   value={fmt(grandTotal, true)} icon={Wallet}
              sub={`Cash: ${fmt(totalCash)}`} color="blue" />
            <KpiCard label="Invested Assets"   value={fmt(totals.val, true)} icon={Activity}
              trend={totals.ret * 100} color="blue" />
            <KpiCard label="Total Return"
              value={fmtPct(totals.ret * 100)}
              sub={`${totals.val - totals.cost >= 0 ? "+" : ""}${fmt(totals.val - totals.cost)}`}
              color={totals.ret >= 0 ? "green" : "red"} />
            <KpiCard label="Portfolio Drift"
              value={drift.toFixed(1) + "%"}
              sub={drift > 10 ? "⚠ Rebalancing advised" : "✓ On target"}
              color={drift > 10 ? "amber" : "green"} icon={Target} />
          </div>

          {snapshots.length > 2 && (
            <div className="section-card">
              <h3 className="section-title"><Shield size={16}/> Risk Metrics</h3>
              <div className="grid-5">
                <RiskCard label="CAGR"          value={riskMetrics.cagr}
                  fmtFn={(v) => fmtPct(v * 100)} tooltip="Compound Annual Growth Rate"
                  quality={riskMetrics.cagr > 0.05 ? "good" : "bad"} />
                <RiskCard label="Volatility"    value={riskMetrics.vol}
                  fmtFn={(v) => fmtPct(v * 100)} tooltip="Annualized volatility"
                  quality={riskMetrics.vol < 0.2 ? "good" : "bad"} />
                <RiskCard label="Max Drawdown"  value={riskMetrics.mdd}
                  fmtFn={(v) => fmtPct(v * 100)} tooltip="Maximum loss from peak"
                  quality={riskMetrics.mdd > -0.15 ? "good" : "bad"} />
                <RiskCard label="Sharpe Ratio"  value={riskMetrics.sharpe}
                  fmtFn={(v) => v.toFixed(2)} tooltip="(Return - Rf) / Volatility. >1 is excellent"
                  quality={riskMetrics.sharpe > 1 ? "good" : riskMetrics.sharpe > 0 ? "neutral" : "bad"} />
                <RiskCard label="Sortino Ratio" value={riskMetrics.sortino}
                  fmtFn={(v) => v.toFixed(2)} tooltip="Like Sharpe but only penalizes downside vol"
                  quality={riskMetrics.sortino > 1 ? "good" : riskMetrics.sortino > 0 ? "neutral" : "bad"} />
              </div>
              <p className="hint-text">⚠ Metrics calculated on {snapshots.length} monthly snapshots.</p>
            </div>
          )}

          <div className="grid-3">
            <div className="section-card">
              <h3 className="section-title"><TrendingUp size={16}/> Best Performer</h3>
              {totals.best ? (
                <><div className="big-name">{totals.best.name}</div><Badge value={totals.best.perf * 100} /></>
              ) : <p className="muted">Insufficient data</p>}
            </div>
            <div className="section-card">
              <h3 className="section-title"><TrendingDown size={16}/> Worst Performer</h3>
              {totals.worst ? (
                <><div className="big-name">{totals.worst.name}</div><Badge value={totals.worst.perf * 100} /></>
              ) : <p className="muted">Insufficient data</p>}
            </div>
            <div className="section-card">
              <h3 className="section-title"><BarChart2 size={16}/> Composition</h3>
              <div className="stat-row"><span>Invested Assets</span><strong>{fmt(totals.val)}</strong></div>
              <div className="stat-row"><span>Cash</span><strong>{fmt(totalCash)}</strong></div>
              <div className="stat-row"><span>Total Assets</span><strong>{assets.length}</strong></div>
            </div>
          </div>

          <div className="grid-2">
            <div className="section-card">
              <h3 className="section-title"><PieChartIcon size={16}/> Asset Allocation</h3>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={fullClassDist} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={95} innerRadius={45}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}>
                      {fullClassDist.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]}/>)}
                    </Pie>
                    <ReTooltip formatter={(v, n) => [fmt(v), n]}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Snapshot chart */}
            <div className="section-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h3 className="section-title" style={{ margin: 0 }}>
                  <LineChartIcon size={16}/> Monthly Price History
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {snapshotMsg && (
                    <span style={{ fontSize: 12, color: snapshotMsg.type === "ok" ? "var(--green)" : "var(--red)",
                      maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {snapshotMsg.text}
                    </span>
                  )}
                  <input ref={importSnapshotsRef} type="file" accept=".json" style={{ display: "none" }}
                    onChange={(e) => { importSnapshots(e.target.files[0]); e.target.value = ""; }}/>
                  <button className="btn btn-ghost" onClick={() => importSnapshotsRef.current?.click()}
                    style={{ fontSize: 12, padding: "6px 12px" }}>
                    <Download size={13} style={{ transform: "rotate(180deg)" }}/> Import
                  </button>
                  <button className="btn btn-ghost" onClick={exportSnapshotsFile} disabled={snapshots.length === 0}
                    style={{ fontSize: 12, padding: "6px 12px" }}>
                    <Download size={13}/> Export{snapshots.length > 0 ? ` (${snapshots.length})` : ""}
                  </button>
                  <button className="btn btn-primary" onClick={saveMonthlySnapshot}
                    disabled={snapshotSaving || isLoading || assets.length === 0}
                    style={{ fontSize: 12, padding: "6px 12px" }}>
                    <Camera size={13}/> {snapshotSaving ? "Saving…" : "Monthly Snapshot"}
                  </button>
                </div>
              </div>

              {snapshotChartData.length === 0 ? (
                <div className="chart-empty" style={{ height: 280 }}>
                  <div style={{ textAlign: "center" }}>
                    <p className="muted" style={{ marginBottom: 8 }}>No snapshots yet.</p>
                    <p className="muted" style={{ fontSize: 12 }}>Press <strong>Monthly Snapshot</strong> once a month to track history.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={snapshotChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--text-muted)"/>
                        <YAxis tickFormatter={(v) => v + ""} tick={{ fontSize: 10 }} stroke="var(--text-muted)"
                          domain={["auto","auto"]}
                          label={{ value: "Index (base 100)", angle: -90, position: "insideLeft",
                                   style: { fontSize: 10, fill: "var(--text-muted)" }, offset: 10 }}/>
                        <ReTooltip content={<SnapshotTooltip snapshots={snapshots}/>}/>
                        <Line type="monotone" dataKey="__total__" name="Portfolio"
                          stroke={dark ? TOTAL_LINE_COLOR : TOTAL_LINE_COLOR_LIGHT} strokeWidth={2.5}
                          dot={{ r: 3, fill: dark ? TOTAL_LINE_COLOR : TOTAL_LINE_COLOR_LIGHT }}
                          activeDot={{ r: 5 }} hide={hiddenLines.has("__total__")}/>
                        {assetIds.map((id, i) => (
                          <Line key={id} type="monotone" dataKey={id} name={assetNameMap[id] || id}
                            stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5}
                            dot={snapshotChartData.length === 1 ? { r: 4 } : false}
                            activeDot={{ r: 4 }} hide={hiddenLines.has(id)}/>
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="snapshot-legend">
                    <button className={`legend-item ${hiddenLines.has("__total__") ? "legend-item--hidden" : ""}`}
                      onClick={() => toggleLine("__total__")}
                      style={{ "--line-color": dark ? TOTAL_LINE_COLOR : TOTAL_LINE_COLOR_LIGHT }}>
                      <span className="legend-dot" style={{ background: dark ? TOTAL_LINE_COLOR : TOTAL_LINE_COLOR_LIGHT }}/>
                      Portfolio
                    </button>
                    {assetIds.map((id, i) => (
                      <button key={id}
                        className={`legend-item ${hiddenLines.has(id) ? "legend-item--hidden" : ""}`}
                        onClick={() => toggleLine(id)}
                        style={{ "--line-color": PALETTE[i % PALETTE.length] }}>
                        <span className="legend-dot" style={{ background: PALETTE[i % PALETTE.length] }}/>
                        {assetNameMap[id] || id}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ====================== TAB: PORTFOLIO ======================
  const renderPortfolio = () => (
    <div className="tab-content">
      {/* Config Export / Import */}
      <div className="section-card" style={{ borderColor: "var(--blue)", borderWidth: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 className="section-title" style={{ margin: 0 }}>
              <Settings size={16}/> Portfolio Configuration
            </h3>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Export your full portfolio (assets + cash) to a JSON file. Import it on any device to restore your setup.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {configMsg && (
              <span style={{ fontSize: 12, color: configMsg.type === "ok" ? "var(--green)" : "var(--red)" }}>
                {configMsg.text}
              </span>
            )}
            <input ref={configImportRef} type="file" accept=".json" style={{ display: "none" }}
              onChange={(e) => { importConfig(e.target.files[0]); e.target.value = ""; }}/>
            <button className="btn btn-ghost" onClick={() => configImportRef.current?.click()}>
              <Upload size={15}/> Import Config
            </button>
            <button className="btn btn-primary" onClick={exportConfig} disabled={assets.length === 0}>
              <Download size={15}/> Export Config
            </button>
          </div>
        </div>
      </div>

      {/* Cash */}
      <div className="section-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="section-title" style={{ margin: 0 }}><Wallet size={16}/> Cash / Liquidity</h2>
          {!editCash ? (
            <button className="icon-btn" onClick={() => { setCashInput(totalCash); setEditCash(true); }}>
              <Edit2 size={14}/>
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" step="any" value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                className="field-input" style={{ width: 140 }} placeholder="0.00"/>
              <button className="btn btn-primary" onClick={() => { setCash(parseFloat(cashInput) || 0); setEditCash(false); }}>
                <CheckCircle size={14}/> OK
              </button>
              <button className="btn btn-ghost" onClick={() => setEditCash(false)}><X size={14}/></button>
            </div>
          )}
        </div>
        {!editCash && (
          <div style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginTop: 8 }}>
            {fmt(totalCash)}
          </div>
        )}
      </div>

      {/* Assets Table */}
      <div className="section-card">
        <div className="table-controls" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 className="section-title" style={{ margin: 0 }}><Briefcase size={16}/> Assets</h2>
            {assets.length > 0 && (
              <span className="muted" style={{ fontSize: 13 }}>Total: <strong>{fmt(totals.val)}</strong></span>
            )}
          </div>
          <div className="btn-row">
            {assets.length > 0 && (
              <>
                <div className="search-wrap" style={{ maxWidth: 260 }}>
                  <Search size={15} className="search-icon"/>
                  <input className="search-input" placeholder="Search…"
                    value={search} onChange={(e) => setSearch(e.target.value)}/>
                  {search && <button className="icon-btn" onClick={() => setSearch("")}><X size={14}/></button>}
                </div>
                <button className="btn btn-ghost" onClick={() => exportCSV(assets)}>
                  <Download size={15}/> CSV
                </button>
                <button className="btn btn-ghost" onClick={fetchAllPrices} disabled={isLoading}>
                  <RefreshCw size={14} className={isLoading ? "spin" : ""}/>
                  {isLoading ? "Refreshing…" : "Refresh Prices"}
                </button>
              </>
            )}
            <button className="btn btn-primary" onClick={() => setAssetModal({})}>
              <Plus size={15}/> Add Asset
            </button>
          </div>
        </div>

        {assets.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No assets yet"
            description='Click "Add Asset" to add your first investment. You can add ETFs, stocks, crypto, bonds, or any other asset class.'
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th><th>ISIN / Ticker</th><th className="num">Qty</th>
                  <th className="num">Buy Price</th><th className="num">Current Price</th>
                  <th className="num">Value</th><th className="num">P&amp;L €</th>
                  <th className="num">P&amp;L %</th><th className="num">Weight</th>
                  <th className="num">Target</th><th>Class</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((a) => {
                  const value  = a.lastPrice ? r2(a.lastPrice * (a.quantity || 0)) : 0;
                  const perfE  = a.costBasis && a.lastPrice ? r2((a.lastPrice - a.costBasis) * (a.quantity || 0)) : 0;
                  const perfP  = a.costBasis && a.lastPrice ? r2(((a.lastPrice - a.costBasis) / a.costBasis) * 100) : 0;
                  const weight = weights.find((w) => w.id === a.id)?.weight || 0;
                  const diff   = weight - (a.targetWeight || 0);
                  return (
                    <tr key={a.id}>
                      <td className="asset-name">
                        {loading[a.id] && <span className="loading-dot inline-dot"/>}
                        {a.name}
                      </td>
                      <td className="mono muted">{a.identifier || "—"}</td>
                      <td className="num mono">{a.quantity}</td>
                      <td className="num mono">{fmt(a.costBasis)}</td>
                      <td className="num mono">{a.lastPrice ? fmt(a.lastPrice) : "—"}</td>
                      <td className="num mono"><strong>{fmt(value)}</strong></td>
                      <td className={`num mono ${perfE >= 0 ? "pos-text" : "neg-text"}`}>
                        {perfE >= 0 ? "+" : ""}{fmt(perfE)}
                      </td>
                      <td className="num"><Badge value={perfP}/></td>
                      <td className="num mono">{weight.toFixed(1)}%</td>
                      <td className="num">
                        <span className={`target-badge ${Math.abs(diff) > 3 ? (diff > 0 ? "over" : "under") : "ok"}`}>
                          {a.targetWeight || 0}%
                        </span>
                      </td>
                      <td><span className="class-tag">{a.assetClass}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-btn" onClick={() => setAssetModal(a)}><Edit2 size={14}/></button>
                          <button className="icon-btn danger" onClick={() => {
                            if (window.confirm(`Remove ${a.name}?`)) deleteAsset(a.id);
                          }}><Trash2 size={14}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="hint-text" style={{ textAlign: "center" }}>
        <Info size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}/>
        Assets with a valid ISIN are automatically priced via JustETF. For other assets, set the current price manually.
      </p>
    </div>
  );

  // ====================== TAB: ANALYTICS ======================
  const renderAnalytics = () => (
    <div className="tab-content">
      {assets.length === 0 ? (
        <EmptyState
          icon={BarChart2}
          title="No data to analyze"
          description="Add assets to your portfolio to see performance analytics, allocation charts, and drift indicators."
          action={{ label: "Go to Portfolio", onClick: () => setTab("portfolio") }}
        />
      ) : (
        <>
          <div className="grid-2">
            <div className="section-card">
              <h3 className="section-title"><BarChart2 size={16}/> Performance by Asset (%)</h3>
              {perfBarData.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "40px 0" }}>Refresh prices to see performance data.</p>
              ) : (
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={perfBarData} layout="vertical" margin={{ left: 20, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                      <XAxis type="number" unit="%" tick={{ fontSize: 11 }} stroke="var(--text-muted)"/>
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} stroke="var(--text-muted)"/>
                      <ReTooltip formatter={(v) => [v.toFixed(2) + "%", "Performance"]}/>
                      <ReferenceLine x={0} stroke="var(--text-muted)" strokeDasharray="4 2"/>
                      <Bar dataKey="value" name="Performance %">
                        {perfBarData.map((e, i) => <Cell key={i} fill={e.value >= 0 ? "#10b981" : "#ef4444"}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="section-card">
              <h3 className="section-title"><Target size={16}/> Current vs Target Weight (%)</h3>
              {weightBarData.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "40px 0" }}>Set target weights on your assets to see this chart.</p>
              ) : (
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weightBarData} layout="vertical" margin={{ left: 20, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                      <XAxis type="number" unit="%" tick={{ fontSize: 11 }} stroke="var(--text-muted)"/>
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} stroke="var(--text-muted)"/>
                      <ReTooltip formatter={(v, n) => [v.toFixed(2) + "%", n]}/>
                      <Legend/>
                      <Bar dataKey="current" name="Current Weight" fill="#3b82f6" radius={[0, 3, 3, 0]}/>
                      <Bar dataKey="target"  name="Target Weight"  fill="#94a3b8" radius={[0, 3, 3, 0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="section-card">
            <h3 className="section-title"><Activity size={16}/> Portfolio Drift Index</h3>
            <div className="drift-meter">
              <div className="drift-bar-wrap">
                <div className="drift-bar-fill"
                  style={{ width: `${Math.min(drift * 2, 100)}%`,
                    background: drift < 5 ? "var(--green)" : drift < 15 ? "var(--amber)" : "var(--red)" }}/>
              </div>
              <div className="drift-labels">
                <span>0%</span><span className="drift-value">{drift.toFixed(1)}%</span><span>50%+</span>
              </div>
            </div>
            <p className="hint-text">
              {drift < 5 ? "✓ Portfolio is well aligned." : drift < 15 ? "⚠ Slight drift detected." : "🚨 High drift — rebalancing is recommended."}
              {" "}Sum of absolute deviations between current and target weights.
            </p>
          </div>

          <div className="section-card">
            <h3 className="section-title"><PieChartIcon size={16}/> Distribution by Asset Class</h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={classDist} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {classDist.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]}/>)}
                  </Pie>
                  <ReTooltip formatter={(v, n) => [fmt(v), n]}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ====================== TAB: PROJECTION ======================
  const renderProjection = () => (
    <div className="tab-content">
      <div className="section-card">
        <h2 className="section-title"><LineChartIcon size={16}/> Growth Projection — Multiple Scenarios</h2>
        <div className="grid-3" style={{ marginBottom: "1.5rem" }}>
          {[
            { label: "Base annual return (%)", val: projReturn,  set: setProjR, step: 0.5, min: 0, max: 30 },
            { label: "Monthly contribution (€)", val: projMonthly, set: setProjM, step: 100, min: 0 },
            { label: "Projection years",          val: projYears,   set: setProjY, step: 1,   min: 1, max: 50 },
          ].map(({ label, val, set, step, min, max }) => (
            <label key={label} className="field-label">
              {label}
              <input type="number" value={val} onChange={(e) => set(parseFloat(e.target.value) || 0)}
                step={step} min={min} max={max} className="field-input"/>
            </label>
          ))}
        </div>

        <div className="grid-4" style={{ marginBottom: "1.5rem" }}>
          <KpiCard label="Starting Value"          value={fmt(grandTotal, true)} color="blue"/>
          <KpiCard label={`Projected (${projYears}y) — Base`}
            value={fmt(projData.at(-1)?.base ?? 0, true)} color="green"/>
          <KpiCard label="Projected — Optimistic (+3%)"
            value={fmt(projData.at(-1)?.optimistic ?? 0, true)} color="green"/>
          <KpiCard label="Expected Gain (base)"
            value={fmt(projGain, true)} sub={`ROI: ${projROI.toFixed(1)}%`}
            color={projGain >= 0 ? "green" : "red"}/>
        </div>

        <div style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projData}>
              <defs>
                {[{ id: "gOpt", color: "#10b981" },{ id: "gBase", color: "#3b82f6" },{ id: "gPess", color: "#f59e0b" }]
                  .map(({ id, color }) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0}/>
                    </linearGradient>
                  ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="year" label={{ value: "Years", position: "insideBottom", offset: -4 }}
                tick={{ fontSize: 11 }} stroke="var(--text-muted)"/>
              <YAxis tickFormatter={(v) => `€${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="var(--text-muted)"/>
              <ReTooltip content={<CustomTooltip/>}/>
              <Legend/>
              <Area type="monotone" dataKey="optimistic" name={`Optimistic (+${projReturn+3}%)`}
                stroke="#10b981" fill="url(#gOpt)" strokeWidth={2} dot={false}/>
              <Area type="monotone" dataKey="base"       name={`Base (${projReturn}%)`}
                stroke="#3b82f6" fill="url(#gBase)" strokeWidth={2.5} dot={false}/>
              <Area type="monotone" dataKey="pessimistic" name={`Pessimistic (${Math.max(projReturn-3,0)}%)`}
                stroke="#f59e0b" fill="url(#gPess)" strokeWidth={2} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="hint-text">Hypothetical projection only. Does not constitute financial advice.</p>
      </div>
    </div>
  );

  // ====================== TAB: REBALANCING ======================
  const renderRebalancing = () => (
    <div className="tab-content">
      {assets.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No assets to rebalance"
          description="Add assets with target weights to get smart rebalancing suggestions based on your monthly budget."
          action={{ label: "Add Assets", onClick: () => setTab("portfolio") }}
        />
      ) : (
        <div className="section-card">
          <h2 className="section-title"><Target size={16}/> Rebalancing Suggestions</h2>
          <div className="kpi-mini-row" style={{ marginBottom: "1rem" }}>
            <label className="field-label" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              Monthly budget available:
              <input type="number" value={monthBudget}
                onChange={(e) => setBudget(parseFloat(e.target.value) || 0)}
                step="100" min="0" className="field-input" style={{ width: 120 }}/>
            </label>
          </div>

          {drift > 5 && (
            <div className="alert alert-amber">
              <AlertTriangle size={15}/> Drift of {drift.toFixed(1)}% — portfolio has moved away from targets.
            </div>
          )}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="num">Current Weight</th>
                  <th className="num">Target (norm.)</th>
                  <th className="num">Delta €</th>
                  <th className="num">Qty Δ</th>
                  <th className="num">Monthly Buy</th>
                  <th className="num">Buy Qty</th>
                </tr>
              </thead>
              <tbody>
                {rebalance.actions.map((x) => (
                  <tr key={x.id}>
                    <td>{x.name}</td>
                    <td className="num mono">{x.curW.toFixed(2)}%</td>
                    <td className="num mono">{x.tgtW.toFixed(2)}%</td>
                    <td className={`num mono ${x.delta >= 0 ? "pos-text" : "neg-text"}`}>
                      {x.delta >= 0 ? "+" : ""}{fmt(x.delta)}
                    </td>
                    <td className="num mono">{x.qty.toFixed(4)}</td>
                    <td className="num mono pos-text">{fmt(x.monthlyBuy)}</td>
                    <td className="num mono">{x.monthlyQty > 0 ? x.monthlyQty : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={5}><strong>Total Monthly Buy</strong></td>
                  <td className="num mono">
                    {(() => {
                      const total = r2(rebalance.actions.reduce((acc, x) => acc + (x.monthlyBuy || 0), 0));
                      const diff  = r2(Math.abs(total - monthBudget));
                      return (
                        <span className={diff > 0.02 ? "neg-text" : "pos-text"}>
                          <strong>{fmt(total)}</strong>
                          {diff > 0.02 ? ` ⚠ (diff: ${fmt(diff)})` : " ✓"}
                        </span>
                      );
                    })()}
                  </td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="hint-text">
            Target weights are normalized to 100%. Monthly budget is allocated first to underweight assets.
          </p>
        </div>
      )}
    </div>
  );

  // ====================== RENDER ======================
  return (
    <div className={`app ${dark ? "dark" : "light"}`}>
      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark">PT</div>
          <div>
            <h1 className="app-title">Portfolio Tracker</h1>
            <p className="app-subtitle">
              <Info size={12}/> Auto-refresh every 15 min
              {isLoading && tabLoading}
            </p>
          </div>
        </div>
        <div className="header-right">
          {assets.length > 0 && (
            <div className="grand-total">
              <span className="gt-label">Total Portfolio</span>
              <span className="gt-value">{fmt(grandTotal)}</span>
              {totals.ret !== 0 && <Badge value={totals.ret * 100}/>}
            </div>
          )}
          <button className="icon-btn theme-toggle" onClick={() => setDark((d) => !d)} title="Toggle theme">
            {dark ? <Sun size={17}/> : <Moon size={17}/>}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-red mx-4">
          <AlertTriangle size={14}/> {error}
        </div>
      )}

      <nav className="tab-bar">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}>
              <Icon size={15}/> {t.label}
            </button>
          );
        })}
      </nav>

      <main className="app-main">
        {tab === "overview"    && renderOverview()}
        {tab === "portfolio"   && renderPortfolio()}
        {tab === "analytics"   && renderAnalytics()}
        {tab === "projection"  && renderProjection()}
        {tab === "rebalancing" && renderRebalancing()}
      </main>

      {assetModal !== null && (
        <AssetModal
          asset={assetModal?.id ? assetModal : null}
          onSave={saveAsset}
          onClose={() => setAssetModal(null)}
        />
      )}
    </div>
  );
}