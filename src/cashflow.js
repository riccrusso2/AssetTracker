// Bilancio mensile — entrate, spese, risparmio, capitale investibile.
// Puro, testabile in Jest.
//
// È il pezzo che mancava fra lo stipendio e il portafoglio: finora l'app sapeva
// quanto vale il patrimonio ma non da dove arriva, e la liquidità era un unico
// numero scritto a mano. Sta qui e non in App.js per la stessa ragione di
// metrics.js: sono rapporti (tasso di risparmio, tasso di investimento, mesi di
// spese coperti) e un rapporto sbagliato ha lo stesso aspetto di uno giusto.
//
// Regola di fondo: quanto è stato INVESTITO non si inserisce a mano, si ricava
// dal registro movimenti. Un secondo campo da compilare sarebbe una seconda
// fonte di verità, e le due divergerebbero al primo mese distratto.

import { r2 } from "./rebalance";
import { txCashFlow } from "./transactions";

const num = (v) => Number(v) || 0;

export const monthId = (year, month) => `${num(year)}-${String(num(month)).padStart(2, "0")}`;

// ====================== VERSATO, DAL REGISTRO ======================

// Capitale uscito dalla tasca verso il portafoglio, mese per mese.
// I dividendi restano fuori: sono un incasso prodotto dal portafoglio, non un
// versamento. Contarli gonfierebbe sia il "quanto ho investito" sia il tasso di
// investimento sul reddito, che è esattamente la cifra che si vuole onesta.
// Le vendite entrano col segno opposto: un mese in cui si è disinvestito più di
// quanto si è comprato ha versato un importo negativo, e va detto.
export const investedByMonth = (txs = []) => {
  const out = {};
  for (const tx of txs || []) {
    if (tx.type !== "buy" && tx.type !== "sell") continue;
    const k = (tx.date || "").slice(0, 7);
    if (k.length !== 7) continue;
    // txCashFlow è dal punto di vista del portafoglio (acquisto = negativo):
    // il versamento è il suo opposto. Riusarlo tiene commissioni e segni
    // allineati al resto dell'app invece di ricalcolarli qui.
    out[k] = r2((out[k] || 0) - txCashFlow(tx));
  }
  return out;
};

// Versato per anno solare, sempre dal solo registro: non dipende da quanti mesi
// di bilancio sono stati compilati, così il cumulato annuo è disponibile anche
// a chi non usa (ancora) la tab Bilancio.
export const investedByYear = (txs = []) => {
  const out = {};
  for (const [k, v] of Object.entries(investedByMonth(txs))) {
    const y = Number(k.slice(0, 4));
    out[y] = r2((out[y] || 0) + v);
  }
  return out;
};

// ====================== RIGHE DI BILANCIO ======================

// Un mese con i suoi derivati.
//
// I tassi si misurano sul TOTALE delle entrate (stipendio + extra), non sul
// solo stipendio: il mese della tredicesima risulterebbe altrimenti con un
// tasso di risparmio sopra il 100%, che non descrive niente.
// Con entrate a zero i tassi sono `null`, non 0: una percentuale su un
// denominatore nullo è assenza di dato, e mostrarla come 0% direbbe il falso
// ("non ho risparmiato niente") su un mese in cui semplicemente non si sa.
export const monthRow = (m = {}, invested = 0) => {
  const salary   = r2(num(m.salary));
  const extra    = r2(num(m.extra));
  const income   = r2(salary + extra);
  const expenses = r2(num(m.expenses));
  const savings  = r2(income - expenses);
  return {
    id: m.id,
    year: num(m.year),
    month: num(m.month),
    note: m.note || "",
    salary, extra, income, expenses, savings,
    savingsRate:    income > 0 ? r2((savings / income) * 100) : null,
    invested:       r2(invested),
    investmentRate: income > 0 ? r2((invested / income) * 100) : null,
  };
};

// Storico ordinato, col versato agganciato dal registro.
export const cashflowRows = (months = [], txs = []) => {
  const inv = investedByMonth(txs);
  return (months || [])
    .map((m) => monthRow(m, inv[monthId(m.year, m.month)] || 0))
    .sort((a, b) => a.year - b.year || a.month - b.month);
};

// Totali e medie di un insieme di mesi.
// I tassi aggregati si ricalcolano sui totali, NON come media dei tassi
// mensili: la media delle percentuali pesa allo stesso modo il mese da 1.500 €
// e quello da 5.000 € di tredicesima, e restituisce un numero che non
// corrisponde a nessun euro realmente risparmiato.
export const cashflowTotals = (rows = []) => {
  const list = rows || [];
  const sum = (k) => r2(list.reduce((a, x) => a + (x[k] || 0), 0));
  const n = list.length;
  const income = sum("income"), expenses = sum("expenses");
  const savings = sum("savings"), invested = sum("invested");
  return {
    months: n,
    income, expenses, savings, invested,
    savingsRate:    income > 0 ? r2((savings / income) * 100) : null,
    investmentRate: income > 0 ? r2((invested / income) * 100) : null,
    avgIncome:   n ? r2(income / n) : 0,
    avgExpenses: n ? r2(expenses / n) : 0,
    avgSavings:  n ? r2(savings / n) : 0,
    avgInvested: n ? r2(invested / n) : 0,
  };
};

// ====================== FONDO DI SICUREZZA ======================

// Finestra della media spese. Non tutto lo storico: quanto si spendeva due anni
// fa non dice quanto costa vivere adesso, e un fondo dimensionato su quello è
// sbagliato proprio nel momento in cui serve.
export const EF_WINDOW = 6;

// Quanti mesi di spese copre la liquidità, e quanto manca al bersaglio.
// I mesi senza spese registrate restano fuori dalla media: un mese non ancora
// compilato vale zero e abbasserebbe il target proprio perché non si sa nulla.
export const emergencyFund = ({ cash = 0, rows = [], months = 3, window = EF_WINDOW } = {}) => {
  const withExp = (rows || []).filter((r) => r.expenses > 0);
  const recent  = withExp.slice(-Math.max(1, window));
  const avgExpenses = recent.length
    ? r2(recent.reduce((a, r) => a + r.expenses, 0) / recent.length)
    : 0;
  const target = r2(avgExpenses * Math.max(0, num(months)));
  const c = r2(num(cash));
  return {
    avgExpenses,
    target,
    cash: c,
    gap:     r2(Math.max(0, target - c)),
    // Senza un bersaglio non esiste un'eccedenza: con target 0 la formula
    // dichiarerebbe "eccedente" l'intera liquidità di chi non ha ancora
    // registrato una spesa, cioè proprio chi non sa quanto gli serve liquido.
    surplus: target > 0 ? r2(Math.max(0, c - target)) : 0,
    monthsCovered: avgExpenses > 0 ? r2(c / avgExpenses) : null,
    // `ok` richiede un target vero: senza spese registrate non si è "a posto",
    // semplicemente non si sa, e un ✓ verde su zero dati è peggio di un vuoto.
    ok: target > 0 && c >= target,
  };
};

// ====================== QUANTO POSSO INVESTIRE ======================

// Il ponte fra il bilancio e il ribilanciamento.
//
// Tre vincoli, in ordine:
//  1. quanto è avanzato — il risparmio del mese, oppure `targetPct` delle
//     entrate se ci si è dati una quota fissa da destinare agli investimenti;
//  2. quanto manca al fondo di sicurezza, che viene PRIMA: investire la
//     riserva significa doverla disinvestire nel momento peggiore, che è
//     esattamente quando serve;
//  3. la liquidità già eccedente il fondo, che è capitale fermo e si può
//     mettere al lavoro oltre al risparmio del mese.
// `available` è il numero prudente (solo il mese), `total` quello massimo.
export const investableThisMonth = ({
  savings = 0, income = 0, targetPct = 0, emergencyGap = 0, cashSurplus = 0,
} = {}) => {
  const pct = num(targetPct);
  // targetPct = 0 significa "non impostato": si usa quello che è avanzato.
  const planned    = pct > 0 ? r2((num(income) * pct) / 100) : r2(num(savings));
  const gap        = r2(Math.max(0, num(emergencyGap)));
  const available  = r2(Math.max(0, planned - gap));
  const surplus    = r2(Math.max(0, num(cashSurplus)));
  return {
    planned, emergencyGap: gap, available,
    extraFromCash: surplus,
    total: r2(available + surplus),
  };
};

// Pianificato vs realizzato, mese per mese: `planned` è la quota che ci si era
// dati (o il risparmio, se non c'è una quota), `invested` quello che dice il
// registro. `gap` positivo = investito più del previsto.
export const planVsActual = (rows = [], targetPct = 0) => {
  const pct = num(targetPct);
  return (rows || []).map((r) => {
    const planned = pct > 0 ? r2((r.income * pct) / 100) : r2(r.savings);
    return { ...r, planned, gap: r2(r.invested - planned) };
  });
};

// ====================== SERIE PER I GRAFICI ======================

// Cumulato del versato dentro un anno: la curva che risponde a "a che punto
// sono con gli investimenti quest'anno".
export const cumulativeInvested = (rows = []) => {
  let acc = 0;
  return (rows || []).map((r) => {
    acc = r2(acc + r.invested);
    return { year: r.year, month: r.month, invested: r.invested, cumulative: acc };
  });
};
