import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import * as I from "lucide-react";
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
        eyebrow={new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
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
        <Metric
          label="Revenue"
          value={money(d.revenue)}
          icon={I.Banknote}
        />
        <Metric
          label="Net profit"
          value={money(d.profit)}
          icon={I.TrendingUp}
        />
        <Metric
          label="Transactions"
          value={d.transactions}
          icon={I.Receipt}
        />
        <Metric
          label="Average order"
          value={money(d.aov)}
          icon={I.BadgeDollarSign}
        />
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
    [query, setQuery] = useState("");
  const load = () => api("/products").then(setItems);
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
          <button className="primary" onClick={() => setShow(true)}>
            <I.Plus />
            Add product
          </button>
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
    </>
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
    [pay, setPay] = useState("transfer"),
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
    try {
      const s = await api("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: rows.map((x) => ({ productId: x.id, qty: x.qty })),
          payment: pay,
        }),
      });
      setCart({});
      setMessage(`${s.number} completed · ${money(s.total)}`);
      setProducts(await api("/products"));
      setTimeout(() => setMessage(""), 5000);
    } catch (e: any) {
      setMessage(e.message);
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
          <div className="success">
            <I.CheckCircle2 />
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
          <label>
            Payment method
            <select value={pay} onChange={(e) => setPay(e.target.value)}>
              <option value="transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </label>
          <button
            className="primary wide"
            disabled={!rows.length}
            onClick={checkout}
          >
            Complete sale <I.ArrowRight />
          </button>
        </div>
      </aside>
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
