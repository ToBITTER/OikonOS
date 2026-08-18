import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import * as I from "lucide-react";
import readXlsxFile from "read-excel-file/browser";
import { BrowserMultiFormatReader } from "@zxing/browser";
import JsBarcode from "jsbarcode";
import "./styles.css";
import "./mobile.css";

const money = (n = 0) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n);
const api = async (path: string, options: any = {}) => {
  const token = localStorage.getItem("token");
  let r: Response;
  try {
    r = await fetch("/api" + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "OikonOS could not reach the server. Check your connection and try again.",
    );
  }
  const data = (r.headers.get("content-type") || "").includes(
    "application/json",
  )
    ? await r.json()
    : null;
  if (r.status === 401 && token) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("oikonos:session-expired"));
  }
  if (!r.ok)
    throw new Error(
      data?.message ||
        data?.error?.message ||
        `The request failed (${r.status}).`,
    );
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
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("OikonOS screen error", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash-screen">
        <Logo />
        <div>
          <span className="eyebrow">SCREEN RECOVERY</span>
          <h1>This screen could not load.</h1>
          <p>Your data is safe. Reload the screen or return to the overview.</p>
          <details>
            <summary>Technical detail</summary>
            <code>{this.state.error.message}</code>
          </details>
          <div>
            <button
              className="primary"
              onClick={() => window.location.assign("/")}
            >
              Return to overview
            </button>
            <button
              className="secondary"
              onClick={() => window.location.reload()}
            >
              Reload OikonOS
            </button>
          </div>
        </div>
      </main>
    );
  }
}
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
    [confirmPassword, setConfirmPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [name, setName] = useState(""),
    [businessName, setBusinessName] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [passwordChange, setPasswordChange] = useState<any>(null);
  const submit = async (e: any) => {
    e.preventDefault();
    if (register && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const d = await api(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(
          register
            ? { email: email.trim(), password, name, businessName }
            : { email: email.trim(), password },
        ),
      });
      if (d.passwordChangeRequired) {
        setPasswordChange(d);
        setPassword("");
        return;
      }
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
  if (passwordChange)
    return (
      <FirstLoginPassword
        challenge={passwordChange}
        onComplete={onLogin}
        onCancel={() => setPasswordChange(null)}
      />
    );
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
            <div className="password-field">
              <input
                required
                minLength={register ? 8 : 1}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <I.EyeOff /> : <I.Eye />}
              </button>
            </div>
          </label>
          {register && (
            <>
              <div className="password-rules">
                <span className={password.length >= 8 ? "met" : ""}>
                  <I.Check />8 characters
                </span>
                <span className={/[A-Z]/.test(password) ? "met" : ""}>
                  <I.Check />
                  Uppercase
                </span>
                <span className={/[a-z]/.test(password) ? "met" : ""}>
                  <I.Check />
                  Lowercase
                </span>
                <span className={/[0-9]/.test(password) ? "met" : ""}>
                  <I.Check />
                  Number
                </span>
              </div>
              <label>
                Confirm password
                <div className="password-field">
                  <input
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                  />
                </div>
                {confirmPassword && (
                  <small
                    className={
                      password === confirmPassword ? "match" : "mismatch"
                    }
                  >
                    {password === confirmPassword
                      ? "Passwords match"
                      : "Passwords do not match"}
                  </small>
                )}
              </label>
            </>
          )}
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
function FirstLoginPassword({ challenge, onComplete, onCancel }: any) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false);
  const submit = async (event: any) => {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/complete-first-login", {
        method: "POST",
        body: JSON.stringify({
          token: challenge.passwordChangeToken,
          password,
        }),
      });
      const current = {
        ...result.user,
        businessName: result.business?.name,
      };
      localStorage.setItem("token", result.token);
      localStorage.setItem("user", JSON.stringify(current));
      onComplete(current);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <main className="invite-page">
      <section>
        <Logo />
        <span className="eyebrow">FIRST SIGN-IN</span>
        <h1>Create your private password</h1>
        <p>
          Your temporary password was correct. Replace it now before entering
          {` ${challenge.business?.name || "the business"}`} workspace.
        </p>
        <form onSubmit={submit}>
          {error && <div className="error"><I.CircleAlert />{error}</div>}
          <label>
            New password
            <div className="password-input">
              <input required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} type={visible ? "text" : "password"} autoComplete="new-password" />
              <button type="button" onClick={() => setVisible(!visible)}>{visible ? <I.EyeOff /> : <I.Eye />}</button>
            </div>
          </label>
          <div className="password-rules">
            <span className={password.length >= 8 ? "met" : ""}><I.Check />8 characters</span>
            <span className={/[A-Z]/.test(password) ? "met" : ""}><I.Check />Uppercase</span>
            <span className={/[a-z]/.test(password) ? "met" : ""}><I.Check />Lowercase</span>
            <span className={/[0-9]/.test(password) ? "met" : ""}><I.Check />Number</span>
          </div>
          <label>
            Confirm new password
            <input required minLength={8} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} type={visible ? "text" : "password"} autoComplete="new-password" />
          </label>
          <button className="primary wide" disabled={busy}>{busy ? "Securing account…" : "Save password and continue"}<I.ArrowRight /></button>
          <button type="button" className="auth-switch" onClick={onCancel}>Return to sign in</button>
        </form>
      </section>
    </main>
  );
}
function AcceptInvite({ token }: { token: string }) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [visible, setVisible] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const valid =
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    password === confirm;
  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage(result.message);
      window.history.replaceState({}, "", "/");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="invite-page">
      <section>
        <Logo />
        <span className="eyebrow">SECURE STAFF INVITATION</span>
        <h1>Create your password</h1>
        <p>
          Complete your OikonOS account setup. This link expires after 48 hours
          and can only be used once.
        </p>
        {message ? (
          <div className="invite-complete">
            <I.CheckCircle />
            <h2>Account ready</h2>
            <p>{message}</p>
            <button
              className="primary"
              onClick={() => window.location.reload()}
            >
              Continue to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {error && (
              <div className="error">
                <I.CircleAlert />
                {error}
              </div>
            )}
            <label>
              New password
              <div className="password-input">
                <input
                  type={visible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setVisible(!visible)}>
                  {visible ? <I.EyeOff /> : <I.Eye />}
                </button>
              </div>
            </label>
            <label>
              Confirm password
              <input
                type={visible ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <div className="password-rules">
              <span className={password.length >= 8 ? "met" : ""}>
                8+ characters
              </span>
              <span
                className={
                  /[A-Z]/.test(password) && /[a-z]/.test(password) ? "met" : ""
                }
              >
                Upper & lowercase
              </span>
              <span className={/\d/.test(password) ? "met" : ""}>
                One number
              </span>
              <span className={password && password === confirm ? "met" : ""}>
                Passwords match
              </span>
            </div>
            <button className="primary wide" disabled={!valid || busy}>
              {busy ? "Creating password…" : "Create password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
const nav = [
  ["Overview", I.LayoutDashboard, "/"],
  ["Point of sale", I.ScanLine, "/pos"],
  ["Scan intelligence", I.ScanBarcode, "/scan"],
  ["Sales", I.ReceiptText, "/sales"],
  ["Products", I.Package, "/products"],
  ["Inventory", I.Boxes, "/inventory"],
  ["Customers", I.Users, "/customers"],
  ["Expenses", I.WalletCards, "/expenses"],
  ["Reports", I.ChartNoAxesCombined, "/reports"],
];
function Shell({ user, onLogout }: { user: any; onLogout: () => void }) {
  const loc = useLocation(),
    go = useNavigate(),
    [mobileNav, setMobileNav] = useState(false);
  const navigate = (path: string) => {
    go(path);
    setMobileNav(false);
  };
  const allowed =
    user.role === "seller"
      ? nav.filter((x) =>
          ["Point of sale", "Scan intelligence", "Sales"].includes(
            x[0] as string,
          ),
        )
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
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={mobileNav ? "mobile-open" : ""}>
        <button
          className="mobile-nav-close"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        >
          <I.X />
        </button>
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
              onClick={() => navigate(path)}
            >
              <Icon />
              {name}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <button onClick={() => navigate("/settings")}>
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
        <button aria-label="Open navigation" onClick={() => setMobileNav(true)}>
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
  const navigate = useNavigate();
  const [d, setD] = useState<any>(),
    [loadError, setLoadError] = useState("");
  useEffect(() => {
    api("/dashboard")
      .then(setD)
      .catch((e: any) => setLoadError(e.message));
  }, []);
  if (loadError) return <ScreenError message={loadError} />;
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
          <span className="secondary" aria-label="Dashboard period">
            <I.CalendarDays />
            Last 30 days
          </span>
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
          <button onClick={() => navigate("/inventory")}>
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
  </div>
);
function Products({ inventory = false }: { inventory?: boolean }) {
  const [items, setItems] = useState<any[]>([]),
    [show, setShow] = useState(false),
    [importing, setImporting] = useState(false),
    [adjusting, setAdjusting] = useState<any>(null),
    [movements, setMovements] = useState<any[]>([]),
    [anomalies, setAnomalies] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("");
  const load = () => {
    api("/products").then(setItems);
    if (inventory) {
      api("/stock-movements").then(setMovements);
      api("/inventory/anomalies").then(setAnomalies);
    }
  };
  useEffect(load, []);
  const filtered = items.filter(
    (x) =>
      (!category || x.category === category) &&
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
          <label className="secondary filter-control">
            <I.SlidersHorizontal />
            <select
              aria-label="Filter products by category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {[...new Set(items.map((x) => x.category))].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
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
    const measuredSize =
      file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1)} KB`
        : `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError(
        `“${file.name}” is not an .xlsx workbook. Save it as Excel Workbook (.xlsx) and try again.`,
      );
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(
        `“${file.name}” is ${measuredSize}. The maximum workbook size is 10 MB.`,
      );
      e.target.value = "";
      return;
    }
    setBusy(true);
    setError("");
    let workbookParsed = false;
    try {
      const sheets = await readXlsxFile(file);
      const requiredHeaders = Object.keys(importHeaders);
      let selected:
        { sheet: string; data: any[][]; headerIndex: number } | undefined;
      for (const sheet of sheets) {
        const data = sheet.data as any[][];
        const headerIndex = data.findIndex((row) => {
          const cells = row.map((x) =>
            String(x ?? "")
              .trim()
              .toLowerCase(),
          );
          return requiredHeaders.every((h) => cells.includes(h));
        });
        if (headerIndex >= 0) {
          selected = { sheet: sheet.sheet, data, headerIndex };
          break;
        }
      }
      if (!selected)
        throw new Error(
          `No worksheet contains the required headings. Found ${sheets.length} ${sheets.length === 1 ? "worksheet" : "worksheets"}: ${sheets.map((s) => s.sheet).join(", ")}.`,
        );
      const rows = selected.data.slice(selected.headerIndex);
      const headers = rows[0].map((x) =>
          String(x ?? "")
            .trim()
            .toLowerCase(),
        ),
        missing = requiredHeaders.filter((h) => !headers.includes(h));
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
      if (!data.length)
        throw new Error(
          `The worksheet “${selected.sheet}” has the correct headings but no product rows beneath them.`,
        );
      workbookParsed = true;
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
      const message = String(e?.message || "The workbook could not be read.");
      setError(
        !workbookParsed && /too large|decompress|zip/i.test(message)
          ? `“${file.name}” is ${measuredSize}, but its internal Excel data could not be decompressed safely. Open it in Excel or Google Sheets, save a fresh .xlsx copy, and upload that copy.`
          : message,
      );
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
            <span>.xlsx · maximum 10 MB · up to 5,000 products</span>
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
      barcode: "",
      category: "",
      price: "",
      cost: "",
      stock: "",
      threshold: "5",
    }),
    [error, setError] = useState(""),
    [scanning, setScanning] = useState(false);
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
    <>
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
            Barcode (optional)
            <div className="barcode-field">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={f.barcode}
                onChange={(e) =>
                  setF({ ...f, barcode: e.target.value.replace(/\D/g, "") })
                }
                placeholder="Enter barcode manually"
              />
              <button type="button" onClick={() => setScanning(true)}>
                <I.ScanBarcode />
                <span>Scan</span>
              </button>
            </div>
            {f.barcode && (
              <small className="barcode-captured">
                <I.CheckCircle2 />
                Barcode captured: {f.barcode}
              </small>
            )}
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
      {scanning && (
        <BarcodeScanner
          close={() => setScanning(false)}
          onScan={(code) => {
            setF({ ...f, barcode: code });
            setScanning(false);
          }}
        />
      )}
    </>
  );
}
function POS() {
  const [products, setProducts] = useState<any[]>([]),
    [cart, setCart] = useState<Record<string, number>>({}),
    [query, setQuery] = useState(""),
    [scanning, setScanning] = useState(false),
    [pay, setPay] = useState<"cash" | "pos">("cash"),
    [confirming, setConfirming] = useState(false),
    [processing, setProcessing] = useState(false),
    [receipt, setReceipt] = useState<any>(null),
    [message, setMessage] = useState(""),
    [category, setCategory] = useState("");
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
  const scanned = async (code: string) => {
    setScanning(false);
    setMessage("");
    try {
      const product = await api(
        `/products/barcode/${encodeURIComponent(code)}`,
      );
      if (product.stock <= 0) {
        setMessage(`${product.name} is out of stock.`);
        return;
      }
      add(product);
      setQuery(product.name);
    } catch (e: any) {
      setMessage(e.message);
    }
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
          <button
            className="scan-trigger"
            aria-label="Scan barcode"
            onClick={() => setScanning(true)}
          >
            <I.ScanBarcode />
          </button>
        </div>
        <div className="category-chips">
          <button
            className={!category ? "selected" : ""}
            onClick={() => setCategory("")}
          >
            All products
          </button>
          {[...new Set(products.map((p) => p.category))].map((x) => (
            <button
              className={category === x ? "selected" : ""}
              onClick={() => setCategory(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="product-grid">
          {products
            .filter(
              (p) =>
                (!category || p.category === category) &&
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
      {scanning && (
        <BarcodeScanner close={() => setScanning(false)} onScan={scanned} />
      )}
    </div>
  );
}
function ScanIntelligence({ user }: any) {
  type Mode = "sell" | "stock" | "receive" | "inspect";
  const allowed: Mode[] =
    user.role === "seller"
      ? ["sell", "inspect"]
      : ["sell", "stock", "receive", "inspect"];
  const [mode, setMode] = useState<Mode>(allowed[0]),
    [scanning, setScanning] = useState(false),
    [result, setResult] = useState<any>(),
    [unknown, setUnknown] = useState<any>(),
    [session, setSession] = useState<Record<string, any>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [payment, setPayment] = useState<"cash" | "pos">("cash"),
    [supplier, setSupplier] = useState(""),
    [countReason, setCountReason] = useState("Physical shelf count"),
    [online, setOnline] = useState(navigator.onLine),
    [history, setHistory] = useState<any[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("oikonos:scan-history") || "[]");
      } catch {
        return [];
      }
    });
  useEffect(() => {
    const connected = () => setOnline(true),
      disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem(`oikonos:scan-session:${mode}`);
    try {
      setSession(saved ? JSON.parse(saved) : {});
    } catch {
      setSession({});
    }
  }, [mode]);
  useEffect(() => {
    localStorage.setItem(
      `oikonos:scan-session:${mode}`,
      JSON.stringify(session),
    );
  }, [mode, session]);
  const scan = async (barcode: string) => {
    if (mode === "inspect") setScanning(false);
    setMessage("");
    try {
      let found: any;
      try {
        found = await api(`/scan-intelligence/${encodeURIComponent(barcode)}`);
        localStorage.setItem(
          `oikonos:scan-cache:${barcode}`,
          JSON.stringify(found),
        );
      } catch (requestError) {
        const cached = localStorage.getItem(`oikonos:scan-cache:${barcode}`);
        if (!navigator.onLine && cached) found = JSON.parse(cached);
        else throw requestError;
      }
      setResult(found);
      setUnknown(undefined);
      setHistory((current) => {
        const next = [
          {
            barcode,
            name: found.product.name,
            sku: found.product.sku,
            price: found.product.price,
            stock: found.product.stock,
            scannedAt: new Date().toISOString(),
          },
          ...current.filter((item) => item.barcode !== barcode),
        ].slice(0, 10);
        localStorage.setItem("oikonos:scan-history", JSON.stringify(next));
        return next;
      });
      if (mode !== "inspect") {
        const p = found.product;
        setSession((current) => ({
          ...current,
          [p.id]: {
            ...p,
            quantity: (current[p.id]?.quantity || 0) + 1,
            unitCost: current[p.id]?.unitCost ?? p.cost,
          },
        }));
      }
      navigator.vibrate?.([60, 30, 60]);
    } catch (e: any) {
      setResult(undefined);
      if (navigator.onLine && /No product is assigned/i.test(e.message)) {
        try {
          const lookup = await api(
            `/barcode-lookup/${encodeURIComponent(barcode)}`,
          );
          setUnknown(lookup);
          setScanning(false);
          setMessage("");
        } catch (lookupError: any) {
          setMessage(lookupError.message);
        }
      } else setMessage(e.message);
    }
  };
  const items = Object.values(session) as any[];
  const openRecent = async (barcode: string) => {
    setMode("inspect");
    setSession({});
    setUnknown(undefined);
    setMessage("");
    try {
      const cached = localStorage.getItem(`oikonos:scan-cache:${barcode}`);
      const found = navigator.onLine
        ? await api(`/scan-intelligence/${encodeURIComponent(barcode)}`)
        : cached
          ? JSON.parse(cached)
          : null;
      if (!found)
        throw new Error("This inspection is not cached for offline use.");
      setResult(found);
    } catch (e: any) {
      setMessage(e.message);
    }
  };
  const changeQty = (id: string, quantity: number) =>
    setSession((current) =>
      quantity < 0 || (quantity === 0 && mode !== "stock")
        ? Object.fromEntries(
            Object.entries(current).filter(([key]) => key !== id),
          )
        : { ...current, [id]: { ...current[id], quantity } },
    );
  const finish = async () => {
    if (!items.length || busy) return;
    if (!navigator.onLine) {
      setMessage(
        "This scan session is saved on this phone. Reconnect before submitting it safely.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (mode === "sell") {
        const sale = await api("/sales", {
          method: "POST",
          body: JSON.stringify({
            items: items.map((x) => ({ productId: x.id, qty: x.quantity })),
            payment,
          }),
        });
        setMessage(`Sale ${sale.number} completed successfully.`);
      } else if (mode === "stock") {
        if (countReason.trim().length < 3)
          throw new Error("Add a reason for this physical count.");
        const count = await api("/scan-intelligence/stock-counts", {
          method: "POST",
          body: JSON.stringify({
            reason: countReason,
            items: items.map((item) => ({
              productId: item.id,
              countedQuantity: item.quantity,
            })),
          }),
        });
        setMessage(
          count.varianceCount
            ? `Count completed: ${count.varianceCount} variance${count.varianceCount === 1 ? "" : "s"} reconciled across ${count.productCount} products.`
            : `Count completed: all ${count.productCount} products matched recorded stock.`,
        );
      } else if (mode === "receive") {
        if (supplier.trim().length < 2)
          throw new Error("Enter the supplier name before receiving stock.");
        const receipt = await api("/scan-intelligence/receive", {
          method: "POST",
          body: JSON.stringify({
            supplierName: supplier,
            items: items.map((x) => ({
              productId: x.id,
              quantity: x.quantity,
              unitCost: Number(x.unitCost),
            })),
          }),
        });
        setMessage(
          `Purchase ${receipt.purchaseNumber} received and stock updated.`,
        );
      }
      setSession({});
      setResult(undefined);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const modeText: Record<Mode, string> = {
    sell: "Scan products into a sale",
    stock: "Count every physical item by scanning it",
    receive: "Receive supplier stock with a complete audit trail",
    inspect: "See product performance, risk, and history",
  };
  const createInternalBarcode = () => {
    const body = `20${Date.now().toString().slice(-10)}`,
      sum = body
        .split("")
        .reduce(
          (total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1),
          0,
        ),
      barcode = `${body}${(10 - (sum % 10)) % 10}`;
    setUnknown({ found: false, barcode, source: "OikonOS internal label" });
    setResult(undefined);
  };
  return (
    <>
      <Header
        eyebrow="OIKONOS SCAN INTELLIGENCE"
        title="One scan. Complete business context."
        subtitle={modeText[mode]}
        action={
          <div className="header-actions">
            {user.role !== "seller" && (
              <button className="secondary" onClick={createInternalBarcode}>
                <I.Tags /> Create label
              </button>
            )}
            <button className="primary" onClick={() => setScanning(true)}>
              <I.ScanBarcode /> Scan product
            </button>
          </div>
        }
      />
      {!online && (
        <div className="offline-banner">
          <I.WifiOff />
          <span>
            <b>Offline scanning</b>
            <small>
              Your session is saved on this phone. Submission will unlock after
              reconnection.
            </small>
          </span>
        </div>
      )}
      <div className="scan-mode-tabs">
        {allowed.map((key) => {
          const Icon =
            key === "sell"
              ? I.ShoppingCart
              : key === "stock"
                ? I.ClipboardCheck
                : key === "receive"
                  ? I.PackagePlus
                  : I.SearchCheck;
          return (
            <button
              className={mode === key ? "active" : ""}
              onClick={() => {
                setMode(key);
                setSession({});
                setResult(undefined);
                setUnknown(undefined);
                setMessage("");
              }}
              key={key}
            >
              <Icon />
              <span>
                <b>{key}</b>
                <small>{modeText[key]}</small>
              </span>
            </button>
          );
        })}
      </div>
      {message && (
        <div
          className={
            message.includes("success") ||
            message.includes("reconciled") ||
            message.includes("received") ||
            message.includes("Count completed")
              ? "success"
              : "error"
          }
        >
          {message}
        </div>
      )}
      <div className="scan-workspace">
        <section className="scan-primary">
          {unknown ? (
            <UnknownProduct
              lookup={unknown}
              user={user}
              done={async () => {
                setUnknown(undefined);
                await scan(unknown.barcode);
              }}
            />
          ) : !result ? (
            <button className="scan-empty" onClick={() => setScanning(true)}>
              <I.ScanBarcode />
              <b>Ready to scan</b>
              <span>Use the rear camera or enter the barcode manually.</span>
            </button>
          ) : (
            <ProductIntelligence data={result} />
          )}
        </section>
        {mode !== "inspect" && (
          <aside className="scan-session">
            <div className="scan-session-head">
              <span>
                <b>
                  {mode === "sell"
                    ? "Sale"
                    : mode === "stock"
                      ? "Physical count"
                      : "Delivery"}{" "}
                  session
                </b>
                <small>
                  {items.length} products ·{" "}
                  {items.reduce((a, x) => a + x.quantity, 0)} units
                </small>
              </span>
              <button onClick={() => setSession({})} disabled={!items.length}>
                Clear
              </button>
            </div>
            {mode === "receive" && (
              <label>
                Supplier
                <input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Supplier or vendor name"
                />
              </label>
            )}
            {mode === "stock" && items.length > 0 && (
              <div className="count-summary">
                <span>
                  <small>Products counted</small>
                  <b>{items.length}</b>
                </span>
                <span>
                  <small>Discrepancies</small>
                  <b>{items.filter((item) => item.quantity !== item.stock).length}</b>
                </span>
                <span>
                  <small>Unit variance</small>
                  <b>{items.reduce((total, item) => total + Math.abs(item.quantity - item.stock), 0)}</b>
                </span>
              </div>
            )}
            <div className="scan-session-items">
              {items.map((item) => (
                <div className="scan-session-row" key={item.id}>
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {mode === "stock"
                        ? `Recorded: ${item.stock} · Variance: ${item.quantity - item.stock > 0 ? "+" : ""}${item.quantity - item.stock}`
                        : money(item.price)}
                    </small>
                  </span>
                  <div className="stepper">
                    <button
                      onClick={() => changeQty(item.id, item.quantity - 1)}
                    >
                      −
                    </button>
                    <strong>{item.quantity}</strong>
                    <button
                      onClick={() => changeQty(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  {mode === "receive" && (
                    <input
                      aria-label={`${item.name} unit cost`}
                      type="number"
                      min="0"
                      value={item.unitCost}
                      onChange={(e) =>
                        setSession((current) => ({
                          ...current,
                          [item.id]: {
                            ...current[item.id],
                            unitCost: e.target.value,
                          },
                        }))
                      }
                    />
                  )}
                </div>
              ))}
              {!items.length && (
                <Empty
                  icon={I.ScanLine}
                  title="Nothing scanned yet"
                  text="Each scan will be added to this session."
                />
              )}
            </div>
            {mode === "sell" && (
              <label>
                Payment
                <select
                  value={payment}
                  onChange={(e) => setPayment(e.target.value as any)}
                >
                  <option value="cash">Cash</option>
                  <option value="pos">POS / card</option>
                </select>
              </label>
            )}
            {mode === "stock" && (
              <label>
                Count reason
                <input
                  value={countReason}
                  onChange={(event) => setCountReason(event.target.value)}
                  placeholder="e.g. Weekly shelf count"
                />
              </label>
            )}
            <button
              className="primary wide"
              disabled={!items.length || busy}
              onClick={finish}
            >
              {busy
                ? "Saving…"
                : mode === "sell"
                  ? `Complete sale · ${money(items.reduce((a, x) => a + x.price * x.quantity, 0))}`
                  : mode === "stock"
                    ? "Reconcile physical count"
                    : "Receive stock"}
            </button>
          </aside>
        )}
      </div>
      {history.length > 0 && (
        <section className="recent-scans">
          <div className="section-title">
            <div>
              <h3>Recent scans</h3>
              <p>
                Reopen a recent product inspection without finding the barcode
                again.
              </p>
            </div>
            <I.History />
          </div>
          <div>
            {history.map((item) => (
              <button
                key={item.barcode}
                onClick={() => void openRecent(item.barcode)}
              >
                <div className="product-icon">
                  <I.Package />
                </div>
                <span>
                  <b>{item.name}</b>
                  <small>
                    {item.sku} ·{" "}
                    {new Date(item.scannedAt).toLocaleString("en-NG")}
                  </small>
                </span>
                <strong>{item.stock} in stock</strong>
                <I.ChevronRight />
              </button>
            ))}
          </div>
        </section>
      )}
      {scanning && (
        <BarcodeScanner
          close={() => setScanning(false)}
          onScan={scan}
          continuous={mode !== "inspect"}
        />
      )}
    </>
  );
}
function UnknownProduct({ lookup, user, done }: any) {
  const candidate = lookup.candidate || {};
  const [form, setForm] = useState({
      name: candidate.name || "",
      sku: "",
      category: candidate.category || "",
      price: "",
      cost: "",
      stock: "0",
      threshold: "5",
    }),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const submit = async (e: any) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/products", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          barcode: lookup.barcode,
          price: Number(form.price),
          cost: Number(form.cost),
          stock: Number(form.stock),
          threshold: Number(form.threshold),
        }),
      });
      await done();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  if (user.role === "seller")
    return (
      <div className="unknown-product seller-unknown">
        <I.CircleHelp />
        <h2>Product not in this catalogue</h2>
        <p>
          Barcode {lookup.barcode} must be reviewed and added by a manager
          before it can be sold.
        </p>
      </div>
    );
  return (
    <div className="unknown-product">
      <div className="unknown-head">
        {candidate.image ? (
          <img src={candidate.image} alt="" />
        ) : (
          <div>
            <I.PackageSearch />
          </div>
        )}
        <span>
          <small>
            {lookup.found ? "PRODUCT CANDIDATE FOUND" : "UNKNOWN BARCODE"}
          </small>
          <h2>{candidate.name || "Add this product to OikonOS"}</h2>
          <p>
            {candidate.brand
              ? `${candidate.brand}${candidate.quantity ? ` · ${candidate.quantity}` : ""}`
              : `Barcode ${lookup.barcode}`}
          </p>
        </span>
      </div>
      <div className="lookup-notice">
        <I.Database />
        <span>
          <b>Review before saving</b>
          <small>
            {lookup.found
              ? `Suggested identity supplied by ${lookup.source}. Confirm every business field below; OikonOS will not create it automatically.`
              : `${lookup.source} did not supply product details. Enter the real product information below.`}
          </small>
        </span>
      </div>
      {error && <div className="error">{error}</div>}
      <form className="form unknown-form" onSubmit={submit}>
        <label className="full">
          Product name
          <input
            required
            minLength={2}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          SKU
          <input
            required
            minLength={2}
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
        </label>
        <label>
          Category
          <input
            required
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        </label>
        <label>
          Selling price
          <input
            required
            type="number"
            min="0"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </label>
        <label>
          Cost price
          <input
            required
            type="number"
            min="0"
            value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
          />
        </label>
        <label>
          Opening stock
          <input
            required
            type="number"
            min="0"
            step="1"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
          />
        </label>
        <label>
          Low-stock threshold
          <input
            required
            type="number"
            min="0"
            step="1"
            value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
          />
        </label>
        <div className="full barcode-assignment">
          <I.ScanBarcode />
          <span>
            <small>Assigned barcode</small>
            <b>{lookup.barcode}</b>
          </span>
        </div>
        <div className="form-actions full">
          <button className="primary" disabled={saving}>
            {saving ? "Adding product…" : "Approve and add product"}
          </button>
        </div>
      </form>
    </div>
  );
}
function ProductIntelligence({ data }: any) {
  const { product: p, intelligence: x } = data;
  const barcodeRef = React.useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (barcodeRef.current && p.barcode)
      JsBarcode(barcodeRef.current, p.barcode, {
        format: "CODE128",
        displayValue: true,
        fontSize: 13,
        height: 48,
        margin: 8,
      });
  }, [p.barcode]);
  const printLabel = () => {
    if (!barcodeRef.current) return;
    const popup = window.open("", "_blank", "width=520,height=520");
    if (!popup) return;
    popup.document.write(
      `<!doctype html><html><head><title>${p.name} barcode label</title><style>@page{size:62mm 40mm;margin:2mm}body{font-family:Arial,sans-serif;margin:0;display:grid;place-items:center}.label{width:58mm;text-align:center;padding:2mm}.label h1{font-size:13px;margin:0 0 2px}.label p{font-size:10px;margin:0 0 2px;color:#444}.label strong{display:block;font-size:14px;margin-top:2px}svg{max-width:100%;height:auto}@media print{button{display:none}}</style></head><body><div class="label"><h1>${String(p.name).replace(/[<>&]/g, "")}</h1><p>${String(p.sku).replace(/[<>&]/g, "")}</p>${barcodeRef.current.outerHTML}<strong>${money(p.price)}</strong></div><button onclick="window.print()">Print label</button><script>window.onload=()=>window.print()<\/script></body></html>`,
    );
    popup.document.close();
  };
  return (
    <div className="intelligence-card">
      <div className="intelligence-title">
        <div className="product-icon">
          <I.Package />
        </div>
        <span>
          <small>{p.category || "Uncategorised"}</small>
          <h2>{p.name}</h2>
          <em>
            {p.sku} · {p.barcode}
          </em>
        </span>
        <strong>{money(p.price)}</strong>
        {p.barcode && (
          <button className="secondary label-print" onClick={printLabel}>
            <I.Printer /> Print label
          </button>
        )}
      </div>
      <svg ref={barcodeRef} className="barcode-preview" />
      <div className="intelligence-metrics">
        <span>
          <small>Available stock</small>
          <b>{p.stock}</b>
        </span>
        <span>
          <small>Margin</small>
          <b>
            {money(x.margin)} · {x.marginPercent.toFixed(1)}%
          </b>
        </span>
        <span>
          <small>30-day sales</small>
          <b>{x.unitsSold30Days} units</b>
        </span>
        <span>
          <small>Stock cover</small>
          <b>
            {x.daysUntilStockout === null
              ? "No recent velocity"
              : `${Math.max(0, x.daysUntilStockout).toFixed(1)} days`}
          </b>
        </span>
      </div>
      <div className={`scan-recommendation ${x.stockRisk}`}>
        <I.Sparkles />
        <span>
          <b>
            {x.stockRisk === "out"
              ? "Out of stock"
              : x.stockRisk === "low"
                ? "Low-stock action required"
                : x.stockRisk === "soon"
                  ? "Stock may run out soon"
                  : "Stock level is healthy"}
          </b>
          <small>
            {x.suggestedReorder > 0
              ? `Suggested reorder: ${x.suggestedReorder} units based on recent sales velocity.`
              : "No reorder is currently suggested."}
          </small>
        </span>
      </div>
      <div className="intelligence-grid">
        <div>
          <h3>Branch availability</h3>
          {data.branches.map((b: any) => (
            <p key={b.id}>
              <span>{b.name}</span>
              <b>{b.stock} units</b>
            </p>
          ))}
        </div>
        <div>
          <h3>Last supplier purchase</h3>
          {data.lastPurchase ? (
            <p>
              <span>
                {data.lastPurchase.supplierName}
                <small>
                  {new Date(data.lastPurchase.receivedAt).toLocaleDateString(
                    "en-NG",
                  )}
                </small>
              </span>
              <b>{money(data.lastPurchase.purchasePrice)}</b>
            </p>
          ) : (
            <p className="muted">No supplier receipt recorded yet.</p>
          )}
        </div>
      </div>
      <div className="movement-timeline">
        <h3>Recent stock activity</h3>
        {data.movements.slice(0, 5).map((m: any) => (
          <div key={m.id}>
            <i className={m.quantity < 0 ? "out" : "in"}></i>
            <span>
              <b>{m.reason}</b>
              <small>
                {m.userName} · {new Date(m.createdAt).toLocaleString("en-NG")}
              </small>
            </span>
            <strong>
              {m.quantity > 0 ? "+" : ""}
              {m.quantity}
            </strong>
          </div>
        ))}
        {!data.movements.length && (
          <p className="muted">No stock activity recorded.</p>
        )}
      </div>
    </div>
  );
}
function BarcodeScanner({
  close,
  onScan,
  continuous = false,
}: {
  close: () => void;
  onScan: (code: string) => void | Promise<void>;
  continuous?: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null),
    controlsRef = React.useRef<any>(null),
    lastScanRef = React.useRef({ code: "", at: 0 }),
    [status, setStatus] = useState("Starting camera…"),
    [manual, setManual] = useState(""),
    [scanCount, setScanCount] = useState(0);
  const beep = () => {
    try {
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContext(),
        oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
    } catch {}
  };
  const accept = async (code: string) => {
    const now = Date.now(),
      last = lastScanRef.current;
    if (last.code === code && now - last.at < 1500) {
      setStatus(
        "Duplicate read ignored — move the product away, then scan again",
      );
      return;
    }
    lastScanRef.current = { code, at: now };
    navigator.vibrate?.(80);
    beep();
    setStatus("Adding product…");
    await onScan(code);
    setScanCount((count) => count + 1);
    if (continuous) setStatus("Added — scan the next product");
    else controlsRef.current?.stop();
  };
  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("Camera scanning is not supported on this browser.");
        const reader = new BrowserMultiFormatReader();
        controlsRef.current = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (result && active) {
              if (!continuous) active = false;
              void accept(result.getText());
            }
          },
        );
        setStatus("Position the barcode inside the frame");
      } catch (e: any) {
        setStatus(
          e.name === "NotAllowedError"
            ? "Camera access was denied. Allow camera access or enter the barcode below."
            : e.message || "The camera could not be started.",
        );
      }
    };
    void start();
    return () => {
      active = false;
      controlsRef.current?.stop();
      if (videoRef.current?.srcObject)
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
    };
  }, [continuous]);
  const submit = async (e: any) => {
    e.preventDefault();
    if (/^\d{6,18}$/.test(manual)) {
      await accept(manual);
      setManual("");
    }
  };
  return (
    <div className="overlay scanner-overlay">
      <div className="scanner-sheet">
        <div className="scanner-head">
          <div>
            <span>BARCODE SCANNER</span>
            <h2>{continuous ? "Continuous scan session" : "Scan a product"}</h2>
          </div>
          <button onClick={close}>
            <I.X />
          </button>
        </div>
        <div className="camera-view">
          <video ref={videoRef} autoPlay muted playsInline />
          <div className="scan-frame">
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <span></span>
          </div>
          <p>{status}</p>
          {continuous && <b className="scan-counter">{scanCount} scans</b>}
        </div>
        <form className="manual-barcode" onSubmit={submit}>
          <label>
            Or enter barcode manually
            <div>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={manual}
                onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
                placeholder="Barcode number"
              />
              <button className="primary" disabled={!/^\d{6,18}$/.test(manual)}>
                Find product
              </button>
            </div>
          </label>
        </form>
      </div>
    </div>
  );
}
function Sales() {
  const [rows, setRows] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [period, setPeriod] = useState("all");
  useEffect(() => {
    api("/sales").then(setRows);
  }, []);
  const cutoff = period === "all" ? 0 : Date.now() - Number(period) * 86400000;
  const filtered = rows.filter(
    (sale) =>
      (!cutoff || new Date(sale.createdAt).getTime() >= cutoff) &&
      `${sale.number} ${sale.customerName || ""} ${sale.sellerName || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const exportCsv = () => {
    const cell = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      ["Transaction", "Date", "Customer", "Seller", "Payment", "Total"],
      ...filtered.map((sale) => [
        sale.number,
        new Date(sale.createdAt).toISOString(),
        sale.customerName || "Walk-in customer",
        sale.sellerName,
        sale.payment,
        sale.total,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `oikonos-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <Header
        eyebrow="SALES LEDGER"
        title="Sales"
        subtitle="Every transaction, payment, and customer in one place."
        action={
          <button className="secondary" onClick={exportCsv}>
            <I.Download />
            Export CSV
          </button>
        }
      />
      <div className="table-card">
        <div className="toolbar">
          <div className="search">
            <I.Search />
            <input
              placeholder="Search by receipt or customer…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="secondary filter-control">
            <I.CalendarDays />
            <select
              aria-label="Filter sales by date"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="all">All dates</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
        </div>
        <SalesTable rows={filtered} />
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
  const [report, setReport] = useState<
      "revenue" | "profit" | "inventory" | "customers"
    >("revenue"),
    [period, setPeriod] = useState("30"),
    [data, setData] = useState<any>(),
    [error, setError] = useState("");
  useEffect(() => {
    setData(undefined);
    setError("");
    api(`/reports?period=${period}`)
      .then(setData)
      .catch((e: any) => setError(e.message));
  }, [period]);
  if (error) return <ScreenError message={error} />;
  return (
    <>
      <Header
        eyebrow="PERFORMANCE"
        title="Reports"
        subtitle="A clear view of how your business is performing."
        action={
          <label className="secondary filter-control">
            <I.CalendarDays />
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
              <option value="all">All time</option>
            </select>
          </label>
        }
      />
      <div className="report-tabs">
        {(
          [
            ["revenue", "Revenue", I.LineChart],
            ["profit", "Profit", I.TrendingUp],
            ["inventory", "Inventory", I.Boxes],
            ["customers", "Customers", I.Users],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            className={report === key ? "active" : ""}
            onClick={() => setReport(key)}
            key={key}
          >
            <Icon /> {label}
          </button>
        ))}
      </div>
      {!data ? (
        <Loader />
      ) : (
        <div className="report-body">
          <div className="metrics">
            {report === "revenue" && (
              <>
                <Metric
                  label="Revenue"
                  value={money(data.summary.revenue)}
                  icon={I.Banknote}
                />
                <Metric
                  label="Transactions"
                  value={data.summary.transactions}
                  icon={I.Receipt}
                />
                <Metric
                  label="Average order"
                  value={money(data.summary.averageOrder)}
                  icon={I.BadgeDollarSign}
                />
                <Metric
                  label="Units sold"
                  value={data.summary.unitsSold}
                  icon={I.Package}
                />
              </>
            )}
            {report === "profit" && (
              <>
                <Metric
                  label="Gross profit"
                  value={money(data.summary.grossProfit)}
                  icon={I.TrendingUp}
                />
                <Metric
                  label="Expenses"
                  value={money(data.summary.expenses)}
                  icon={I.WalletCards}
                />
                <Metric
                  label="Net profit"
                  value={money(data.summary.netProfit)}
                  icon={I.BadgeDollarSign}
                />
                <Metric
                  label="Gross margin"
                  value={`${data.summary.revenue ? ((data.summary.grossProfit / data.summary.revenue) * 100).toFixed(1) : "0.0"}%`}
                  icon={I.LineChart}
                />
              </>
            )}
            {report === "inventory" && (
              <>
                <Metric
                  label="Inventory value"
                  value={money(data.summary.inventoryValue)}
                  icon={I.Boxes}
                />
                <Metric
                  label="Products"
                  value={data.inventory.length}
                  icon={I.Package}
                />
                <Metric
                  label="Low stock"
                  value={
                    data.inventory.filter((x: any) => x.stock <= x.threshold)
                      .length
                  }
                  icon={I.TriangleAlert}
                />
                <Metric
                  label="Out of stock"
                  value={
                    data.inventory.filter((x: any) => x.stock === 0).length
                  }
                  icon={I.PackageX}
                />
              </>
            )}
            {report === "customers" && (
              <>
                <Metric
                  label="Customers"
                  value={data.summary.customerCount}
                  icon={I.Users}
                />
                <Metric
                  label="Customer revenue"
                  value={money(
                    data.customers.reduce(
                      (a: number, x: any) => a + x.totalSpent,
                      0,
                    ),
                  )}
                  icon={I.Banknote}
                />
                <Metric
                  label="Purchases"
                  value={data.customers.reduce(
                    (a: number, x: any) => a + x.purchases,
                    0,
                  )}
                  icon={I.Receipt}
                />
                <Metric
                  label="Returning customers"
                  value={
                    data.customers.filter((x: any) => x.purchases > 1).length
                  }
                  icon={I.UserCheck}
                />
              </>
            )}
          </div>
          {(report === "revenue" || report === "profit") && (
            <div className="table-card report-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Revenue</th>
                    <th>Gross profit</th>
                    <th>Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((x: any) => (
                    <tr key={x.day}>
                      <td>
                        {new Date(`${x.day}T00:00:00`).toLocaleDateString(
                          "en-NG",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </td>
                      <td className="mono">{money(x.revenue)}</td>
                      <td className="mono">{money(x.profit)}</td>
                      <td>{x.transactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.trend.length && (
                <Empty
                  icon={I.LineChart}
                  title="No report data yet"
                  text="Completed sales in this period will appear here."
                />
              )}
            </div>
          )}
          {report === "inventory" && (
            <div className="table-card report-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>Threshold</th>
                    <th>Stock value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.inventory.map((x: any) => (
                    <tr key={x.sku}>
                      <td>
                        <b>{x.name}</b>
                        <small>{x.sku}</small>
                      </td>
                      <td>{x.category || "Uncategorised"}</td>
                      <td>{x.stock}</td>
                      <td>{x.threshold}</td>
                      <td className="mono">{money(x.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {report === "customers" && (
            <div className="table-card report-table">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Purchases</th>
                    <th>Total spent</th>
                    <th>Last purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((x: any) => (
                    <tr key={`${x.name}-${x.phone}`}>
                      <td>
                        <b>{x.name}</b>
                        <small>{x.phone || x.email}</small>
                      </td>
                      <td>{x.purchases}</td>
                      <td className="mono">{money(x.totalSpent)}</td>
                      <td>
                        {x.lastPurchase
                          ? new Date(x.lastPurchase).toLocaleDateString("en-NG")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
function Settings({ user }: any) {
  const [staff, setStaff] = useState<any[]>([]),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [emailStatus, setEmailStatus] = useState<any>(),
    [emailMessage, setEmailMessage] = useState(""),
    [testingEmail, setTestingEmail] = useState(false);
  const load = () =>
    api("/staff")
      .then(setStaff)
      .catch((e: any) => setError(e.message));
  useEffect(load, []);
  const loadEmailStatus = () =>
    user.role === "owner" &&
    api("/email/status")
      .then(setEmailStatus)
      .catch(() => {});
  useEffect(() => {
    void loadEmailStatus();
  }, []);
  const testEmail = async () => {
    setTestingEmail(true);
    setEmailMessage("");
    try {
      const result = await api("/email/test", { method: "POST" });
      setEmailMessage(result.message);
      setTimeout(loadEmailStatus, 1500);
    } catch (e: any) {
      setEmailMessage(e.message);
    } finally {
      setTestingEmail(false);
    }
  };
  const toggleBriefing = async () => {
    try {
      const result = await api("/email/briefing", {
        method: "PUT",
        body: JSON.stringify({ enabled: !emailStatus?.briefingEnabled }),
      });
      setEmailStatus((current: any) => ({ ...current, ...result }));
    } catch (e: any) {
      setEmailMessage(e.message);
    }
  };
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
  const resendOnboarding = async (member: any) => {
    setError("");
    setEmailMessage("");
    try {
      const result = await api(`/staff/${member.id}/resend-onboarding`, {
        method: "POST",
      });
      setEmailMessage(result.message);
      setTimeout(loadEmailStatus, 1500);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const deleteSeller = async (member: any) => {
    if (
      !window.confirm(
        `Delete ${member.name} as a seller? They will immediately lose access, but their historical sales and stock activity will remain.`,
      )
    )
      return;
    setError("");
    try {
      const result = await api(`/staff/${member.id}`, { method: "DELETE" });
      setEmailMessage(result.message);
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
      {user.role === "owner" && (
        <div className="email-delivery-card">
          <div>
            <I.MailCheck />
            <span>
              <b>Email delivery</b>
              <small>
                Resend delivery queue and recent provider responses.
              </small>
            </span>
          </div>
          <div className="email-counts">
            {["sent", "pending", "failed"].map((status) => (
              <span className={status} key={status}>
                <b>
                  {emailStatus?.counts?.find((x: any) => x.status === status)
                    ?.count || 0}
                </b>
                {status}
              </span>
            ))}
          </div>
          <button
            className="secondary"
            disabled={testingEmail}
            onClick={testEmail}
          >
            <I.Send />
            {testingEmail ? "Queueing…" : "Send test email"}
          </button>
          <button
            className="icon-btn"
            aria-label="Refresh email delivery status"
            onClick={loadEmailStatus}
          >
            <I.RefreshCw />
          </button>
          {emailMessage && <p>{emailMessage}</p>}
          {emailStatus && (
            <div className="briefing-control">
              <span>
                <I.Sunrise />
                <span>
                  <b>Daily owner briefing</b>
                  <small>
                    Delivered after 7:00 AM with yesterday’s revenue, profit,
                    stock attention and adjustments.
                  </small>
                </span>
              </span>
              <button
                className={emailStatus.briefingEnabled ? "toggle on" : "toggle"}
                aria-label="Toggle daily owner briefing"
                aria-pressed={emailStatus.briefingEnabled}
                onClick={toggleBriefing}
              >
                <i />
              </button>
            </div>
          )}
          {emailStatus?.recent?.find((x: any) => x.status === "failed") && (
            <div className="email-failure">
              <I.TriangleAlert />
              <span>
                <b>Latest delivery error</b>
                <small>
                  {
                    emailStatus.recent.find((x: any) => x.status === "failed")
                      .lastError
                  }
                </small>
              </span>
            </div>
          )}
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
                    ) : user.role === "owner" ||
                      (user.role === "manager" && member.role === "seller") ? (
                      <div className="staff-actions">
                        {user.role === "owner" && (
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => resendOnboarding(member)}
                        >
                          <I.MailPlus />
                          Resend onboarding
                        </button>
                        )}
                        {user.role === "owner" && (
                        <button
                          type="button"
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
                        )}
                        {member.role === "seller" && (
                          <button
                            type="button"
                            className="table-action delete"
                            onClick={() => deleteSeller(member)}
                          >
                            <I.Trash2 />
                            Delete seller
                          </button>
                        )}
                      </div>
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
const ScreenError = ({ message }: { message: string }) => (
  <div className="screen-error">
    <I.CloudOff />
    <h2>We could not load this screen</h2>
    <p>{message}</p>
    <button className="primary" onClick={() => window.location.reload()}>
      Try again
    </button>
  </div>
);
function Page({ path, user }: any) {
  if (user.role === "seller" && !["/pos", "/scan", "/sales"].includes(path))
    return <POS />;
  if (path === "/") return <Dashboard user={user} />;
  if (path === "/pos") return <POS />;
  if (path === "/scan") return <ScanIntelligence user={user} />;
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
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  const [user, setUser] = useState<any>(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener("oikonos:session-expired", expired);
    return () => window.removeEventListener("oikonos:session-expired", expired);
  }, []);
  if (inviteToken) return <AcceptInvite token={inviteToken} />;
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
  <AppErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AppErrorBoundary>,
);
