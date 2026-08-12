import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import path from "node:path";
import { get, id, load, save } from "./store.js";
load();
const app = express();
const secret = process.env.JWT_SECRET || "oikonos-local-development-secret";
app.use(cors());
app.use(express.json());
const auth = (req: any, res: any, next: any) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return res
      .status(401)
      .json({ message: "Your session has expired. Please sign in again." });
  }
};
const fail = (res: any, e: any) =>
  res
    .status(400)
    .json({
      message: e?.issues?.[0]?.message || e.message || "Something went wrong.",
    });
app.post("/api/auth/login", (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, parsed.error);
  const u = get().users.find(
    (x) => x.email.toLowerCase() === parsed.data.email.toLowerCase(),
  );
  if (!u || !bcrypt.compareSync(parsed.data.password, u.password))
    return res.status(401).json({ message: "Email or password is incorrect." });
  const user = { id: u.id, name: u.name, email: u.email, role: u.role };
  res.json({
    token: jwt.sign(user, secret, { expiresIn: "12h" }),
    user,
    business: get().business,
  });
});
app.post("/api/auth/register", (req, res) => {
  try {
    const x = z
      .object({
        name: z.string().min(2),
        businessName: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
      })
      .parse(req.body);
    const d = get();
    if (d.users.some((u) => u.email.toLowerCase() === x.email.toLowerCase()))
      throw new Error("An account with this email already exists.");
    const user = {
      id: id(),
      name: x.name,
      email: x.email.toLowerCase(),
      password: bcrypt.hashSync(x.password, 12),
      role: "owner" as const,
    };
    d.users.push(user);
    d.business = { name: x.businessName, currency: "NGN" };
    save();
    const claims = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    res
      .status(201)
      .json({
        token: jwt.sign(claims, secret, { expiresIn: "12h" }),
        user: claims,
        business: d.business,
      });
  } catch (e) {
    fail(res, e);
  }
});
app.get("/api/me", auth, (req: any, res) =>
  res.json({ user: req.user, business: get().business }),
);
app.get("/api/dashboard", auth, (_req, res) => {
  const d = get();
  const month = Date.now() - 30 * 86400000;
  const recent = d.sales.filter((s) => +new Date(s.createdAt) > month);
  const revenue = recent.reduce((a, s) => a + s.total, 0);
  const profit =
    recent.reduce((a, s) => a + s.profit, 0) -
    d.expenses
      .filter((e) => +new Date(e.date) > month)
      .reduce((a, e) => a + e.amount, 0);
  const expenses = d.expenses.reduce((a, e) => a + e.amount, 0);
  const lowStock = d.products.filter(
    (p) => p.stock <= p.threshold && p.status === "active",
  );
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000);
    const key = date.toISOString().slice(0, 10);
    return {
      day: date.toLocaleDateString("en", { weekday: "short" }),
      value: d.sales
        .filter((s) => s.createdAt.slice(0, 10) === key)
        .reduce((a, s) => a + s.total, 0),
    };
  });
  const productMap = new Map<string, number>();
  recent.forEach((s) =>
    s.items.forEach((i) =>
      productMap.set(i.name, (productMap.get(i.name) || 0) + i.qty),
    ),
  );
  const topProducts = [...productMap]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, units]) => ({ name, units }));
  res.json({
    revenue,
    profit,
    expenses,
    transactions: recent.length,
    aov: recent.length ? revenue / recent.length : 0,
    lowStock,
    byDay,
    topProducts,
    recent: d.sales
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    insight: lowStock.length
      ? `${lowStock.length} ${lowStock.length === 1 ? "product needs" : "products need"} stock attention.`
      : null,
  });
});
app.get("/api/products", auth, (_q, res) => res.json(get().products));
app.post("/api/products", auth, (req, res) => {
  try {
    const x = z
      .object({
        name: z.string().min(2),
        sku: z.string().min(2),
        category: z.string().min(2),
        price: z.number().nonnegative(),
        cost: z.number().nonnegative(),
        stock: z.number().int().nonnegative(),
        threshold: z.number().int().nonnegative(),
      })
      .parse(req.body);
    if (get().products.some((p) => p.sku === x.sku))
      throw new Error("That SKU already exists.");
    const p = { id: id(), ...x, status: "active" as const };
    get().products.unshift(p);
    save();
    res.status(201).json(p);
  } catch (e) {
    fail(res, e);
  }
});
app.patch("/api/products/:id", auth, (req, res) => {
  const p = get().products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ message: "Product not found." });
  Object.assign(p, req.body);
  save();
  res.json(p);
});
app.get("/api/sales", auth, (_q, res) =>
  res.json(
    get()
      .sales.slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  ),
);
app.post("/api/sales", auth, (req: any, res) => {
  try {
    const x = z
      .object({
        items: z
          .array(
            z.object({
              productId: z.string(),
              qty: z.number().int().positive(),
            }),
          )
          .min(1),
        payment: z.enum(["cash", "card", "transfer"]),
        customerId: z.string().optional(),
      })
      .parse(req.body);
    const d = get();
    let total = 0,
      profit = 0;
    const items = x.items.map((line) => {
      const p = d.products.find((v) => v.id === line.productId);
      if (!p) throw new Error("A product in this cart no longer exists.");
      if (p.stock < line.qty)
        throw new Error(`${p.name} only has ${p.stock} left in stock.`);
      total += p.price * line.qty;
      profit += (p.price - p.cost) * line.qty;
      return { productId: p.id, name: p.name, qty: line.qty, price: p.price };
    });
    items.forEach((line) => {
      const p = d.products.find((v) => v.id === line.productId)!;
      p.stock -= line.qty;
      d.stockMovements.push({
        id: id(),
        productId: p.id,
        type: "sale",
        quantity: -line.qty,
        date: new Date().toISOString(),
      });
    });
    const customer = d.customers.find((c) => c.id === x.customerId);
    const sale = {
      id: id(),
      number: `SAL-${String(1001 + d.sales.length).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      sellerId: req.user.id,
      sellerName: req.user.name,
      customerId: customer?.id,
      customerName: customer?.name,
      payment: x.payment,
      total,
      profit,
      items,
    };
    d.sales.unshift(sale);
    if (customer) {
      customer.totalSpent += total;
      customer.purchases++;
      customer.lastPurchase = sale.createdAt;
    }
    save();
    res.status(201).json(sale);
  } catch (e) {
    fail(res, e);
  }
});
app.get("/api/customers", auth, (_q, res) => res.json(get().customers));
app.post("/api/customers", auth, (req, res) => {
  try {
    const x = z
      .object({
        name: z.string().min(2),
        phone: z.string().min(7),
        email: z.string().email().or(z.literal("")),
      })
      .parse(req.body);
    const c = { id: id(), ...x, totalSpent: 0, purchases: 0 };
    get().customers.unshift(c);
    save();
    res.status(201).json(c);
  } catch (e) {
    fail(res, e);
  }
});
app.get("/api/expenses", auth, (_q, res) =>
  res.json(
    get()
      .expenses.slice()
      .sort((a, b) => b.date.localeCompare(a.date)),
  ),
);
app.post("/api/expenses", auth, (req, res) => {
  try {
    const x = z
      .object({
        description: z.string().min(2),
        category: z.string().min(2),
        amount: z.number().positive(),
        date: z.string(),
      })
      .parse(req.body);
    const e = { id: id(), ...x };
    get().expenses.unshift(e);
    save();
    res.status(201).json(e);
  } catch (e) {
    fail(res, e);
  }
});
app.use("/api", (_q, res) =>
  res.status(404).json({ message: "Endpoint not found." }),
);
app.use(express.static(path.join(process.cwd(), "dist")));
app.get(/^(?!\/api).*/, (_req, res) =>
  res.sendFile(path.join(process.cwd(), "dist", "index.html")),
);
app.listen(4000, () =>
  console.log("OikonOS API running on http://localhost:4000"),
);
