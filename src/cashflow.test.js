import {
  monthId, investedByMonth, investedByYear, monthRow, cashflowRows,
  cashflowTotals, emergencyFund, investableThisMonth, planVsActual,
  cumulativeInvested,
} from "./cashflow";

const buy  = (date, quantity, price, fee = 0) => ({ date, type: "buy",  quantity, price, fee });
const sell = (date, quantity, price, fee = 0) => ({ date, type: "sell", quantity, price, fee });
const div  = (date, amount, fee = 0)          => ({ date, type: "dividend", amount, fee });

const mese = (year, month, salary, expenses, extra = 0) =>
  ({ id: `${year}-${month}`, year, month, salary, expenses, extra });

// ====================== investedByMonth ======================

test("monthId normalizza il mese a due cifre", () => {
  expect(monthId(2026, 3)).toBe("2026-03");
  expect(monthId(2026, 11)).toBe("2026-11");
});

test("il versato del mese somma gli acquisti con le commissioni", () => {
  const inv = investedByMonth([buy("2026-03-10", 10, 100, 5), buy("2026-03-20", 2, 50)]);
  expect(inv["2026-03"]).toBe(1105);   // 1005 + 100
});

test("una vendita riduce il versato del mese: si è disinvestito, non versato", () => {
  const inv = investedByMonth([buy("2026-03-10", 10, 100), sell("2026-03-25", 4, 150, 5)]);
  expect(inv["2026-03"]).toBe(405);    // 1000 − (600 − 5)
});

// Il dividendo è prodotto dal portafoglio: contarlo come versamento gonfierebbe
// sia il cumulato sia il tasso di investimento sul reddito.
test("i dividendi non sono versamenti", () => {
  const inv = investedByMonth([div("2026-04-01", 200), buy("2026-04-02", 1, 100)]);
  expect(inv["2026-04"]).toBe(100);
});

test("i movimenti senza data valida vengono ignorati invece di finire in un mese a caso", () => {
  expect(investedByMonth([{ ...buy("", 10, 100) }, buy("2026-05-01", 1, 10)]))
    .toEqual({ "2026-05": 10 });
});

test("il versato annuo somma i mesi dell'anno solare", () => {
  const y = investedByYear([buy("2026-01-10", 1, 1000), buy("2026-07-10", 1, 500), buy("2027-02-01", 1, 300)]);
  expect(y[2026]).toBe(1500);
  expect(y[2027]).toBe(300);
});

// ====================== monthRow ======================

test("risparmio e tassi si misurano sul totale delle entrate, extra compresi", () => {
  const r = monthRow({ year: 2026, month: 12, salary: 2000, extra: 2000, expenses: 1500 }, 1000);
  expect(r.income).toBe(4000);
  expect(r.savings).toBe(2500);
  expect(r.savingsRate).toBe(62.5);
  expect(r.investmentRate).toBe(25);   // 1000 / 4000
});

// Regressione concettuale: col solo stipendio al denominatore il mese della
// tredicesima usciva con un tasso di risparmio sopra il 100%.
test("il mese della tredicesima non supera il 100% di tasso di risparmio", () => {
  const r = monthRow({ year: 2026, month: 12, salary: 1800, extra: 1800, expenses: 1200 });
  expect(r.savingsRate).toBeLessThanOrEqual(100);
});

test("entrate a zero: i tassi sono null, non zero", () => {
  const r = monthRow({ year: 2026, month: 1, salary: 0, expenses: 400 }, 0);
  expect(r.savings).toBe(-400);
  expect(r.savingsRate).toBeNull();
  expect(r.investmentRate).toBeNull();
});

test("spese sopra le entrate: risparmio negativo, nessun clamp a zero", () => {
  const r = monthRow({ year: 2026, month: 2, salary: 1000, expenses: 1400 });
  expect(r.savings).toBe(-400);
  expect(r.savingsRate).toBe(-40);
});

// ====================== cashflowRows ======================

test("le righe si ordinano per data e prendono il versato dal registro", () => {
  const rows = cashflowRows(
    [mese(2026, 3, 2000, 1200), mese(2026, 1, 2000, 1500)],
    [buy("2026-03-10", 5, 100)],
  );
  expect(rows.map((r) => r.month)).toEqual([1, 3]);
  expect(rows[0].invested).toBe(0);
  expect(rows[1].invested).toBe(500);
});

test("i totali ricalcolano i tassi sui totali, non come media delle percentuali", () => {
  // Gen: 1.000 entrate, 900 spese → 10%. Dic: 5.000 entrate, 1.000 spese → 80%.
  // Media delle percentuali = 45%; il tasso vero è 4.100 / 6.000 = 68,33%.
  const rows = cashflowRows([mese(2026, 1, 1000, 900), mese(2026, 12, 5000, 1000)], []);
  const t = cashflowTotals(rows);
  expect(t.income).toBe(6000);
  expect(t.savings).toBe(4100);
  expect(t.savingsRate).toBe(68.33);
  expect(t.avgSavings).toBe(2050);
});

test("totali su nessun mese: zero ovunque e tassi null, senza divisioni per zero", () => {
  const t = cashflowTotals([]);
  expect(t.months).toBe(0);
  expect(t.income).toBe(0);
  expect(t.savingsRate).toBeNull();
  expect(t.avgExpenses).toBe(0);
});

// ====================== emergencyFund ======================

test("il fondo di sicurezza è N mesi di spesa media recente", () => {
  const rows = cashflowRows(
    [mese(2026, 1, 2000, 1000), mese(2026, 2, 2000, 1200), mese(2026, 3, 2000, 1100)], []);
  const ef = emergencyFund({ cash: 5000, rows, months: 3 });
  expect(ef.avgExpenses).toBe(1100);
  expect(ef.target).toBe(3300);
  expect(ef.surplus).toBe(1700);
  expect(ef.gap).toBe(0);
  expect(ef.ok).toBe(true);
});

test("liquidità sotto il bersaglio: gap positivo e nessun surplus", () => {
  const rows = cashflowRows([mese(2026, 1, 2000, 1500)], []);
  const ef = emergencyFund({ cash: 2000, rows, months: 3 });
  expect(ef.target).toBe(4500);
  expect(ef.gap).toBe(2500);
  expect(ef.surplus).toBe(0);
  expect(ef.monthsCovered).toBe(1.33);
  expect(ef.ok).toBe(false);
});

// I mesi non ancora compilati valgono zero: tenerli nella media abbasserebbe il
// bersaglio proprio perché non si sa nulla di quei mesi.
test("i mesi senza spese registrate restano fuori dalla media", () => {
  const rows = cashflowRows([mese(2026, 1, 2000, 1200), mese(2026, 2, 0, 0)], []);
  expect(emergencyFund({ cash: 0, rows, months: 3 }).avgExpenses).toBe(1200);
});

test("solo gli ultimi mesi della finestra contano: le spese vecchie non dimensionano il fondo", () => {
  const rows = cashflowRows([
    mese(2025, 1, 2000, 3000),   // fuori finestra
    ...[1, 2, 3, 4, 5, 6].map((m) => mese(2026, m, 2000, 1000)),
  ], []);
  expect(emergencyFund({ cash: 0, rows, months: 3, window: 6 }).avgExpenses).toBe(1000);
});

test("senza spese registrate non si è 'a posto': target zero e ok falso", () => {
  const ef = emergencyFund({ cash: 10000, rows: [], months: 3 });
  expect(ef.target).toBe(0);
  expect(ef.ok).toBe(false);
  expect(ef.monthsCovered).toBeNull();
  // Regressione: con target 0 la formula dichiarava eccedente tutta la
  // liquidità, e l'app suggeriva di investire il fondo di emergenza intero
  // proprio a chi non aveva ancora registrato una spesa.
  expect(ef.surplus).toBe(0);
});

// ====================== investableThisMonth ======================

test("senza quota impostata l'investibile è il risparmio del mese", () => {
  const p = investableThisMonth({ savings: 800, income: 2000 });
  expect(p.planned).toBe(800);
  expect(p.available).toBe(800);
  expect(p.total).toBe(800);
});

test("con una quota sulle entrate il piano segue quella, non il risparmio", () => {
  const p = investableThisMonth({ savings: 800, income: 2000, targetPct: 30 });
  expect(p.planned).toBe(600);
});

// Il fondo viene prima: investire la riserva significa doverla disinvestire nel
// momento peggiore, che è esattamente quando serve.
test("quello che manca al fondo di sicurezza si sottrae prima di investire", () => {
  const p = investableThisMonth({ savings: 800, income: 2000, emergencyGap: 300 });
  expect(p.available).toBe(500);
  expect(p.emergencyGap).toBe(300);
});

test("gap più grande del risparmio: investibile zero, mai negativo", () => {
  const p = investableThisMonth({ savings: 400, income: 2000, emergencyGap: 1000 });
  expect(p.available).toBe(0);
  expect(p.total).toBe(0);
});

test("la liquidità già eccedente il fondo si somma al totale investibile", () => {
  const p = investableThisMonth({ savings: 800, income: 2000, cashSurplus: 5000 });
  expect(p.available).toBe(800);
  expect(p.extraFromCash).toBe(5000);
  expect(p.total).toBe(5800);
});

// ====================== planVsActual ======================

test("pianificato vs realizzato: il gap dice se si è rispettato il piano", () => {
  const rows = cashflowRows([mese(2026, 1, 2000, 1200), mese(2026, 2, 2000, 1200)],
    [buy("2026-01-15", 1, 500), buy("2026-02-15", 1, 1000)]);
  const plan = planVsActual(rows, 40);   // 40% di 2.000 = 800
  expect(plan[0].planned).toBe(800);
  expect(plan[0].gap).toBe(-300);        // versati 500, sotto il piano
  expect(plan[1].gap).toBe(200);         // versati 1.000, sopra
});

test("senza quota il piano è il risparmio del mese", () => {
  const rows = cashflowRows([mese(2026, 1, 2000, 1200)], [buy("2026-01-15", 1, 500)]);
  expect(planVsActual(rows, 0)[0].planned).toBe(800);
});

// ====================== cumulativeInvested ======================

test("il cumulato cresce mese su mese e regge un mese in disinvestimento", () => {
  const rows = cashflowRows(
    [mese(2026, 1, 2000, 1000), mese(2026, 2, 2000, 1000), mese(2026, 3, 2000, 1000)],
    [buy("2026-01-10", 1, 500), buy("2026-02-10", 1, 700), sell("2026-03-10", 1, 200)]);
  expect(cumulativeInvested(rows).map((r) => r.cumulative)).toEqual([500, 1200, 1000]);
});
