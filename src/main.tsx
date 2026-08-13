import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import * as I from "lucide-react";
import readXlsxFile from "read-excel-file/browser";
import "./styles.css";

const money = (n = 0) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
const api = async (path: string, options: any = {}) => {
  const token = localStorage.getItem("token");
  const r = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message);
  return data;
};
const Logo = ({ compact = false }: { compact?: boolean }) => (
  <div className="logo">
    <svg viewBox="0 0 64 64">
      <path d="M6 32 32 10l26 22" />
      <rect x="14" y="32" width="36" height="24" rx="3" />
      <line x1="32" y1="32" x2="32" y2="56" />
    </svg>
    {!compact && <span>OikonOS</span>}
  </div>
);
const Empty = ({
  icon: Icon = I.Inbox,
  title,
  text,
}: {
  icon?: any;
  title: string;
  text: string;
}) => (
  <div className="empty">
    <Icon />
    <strong>{title}</strong>
    <span>{text}</span>
  </div>
);
const Modal = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: any;
}) => (
  <div className="overlay" onMouseDown={onClose}>
    <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose}>
          <I.X />
        </button>
      </div>
      {children}
    </div>
  </div>
);
function Login({ onLogin }: { onLogin: (x: any) => void }) {
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [businessName, setBusinessName] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const d = await api(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(
          register
            ? { email, password, name, businessName }
            : { email, password },
        ),
      });
      const current = {
        ...d.user,
        businessName: d.business?.name || businessName,
      };
      localStorage.setItem("token", d.token);
      localStorage.setItem("user", JSON.stringify(current));
      onLogin(current);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login">
      <section className="login-story">
        <Logo />
        <div>
          <span className="eyebrow">BUSINESS, UNDERSTOOD.</span>
          <h1>The operating system for your business.</h1>
          <p>
            Manage what you have. Understand what is happening. Grow what you've
            built.
          </p>
        </div>
        <div className="quote">
          A calm, complete view of your business—every sale, every product,
          every decision.
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <div className="mobile-logo">
            <Logo />
          </div>
          <span className="eyebrow">
            {register ? "CREATE YOUR WORKSPACE" : "WELCOME BACK"}
          </span>
          <h2>{register ? "Set up OikonOS" : "Sign in to OikonOS"}</h2>
          <p>
            {register
              ? "Create your owner account and business workspace."
              : "Continue to your business workspace."}
          </p>
          {error && (
            <div className="error">
              <I.CircleAlert />
              {error}
            </div>
          )}
          {register && (
            <>
              <label>
                Your name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Business name
                <input
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Email address
            <input
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={register ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
          </label>
          <button className="primary wide" disabled={loading}>
            {loading
              ? "Please wait…"
              : register
                ? "Create workspace"
                : "Sign in"}
            <I.ArrowRight />
          </button>
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New to OikonOS? Create your workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}
const nav = [
  ["Overview", I.LayoutDashboard, "/"],
  ["Point of sale", I.ScanLine, "/pos"],
  ["Sales", I.ReceiptText, "/sales"],
  ["Products", I.Package, "/products"],
  ["Inventory", I.Boxes, "/inventory"],
  ["Customers", I.Users, "/customers"],
  ["Expenses", I.WalletCards, "/expenses"],
  ["Reports", I.ChartNoAxesCombined, "/reports"],
];
function Shell({ user, onLogout }: { user: any; onLogout: () => void }) {
  const loc = useLocation(),
    go = useNavigate();
  const allowed =
    user.role === "seller"
      ? nav.filter((x) => ["Point of sale", "Sales"].includes(x[0] as string))
      : nav;
  const page = loc.pathname,
    business = user.businessName || "Your business",
    initials = business
      .split(" ")
      .map((x: string) => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  return (
    <div className="shell">
      <aside>
        <Logo />
        <div className="business">
          <div>{initials}</div>
          <span>
            <b>{business}</b>
            <small>Business workspace</small>
          </span>
          <I.ChevronsUpDown />
        </div>
        <nav>
          {allowed.map(([name, Icon, path]: any) => (
            <button
              key={path}
              className={page === path ? "active" : ""}
              onClick={() => go(path)}
            >
              <Icon />
              {name}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <button onClick={() => go("/settings")}>
            <I.Settings />
            Settings
          </button>
          <div className="profile">
            <div>
              {user.name
                .split(" ")
                .map((x: string) => x[0])
                .join("")
                .slice(0, 2)}
            </div>
            <span>
              <b>{user.name}</b>
              <small>{user.role}</small>
            </span>
            <button onClick={onLogout}>
              <I.LogOut />
            </button>
          </div>
        </div>
      </aside>
      <div className="mobilebar">
        <Logo />
        <button>
          <I.Menu />
        </button>
      </div>
      <section className="content">
        <Page path={page} user={user} />
      </section>
    </div>
  );
}
function Header({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: any;
}) {
  return (
    <header className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}
function Dashboard({ user }: any) {
  const [d, setD] = useState<any>();
  useEffect(() => {
    api("/dashboard").then(setD);
  }, []);
  if (!d) return <Loader />;
  const max = Math.max(...d.byDay.map((x: any) => x.value), 1);
  return (
    <>
      <Header
        eyebrow={new Date()
          .toLocaleDateString("en-NG", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
          .toUpperCase()}
        title={`Welcome, ${user.name.split(" ")[0]}.`}
        subtitle={`Here is what is happening across ${user.businessName || "your business"} today.`}
        action={
          <button className="secondary">
            <I.CalendarDays />
            Last 30 days
            <I.ChevronDown />
          </button>
        }
      />
      <div className="metrics">
        <Metric label="Revenue" value={money(d.revenue)} icon={I.Banknote} />
        <Metric
          label="Net profit"
          value={money(d.profit)}
          icon={I.TrendingUp}
        />
        <Metric label="Transactions" value={d.transactions} icon={I.Receipt} />
        <Metric
          label="Average order"
          value={money(d.aov)}
          icon={I.BadgeDollarSign}
        />
      </div>
      <div className="payment-breakdown">
        <div>
          <span>
            <I.Banknote />
            Cash sales
          </span>
          <b>{money(d.cashSales)}</b>
        </div>
        <div>
          <span>
            <I.CreditCard />
            POS sales
          </span>
          <b>{money(d.posSales)}</b>
        </div>
        <div>
          <span>
            <I.Boxes />
            Inventory value
          </span>
          <b>{money(d.inventoryValue)}</b>
        </div>
        <div>
          <span>
            <I.PackageX />
            Out of stock
          </span>
          <b>{d.outOfStock}</b>
        </div>
      </div>
      <div className="insight">
        <div className="insight-icon">
          <I.Sparkles />
        </div>
        <div>
          <span>OIKONOS INSIGHT</span>
          <strong>{d.insight}</strong>
          <button>
            Review inventory <I.ArrowUpRight />
          </button>
        </div>
      </div>
      <div className="grid2">
        <div className="card chart">
          <CardHead
            title="Revenue trend"
            sub="Daily sales over the last 7 days"
          />
          <div className="bars">
            {d.byDay.map((x: any) => (
              <div className="bar-wrap" key={x.day}>
                <span>{x.value ? money(x.value).replace(".00", "") : ""}</span>
                <div
                  className="bar"
                  style={{ height: `${Math.max(8, (x.value / max) * 150)}px` }}
                ></div>
                <small>{x.day}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <CardHead title="Top products" sub="By units sold this month" />
          <div className="rank">
            {d.topProducts.map((p: any, i: number) => (
              <div key={p.name}>
                <b>{i + 1}</b>
                <span>
                  {p.name}
                  <small>{p.units} units sold</small>
                </span>
                <strong>
                  {Math.round(
                    (p.units /
                      d.topProducts.reduce(
                        (a: number, x: any) => a + x.units,
                        0,
                      )) *
                      100,
                  )}
                  %
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid2 bottom">
        <div className="card">
          <CardHead
            title="Recent transactions"
            sub="Latest activity across your store"
          />
          <SalesTable rows={d.recent} mini />
        </div>
        <div className="card">
          <CardHead
            title="Stock attention"
            sub={`${d.lowStock.length} products need review`}
          />
          <div className="stock-list">
            {d.lowStock.slice(0, 4).map((p: any) => (
              <div key={p.id}>
                <div className="product-icon">
                  <I.Package />
                </div>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.sku} · {p.category}
                  </small>
                </span>
                <em className={p.stock === 0 ? "danger" : ""}>
                  {p.stock === 0 ? "Out of stock" : `${p.stock} left`}
                </em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
const Metric = ({ label, value, icon: Icon }: any) => (
  <div className="metric">
    <div className="metric-top">
      <span>{label}</span>
      <Icon />
    </div>
    <strong>{value}</strong>
    <small>Calculated from recorded activity</small>
  </div>
);
const CardHead = ({ title, sub }: any) => (
  <div className="card-head">
    <div>
      <h3>{title}</h3>
      <p>{sub}</p>
    </div>
    <button className="icon-btn">
      <I.MoreHorizontal />
    </button>
  </div>
);
function Products({ inventory = false }: { inventory?: boolean }) {
  const [items, setItems] = useState<any[]>([]),
    [show, setShow] = useState(false),
    [importing, setImporting] = useState(false),
    [adjusting, setAdjusting] = useState<any>(null),
    [movements, setMovements] = useState<any[]>([]),
    [anomalies, setAnomalies] = useState<any[]>([]),
    [query, setQuery] = useState("");
  const load = () => {
    api("/products").then(setItems);
    if (inventory) {
      api("/stock-movements").then(setMovements);
      api("/inventory/anomalies").then(setAnomalies);
    }
  };
  useEffect(load, []);
  const filtered = items.filter((x) =>
    (x.name + x.sku + x.category).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <Header
        eyebrow={inventory ? "STOCK CONTROL" : "CATALOG"}
        title={inventory ? "Inventory" : "Products"}
        subtitle={
          inventory
            ? "Know what is moving, what is low, and what needs attention."
            : "Manage your catalog, pricing, and product availability."
        }
        action={
          <div className="header-actions">
            <button className="secondary" onClick={() => setImporting(true)}>
              <I.FileSpreadsheet />
              Import stock
            </button>
            <button className="primary" onClick={() => setShow(true)}>
              <I.Plus />
              Add product
            </button>
          </div>
        }
      />
      <div className="summary-strip">
        <span>
          <b>{items.length}</b> Total products
        </span>
        <span>
          <b>{items.filter((x) => x.stock > 0).length}</b> In stock
        </span>
        <span>
          <b>{items.filter((x) => x.stock <= x.threshold).length}</b> Low stock
        </span>
        <span>
          <b>{money(items.reduce((a, x) => a + x.stock * x.cost, 0))}</b>{" "}
          Inventory value
        </span>
      </div>
      {inventory && anomalies.length > 0 && (
        <div className="anomaly-panel">
          <div>
            <I.TriangleAlert />
            <span>
              <b>
                {anomalies.length} stock{" "}
                {anomalies.length === 1 ? "event needs" : "events need"} review
              </b>
              <small>Review unusual movement without assuming a cause.</small>
            </span>
          </div>
          {anomalies.slice(0, 3).map((a) => (
            <div className="anomaly-row" key={a.id}>
              <span>
                <b>{a.productName}</b>
                <small>{a.message}</small>
              </span>
              <em className={a.severity}>
                {a.kind === "unusual_sales"
                  ? `${a.actual} units · ${a.differencePercent}% above normal`
                  : `${a.actual} units adjusted`}
              </em>
            </div>
          ))}
        </div>
      )}
      <div className="table-card">
        <div className="toolbar">
          <div className="search">
            <I.Search />
            <input
              placeholder="Search products or SKU…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="secondary">
            <I.SlidersHorizontal />
            Filter
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Cost</th>
              <th>Stock</th>
              <th>Status</th>
              {inventory && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="product-cell">
                    <div className="product-icon">
                      <I.Package />
                    </div>
                    <span>
                      <b>{p.name}</b>
                      <small>{p.sku}</small>
                    </span>
                  </div>
                </td>
                {inventory && (
                  <td>
                    <button
                      className="table-action"
                      onClick={() => setAdjusting(p)}
                    >
                      <I.Scale />
                      Reconcile
                    </button>
                  </td>
                )}
                <td>{p.category}</td>
                <td className="mono">{money(p.price)}</td>
                <td className="mono muted">{money(p.cost)}</td>
                <td className="mono">{p.stock}</td>
                <td>
                  <span
                    className={`pill ${p.stock === 0 ? "red" : p.stock <= p.threshold ? "amber" : "green"}`}
                  >
                    {p.stock === 0
                      ? "Out of stock"
                      : p.stock <= p.threshold
                        ? "Low stock"
                        : "In stock"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && (
        <ProductForm
          close={() => setShow(false)}
          done={() => {
            setShow(false);
            load();
          }}
        />
      )}
      {adjusting && (
        <StockAdjustment
          product={adjusting}
          close={() => setAdjusting(null)}
          done={() => {
            setAdjusting(null);
            load();
          }}
        />
      )}
      {importing && (
        <StockImport
          close={() => setImporting(false)}
          done={() => {
            setImporting(false);
            load();
          }}
        />
      )}
      {inventory && (
        <div className="table-card movement-card">
          <div className="section-title">
            <div>
              <h3>Stock movement history</h3>
              <p>Every recorded change to product quantity.</p>
            </div>
            <I.History />
          </div>
          {movements.length ? (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Movement</th>
                  <th>Balance</th>
                  <th>Reason</th>
                  <th>Recorded by</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 30).map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>{m.productName}</b>
                    </td>
                    <td
                      className={`mono ${m.quantity > 0 ? "positive" : "negative"}`}
                    >
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </td>
                    <td className="mono">
                      {m.previousStock} → {m.newStock}
                    </td>
                    <td>
                      <span className="pill blue">
                        {m.type.replace("_", " ")}
                      </span>
                      <small>{m.reason}</small>
                    </td>
                    <td>{m.userName}</td>
                    <td>
                      {new Date(m.createdAt).toLocaleString("en-NG", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty
              icon={I.History}
              title="No stock movements yet"
              text="Opening stock, sales, and reconciliations will appear here."
            />
          )}
        </div>
      )}
    </>
  );
}
const importHeaders: Record<string, string> = {
  "product name": "name",
  sku: "sku",
  category: "category",
  "selling price": "price",
  "cost price": "cost",
  quantity: "quantity",
  "low stock threshold": "threshold",
};
function StockImport({ close, done }: any) {
  const [stage, setStage] = useState<"upload" | "preview" | "confirm">(
      "upload",
    ),
    [preview, setPreview] = useState<any>(null),
    [validRows, setValidRows] = useState<any[]>([]),
    [mode, setMode] = useState<"add" | "replace">("add"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const choose = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("The workbook must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const rows = await readXlsxFile(file);
      if (rows.length < 2)
        throw new Error("The workbook does not contain any product rows.");
      const headers = rows[0].map((x) =>
          String(x ?? "")
            .trim()
            .toLowerCase(),
        ),
        missing = Object.keys(importHeaders).filter(
          (h) => !headers.includes(h),
        );
      if (missing.length)
        throw new Error(`Missing required columns: ${missing.join(", ")}.`);
      const data = rows
        .slice(1)
        .filter((r) => r.some((v) => v !== null && v !== ""))
        .map((r) => {
          const item: any = {};
          headers.forEach((h, i) => {
            const key = importHeaders[h];
            if (key)
              item[key] = ["price", "cost", "quantity", "threshold"].includes(
                key,
              )
                ? Number(r[i])
                : String(r[i] ?? "").trim();
          });
          return item;
        });
      const result = await api("/products/import/preview", {
        method: "POST",
        body: JSON.stringify({ rows: data }),
      });
      setPreview(result);
      setValidRows(
        result.rows.filter((r: any) => r.valid).map((r: any) => r.data),
      );
      setStage("preview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/products/import/confirm", {
        method: "POST",
        body: JSON.stringify({ mode, rows: validRows }),
      });
      done();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Import products and stock" onClose={close}>
      <div className="import-flow">
        <div className="import-steps">
          <span className="active">1 Upload</span>
          <span className={stage !== "upload" ? "active" : ""}>2 Validate</span>
          <span className={stage === "confirm" ? "active" : ""}>3 Confirm</span>
        </div>
        {error && (
          <div className="error">
            <I.CircleAlert />
            {error}
          </div>
        )}
        {stage === "upload" && (
          <label className="upload-zone">
            <I.FileSpreadsheet />
            <b>{busy ? "Reading workbook…" : "Choose an Excel workbook"}</b>
            <span>.xlsx · maximum 5 MB · up to 5,000 products</span>
            <input
              disabled={busy}
              type="file"
              accept=".xlsx"
              onChange={choose}
            />
          </label>
        )}
        {stage === "preview" && preview && (
          <>
            <div className="import-summary">
              <span>
                <b>{preview.summary.total}</b>Total rows
              </span>
              <span>
                <b>{preview.summary.valid}</b>Ready
              </span>
              <span className={preview.summary.invalid ? "negative" : ""}>
                <b>{preview.summary.invalid}</b>Need correction
              </span>
              <span>
                <b>{preview.summary.conflicts}</b>Existing SKUs
              </span>
            </div>
            <div className="import-table">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Quantity</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 100).map((r: any) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.data.name || "—"}</td>
                      <td className="mono">{r.data.sku || "—"}</td>
                      <td>{r.data.quantity ?? "—"}</td>
                      <td>
                        {!r.valid ? (
                          <span className="pill red" title={r.errors.join(" ")}>
                            Fix row
                          </span>
                        ) : r.conflict ? (
                          <span className="pill amber">
                            Existing · {r.conflict.currentStock} in stock
                          </span>
                        ) : (
                          <span className="pill green">New product</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <button className="secondary" onClick={() => setStage("upload")}>
                Choose another file
              </button>
              <button
                className="primary"
                disabled={!validRows.length}
                onClick={() => setStage("confirm")}
              >
                Continue with {validRows.length} valid rows
                <I.ArrowRight />
              </button>
            </div>
          </>
        )}
        {stage === "confirm" && (
          <>
            <div className="conflict-choice">
              <h3>How should existing stock be handled?</h3>
              <p>
                This applies only to SKUs already in OikonOS. New products will
                use the uploaded quantity as opening stock.
              </p>
              <button
                className={mode === "add" ? "selected" : ""}
                onClick={() => setMode("add")}
              >
                <I.PlusCircle />
                <span>
                  <b>Add uploaded quantity</b>
                  <small>Uploaded quantity is added to current stock.</small>
                </span>
              </button>
              <button
                className={mode === "replace" ? "selected" : ""}
                onClick={() => setMode("replace")}
              >
                <I.Replace />
                <span>
                  <b>Replace current quantity</b>
                  <small>Current stock becomes the uploaded quantity.</small>
                </span>
              </button>
            </div>
            <div className="import-warning">
              <I.Info />
              This action will create stock movement records for every quantity
              change.
            </div>
            <div className="form-actions">
              <button className="secondary" onClick={() => setStage("preview")}>
                Back to preview
              </button>
              <button className="primary" disabled={busy} onClick={confirm}>
                {busy ? "Importing…" : `Confirm ${validRows.length} rows`}
                <I.Check />
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
function StockAdjustment({ product, close, done }: any) {
  const [count, setCount] = useState(String(product.stock)),
    [reason, setReason] = useState(""),
    [type, setType] = useState("correction"),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const difference = Number(count) - product.stock;
  const submit = async (e: any) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/products/${product.id}/adjust-stock`, {
        method: "POST",
        body: JSON.stringify({ physicalCount: Number(count), reason, type }),
      });
      done();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };
  return (
    <Modal title={`Reconcile ${product.name}`} onClose={close}>
      <form className="form" onSubmit={submit}>
        <div className="reconcile-summary full">
          <span>
            <small>System quantity</small>
            <b>{product.stock}</b>
          </span>
          <I.ArrowRight />
          <span>
            <small>Physical count</small>
            <b>{count || "—"}</b>
          </span>
          <span className={difference < 0 ? "negative" : "positive"}>
            <small>Difference</small>
            <b>
              {difference > 0 ? "+" : ""}
              {Number.isFinite(difference) ? difference : "—"}
            </b>
          </span>
        </div>
        {error && (
          <div className="error full">
            <I.CircleAlert />
            {error}
          </div>
        )}
        <label>
          Physical count
          <input
            required
            min="0"
            type="number"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </label>
        <label>
          Movement type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="correction">Stock count correction</option>
            <option value="restock">Restock</option>
            <option value="return">Return</option>
            <option value="damaged">Damaged</option>
            <option value="expired">Expired</option>
            <option value="adjustment">Other adjustment</option>
          </select>
        </label>
        <label className="full">
          Reason
          <input
            required
            minLength={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why the physical count differs"
          />
        </label>
        <div className="form-actions full">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving || difference === 0}>
            {saving ? "Recording…" : "Record adjustment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ProductForm({ close, done }: any) {
  const [f, setF] = useState({
      name: "",
      sku: "",
      category: "",
      price: "",
      cost: "",
      stock: "",
      threshold: "5",
    }),
    [error, setError] = useState("");
  const submit = async (e: any) => {
    e.preventDefault();
    try {
      await api("/products", {
        method: "POST",
        body: JSON.stringify({
          ...f,
          price: +f.price,
          cost: +f.cost,
          stock: +f.stock,
          threshold: +f.threshold,
        }),
      });
      done();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal title="Add a new product" onClose={close}>
      <form className="form" onSubmit={submit}>
        {error && <div className="error">{error}</div>}
        <label className="full">
          Product name
          <input
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </label>
        <label>
          SKU
          <input
            required
            value={f.sku}
            onChange={(e) => setF({ ...f, sku: e.target.value })}
          />
        </label>
        <label>
          Category
          <input
            required
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value })}
          />
        </label>
        <label>
          Selling price
          <input
            required
            type="number"
            value={f.price}
            onChange={(e) => setF({ ...f, price: e.target.value })}
          />
        </label>
        <label>
          Cost price
          <input
            required
            type="number"
            value={f.cost}
            onChange={(e) => setF({ ...f, cost: e.target.value })}
          />
        </label>
        <label>
          Opening stock
          <input
            required
            type="number"
            value={f.stock}
            onChange={(e) => setF({ ...f, stock: e.target.value })}
          />
        </label>
        <label>
          Low-stock alert
          <input
            required
            type="number"
            value={f.threshold}
            onChange={(e) => setF({ ...f, threshold: e.target.value })}
          />
        </label>
        <div className="form-actions full">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary">Add product</button>
        </div>
      </form>
    </Modal>
  );
}
function POS() {
  const [products, setProducts] = useState<any[]>([]),
    [cart, setCart] = useState<Record<string, number>>({}),
    [query, setQuery] = useState(""),
    [pay, setPay] = useState<"cash" | "pos">("cash"),
    [confirming, setConfirming] = useState(false),
    [processing, setProcessing] = useState(false),
    [receipt, setReceipt] = useState<any>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    api("/products").then(setProducts);
  }, []);
  const rows = products
    .filter((p) => cart[p.id])
    .map((p) => ({ ...p, qty: cart[p.id] }));
  const total = rows.reduce((a, p) => a + p.price * p.qty, 0);
  const add = (p: any) => {
    if (p.stock > 0)
      setCart((c) => ({ ...c, [p.id]: Math.min(p.stock, (c[p.id] || 0) + 1) }));
  };
  const checkout = async () => {
    if (processing) return;
    setProcessing(true);
    setMessage("");
    try {
      const s = await api("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: rows.map((x) => ({ productId: x.id, qty: x.qty })),
          payment: pay,
        }),
      });
      setCart({});
      setReceipt(s);
      setConfirming(false);
      setProducts(await api("/products"));
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setProcessing(false);
    }
  };
  return (
    <div className="pos">
      <div className="pos-main">
        <Header
          eyebrow="POINT OF SALE"
          title="New sale"
          subtitle="Select products to start a transaction."
        />
        <div className="search pos-search">
          <I.Search />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products by name or SKU…"
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="category-chips">
          <button className="selected">All products</button>
          {[...new Set(products.map((p) => p.category))].map((x) => (
            <button key={x}>{x}</button>
          ))}
        </div>
        <div className="product-grid">
          {products
            .filter((p) =>
              (p.name + p.sku).toLowerCase().includes(query.toLowerCase()),
            )
            .map((p) => (
              <button
                disabled={!p.stock}
                onClick={() => add(p)}
                className="product-tile"
                key={p.id}
              >
                <div>
                  <I.Package />
                </div>
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.stock ? p.stock + " in stock" : "Out of stock"}
                  </small>
                </span>
                <strong>{money(p.price)}</strong>
                {cart[p.id] && <em>{cart[p.id]}</em>}
              </button>
            ))}
        </div>
      </div>
      <aside className="cart">
        <h2>
          Current order <span>{rows.reduce((a, x) => a + x.qty, 0)}</span>
        </h2>
        {message && (
          <div className="error">
            <I.CircleAlert />
            {message}
          </div>
        )}
        <div className="cart-items">
          {rows.length === 0 ? (
            <Empty
              icon={I.ShoppingBasket}
              title="Your cart is empty"
              text="Select a product to add it to this order."
            />
          ) : (
            rows.map((p) => (
              <div className="cart-row" key={p.id}>
                <div>
                  <b>{p.name}</b>
                  <small>{money(p.price)} each</small>
                </div>
                <div className="stepper">
                  <button
                    onClick={() =>
                      setCart((c) => ({
                        ...c,
                        [p.id]: Math.max(0, c[p.id] - 1),
                      }))
                    }
                  >
                    −
                  </button>
                  <span>{p.qty}</span>
                  <button onClick={() => add(p)}>+</button>
                </div>
                <strong>{money(p.price * p.qty)}</strong>
              </div>
            ))
          )}
        </div>
        <div className="checkout">
          <div>
            <span>Subtotal</span>
            <b>{money(total)}</b>
          </div>
          <div>
            <span>Tax</span>
            <b>—</b>
          </div>
          <div className="total">
            <span>Total</span>
            <b>{money(total)}</b>
          </div>
          <span className="payment-label">Payment method</span>
          <div className="payment-options">
            <button
              className={pay === "cash" ? "selected" : ""}
              onClick={() => setPay("cash")}
            >
              <I.Banknote />
              <span>
                <b>Cash</b>
                <small>Received in cash</small>
              </span>
            </button>
            <button
              className={pay === "pos" ? "selected" : ""}
              onClick={() => setPay("pos")}
            >
              <I.CreditCard />
              <span>
                <b>POS</b>
                <small>Confirmed on terminal</small>
              </span>
            </button>
          </div>
          <button
            className="primary wide"
            disabled={!rows.length || processing}
            onClick={() => setConfirming(true)}
          >
            Review payment <I.ArrowRight />
          </button>
        </div>
      </aside>
      {confirming && (
        <Modal
          title="Confirm payment received"
          onClose={() => setConfirming(false)}
        >
          <div className="payment-review">
            <div className="review-icon">
              <I.ShieldCheck />
            </div>
            <p>
              Confirm that payment has been received. Stock will only be
              deducted after this confirmation.
            </p>
            <div className="review-facts">
              <span>
                Items<b>{rows.reduce((a, x) => a + x.qty, 0)}</b>
              </span>
              <span>
                Payment<b>{pay.toUpperCase()}</b>
              </span>
              <span>
                Total<b>{money(total)}</b>
              </span>
            </div>
            {message && (
              <div className="error">
                <I.CircleAlert />
                {message}
              </div>
            )}
            <div className="form-actions">
              <button
                className="secondary"
                onClick={() => setConfirming(false)}
              >
                Go back
              </button>
              <button
                className="primary"
                disabled={processing}
                onClick={checkout}
              >
                {processing ? "Recording sale…" : "Confirm payment"}
                <I.Check />
              </button>
            </div>
          </div>
        </Modal>
      )}
      {receipt && (
        <div className="overlay">
          <div className="modal receipt">
            <div className="receipt-success">
              <div>
                <I.Check />
              </div>
              <span>PAYMENT CONFIRMED</span>
              <h2>Sale completed</h2>
              <p>Stock and sales records have been updated.</p>
            </div>
            <div className="receipt-details">
              <span>
                Transaction<b>{receipt.number}</b>
              </span>
              <span>
                Payment method<b>{receipt.payment.toUpperCase()}</b>
              </span>
              <span>
                Items sold
                <b>
                  {receipt.items.reduce((a: number, x: any) => a + x.qty, 0)}
                </b>
              </span>
              <span>
                Total paid<strong>{money(receipt.total)}</strong>
              </span>
            </div>
            <button
              className="primary wide"
              onClick={() => {
                setReceipt(null);
                setQuery("");
                setPay("cash");
              }}
            >
              Start next sale <I.ArrowRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function Sales() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api("/sales").then(setRows);
  }, []);
  return (
    <>
      <Header
        eyebrow="SALES LEDGER"
        title="Sales"
        subtitle="Every transaction, payment, and customer in one place."
        action={
          <button className="secondary">
            <I.Download />
            Export CSV
          </button>
        }
      />
      <div className="table-card">
        <div className="toolbar">
          <div className="search">
            <I.Search />
            <input placeholder="Search by receipt or customer…" />
          </div>
          <button className="secondary">
            <I.CalendarDays />
            Date range
          </button>
        </div>
        <SalesTable rows={rows} />
      </div>
    </>
  );
}
function SalesTable({ rows, mini = false }: any) {
  return (
    <table>
      <thead>
        <tr>
          <th>Transaction</th>
          {!mini && <th>Customer</th>}
          <th>Payment</th>
          <th>Total</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s: any) => (
          <tr key={s.id}>
            <td>
              <b>{s.number}</b>
              <small>
                {new Date(s.createdAt).toLocaleDateString("en-NG", {
                  day: "2-digit",
                  month: "short",
                })}{" "}
                · {s.sellerName}
              </small>
            </td>
            {!mini && <td>{s.customerName || "Walk-in customer"}</td>}
            <td className="capitalize">{s.payment}</td>
            <td className="mono">
              <b>{money(s.total)}</b>
            </td>
            <td>
              <span className="pill green">Completed</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function SimpleList({ type }: { type: "customers" | "expenses" }) {
  const [rows, setRows] = useState<any[]>([]),
    [show, setShow] = useState(false);
  const load = () => api("/" + type).then(setRows);
  useEffect(load, [type]);
  return (
    <>
      <Header
        eyebrow={type === "customers" ? "RELATIONSHIPS" : "CASH FLOW"}
        title={type === "customers" ? "Customers" : "Expenses"}
        subtitle={
          type === "customers"
            ? "Understand who buys from you and how often they return."
            : "Track where money goes and protect your margins."
        }
        action={
          <button className="primary" onClick={() => setShow(true)}>
            <I.Plus />
            Add {type === "customers" ? "customer" : "expense"}
          </button>
        }
      />
      <div className="table-card">
        <table>
          <thead>
            <tr>
              {type === "customers" ? (
                <>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Purchases</th>
                  <th>Total spent</th>
                  <th>Last purchase</th>
                </>
              ) : (
                <>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Date</th>
                  <th>Amount</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) =>
              type === "customers" ? (
                <tr key={x.id}>
                  <td>
                    <b>{x.name}</b>
                  </td>
                  <td>
                    {x.phone}
                    <small>{x.email}</small>
                  </td>
                  <td>{x.purchases}</td>
                  <td className="mono">
                    <b>{money(x.totalSpent)}</b>
                  </td>
                  <td>
                    {x.lastPurchase
                      ? new Date(x.lastPurchase).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ) : (
                <tr key={x.id}>
                  <td>
                    <b>{x.description}</b>
                  </td>
                  <td>
                    <span className="pill blue">{x.category}</span>
                  </td>
                  <td>{new Date(x.date).toLocaleDateString()}</td>
                  <td className="mono">
                    <b>{money(x.amount)}</b>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {show && (
        <QuickForm
          type={type}
          close={() => setShow(false)}
          done={() => {
            setShow(false);
            load();
          }}
        />
      )}
    </>
  );
}
function QuickForm({ type, close, done }: any) {
  const [f, setF] = useState<any>(
    type === "customers"
      ? { name: "", phone: "", email: "" }
      : {
          description: "",
          category: "",
          amount: "",
          date: new Date().toISOString().slice(0, 10),
        },
  );
  const submit = async (e: any) => {
    e.preventDefault();
    try {
      await api("/" + type, {
        method: "POST",
        body: JSON.stringify(
          type === "expenses" ? { ...f, amount: +f.amount } : f,
        ),
      });
      done();
    } catch (e: any) {
      alert(e.message);
    }
  };
  return (
    <Modal
      title={`Add ${type === "customers" ? "customer" : "expense"}`}
      onClose={close}
    >
      <form className="form" onSubmit={submit}>
        {Object.keys(f).map((k) => (
          <label
            key={k}
            className={k === "description" || k === "name" ? "full" : ""}
          >
            {k.replace(/([A-Z])/g, " $1")}
            <input
              required={k !== "email"}
              type={k === "amount" ? "number" : k === "date" ? "date" : "text"}
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })}
            />
          </label>
        ))}
        <div className="form-actions full">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
function Reports() {
  return (
    <>
      <Header
        eyebrow="PERFORMANCE"
        title="Reports"
        subtitle="A clear view of how your business is performing."
      />
      <div className="report-grid">
        {[
          [
            "Revenue report",
            I.LineChart,
            "Sales performance and growth over time",
          ],
          ["Profit report", I.TrendingUp, "Margins, costs, and net earnings"],
          ["Inventory report", I.Boxes, "Stock value, movement, and health"],
          ["Customer report", I.Users, "Purchase frequency and lifetime value"],
        ].map(([t, Icon, s]: any) => (
          <div className="report-card" key={t}>
            <div>
              <Icon />
            </div>
            <h3>{t}</h3>
            <p>{s}</p>
            <button>
              Open report <I.ArrowRight />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
function Settings({ user }: any) {
  const [staff, setStaff] = useState<any[]>([]),
    [show, setShow] = useState(false),
    [error, setError] = useState("");
  const load = () =>
    api("/staff")
      .then(setStaff)
      .catch((e: any) => setError(e.message));
  useEffect(load, []);
  const update = async (member: any, changes: any) => {
    setError("");
    try {
      await api(`/staff/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <>
      <Header
        eyebrow="BUSINESS SETTINGS"
        title="Staff & access"
        subtitle="Control who can enter your workspace and what they are allowed to do."
        action={
          user.role === "owner" ? (
            <button className="primary" onClick={() => setShow(true)}>
              <I.UserPlus />
              Add staff member
            </button>
          ) : undefined
        }
      />
      {error && (
        <div className="error">
          <I.CircleAlert />
          {error}
        </div>
      )}
      <div className="access-overview">
        <div>
          <I.ShieldCheck />
          <span>
            <b>Role-based access</b>
            <small>
              Sellers focus on POS and their sales. Managers can monitor
              operations.
            </small>
          </span>
        </div>
        <div>
          <b>{staff.filter((x) => x.status === "active").length}</b>
          <span>Active personnel</span>
        </div>
        <div>
          <b>
            {
              staff.filter((x) => x.role === "seller" && x.status === "active")
                .length
            }
          </b>
          <span>Active sellers</span>
        </div>
      </div>
      <div className="table-card">
        <div className="section-title">
          <div>
            <h3>Business personnel</h3>
            <p>
              Access changes take effect on the member's next request or
              sign-in.
            </p>
          </div>
          <I.Users />
        </div>
        {staff.length ? (
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="staff-person">
                      <div>
                        {member.name
                          .split(" ")
                          .map((x: string) => x[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span>
                        <b>
                          {member.name}
                          {member.id === user.id && <em>You</em>}
                        </b>
                        <small>{member.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {member.role === "owner" ? (
                      <span className="pill blue">Owner</span>
                    ) : (
                      <select
                        className="role-select"
                        disabled={
                          user.role !== "owner" || member.status === "inactive"
                        }
                        value={member.role}
                        onChange={(e) =>
                          update(member, { role: e.target.value })
                        }
                      >
                        <option value="manager">Manager</option>
                        <option value="seller">Seller</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <span
                      className={`pill ${member.status === "active" ? "green" : "red"}`}
                    >
                      {member.status === "active" ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td>
                    {new Date(member.createdAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td>
                    {member.role === "owner" ? (
                      <span className="owner-lock">
                        <I.Lock />
                        Protected
                      </span>
                    ) : user.role === "owner" ? (
                      <button
                        className={`table-action ${member.status === "active" ? "deactivate" : ""}`}
                        onClick={() =>
                          update(member, {
                            status:
                              member.status === "active"
                                ? "inactive"
                                : "active",
                          })
                        }
                      >
                        {member.status === "active" ? (
                          <>
                            <I.UserX />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <I.UserCheck />
                            Reactivate
                          </>
                        )}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty
            icon={I.Users}
            title="No staff members yet"
            text="Add a seller or manager to give them secure access."
          />
        )}
      </div>
      <div className="permission-guide">
        <h3>What each role can do</h3>
        <div>
          <span>
            <I.Crown />
            <b>Owner</b>
            <small>
              Complete control, including staff access and business settings.
            </small>
          </span>
          <span>
            <I.BriefcaseBusiness />
            <b>Manager</b>
            <small>
              Monitor products, inventory, sales, customers, and operations.
            </small>
          </span>
          <span>
            <I.ScanLine />
            <b>Seller</b>
            <small>
              Use the point of sale, find products, and view permitted sales.
            </small>
          </span>
        </div>
      </div>
      {show && (
        <StaffForm
          close={() => setShow(false)}
          done={() => {
            setShow(false);
            load();
          }}
        />
      )}
    </>
  );
}
function StaffForm({ close, done }: any) {
  const [f, setF] = useState({
      name: "",
      email: "",
      role: "seller",
      temporaryPassword: "",
    }),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [visible, setVisible] = useState(false);
  const submit = async (e: any) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/staff", { method: "POST", body: JSON.stringify(f) });
      done();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };
  return (
    <Modal title="Add staff member" onClose={close}>
      <form className="form" onSubmit={submit}>
        {error && (
          <div className="error full">
            <I.CircleAlert />
            {error}
          </div>
        )}
        <label className="full">
          Full name
          <input
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </label>
        <label className="full">
          Email address
          <input
            required
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </label>
        <label>
          Role
          <select
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value })}
          >
            <option value="seller">Seller</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <label>
          Temporary password
          <div className="password-field">
            <input
              required
              minLength={8}
              type={visible ? "text" : "password"}
              value={f.temporaryPassword}
              onChange={(e) =>
                setF({ ...f, temporaryPassword: e.target.value })
              }
            />
            <button type="button" onClick={() => setVisible(!visible)}>
              {visible ? <I.EyeOff /> : <I.Eye />}
            </button>
          </div>
        </label>
        <div className="staff-note full">
          <I.Mail />
          Give this email and temporary password to the staff member securely.
          Email invitations will be sent automatically when delivery is
          configured.
        </div>
        <div className="form-actions full">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "Adding person…" : "Add staff member"}
            <I.UserPlus />
          </button>
        </div>
      </form>
    </Modal>
  );
}
const Loader = () => (
  <div className="loader">
    <span></span>
    <p>Bringing your business into view…</p>
  </div>
);
function Page({ path, user }: any) {
  if (user.role === "seller" && !["/pos", "/sales"].includes(path))
    return <POS />;
  if (path === "/") return <Dashboard user={user} />;
  if (path === "/pos") return <POS />;
  if (path === "/products") return <Products />;
  if (path === "/inventory") return <Products inventory />;
  if (path === "/sales") return <Sales />;
  if (path === "/customers") return <SimpleList type="customers" />;
  if (path === "/expenses") return <SimpleList type="expenses" />;
  if (path === "/reports") return <Reports />;
  if (path === "/settings") return <Settings user={user} />;
  return <Reports />;
}
function App() {
  const [user, setUser] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });
  if (!user) return <Login onLogin={setUser} />;
  return (
    <Shell
      user={user}
      onLogout={() => {
        localStorage.clear();
        setUser(null);
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
