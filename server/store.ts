import fs from "node:fs";
import path from "node:path";

export type Product = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  threshold: number;
  status: "active" | "archived";
};
export type Sale = {
  id: string;
  number: string;
  createdAt: string;
  sellerId: string;
  sellerName: string;
  customerId?: string;
  customerName?: string;
  payment: "cash" | "pos";
  total: number;
  profit: number;
  items: { productId: string; name: string; qty: number; price: number }[];
};
export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  totalSpent: number;
  purchases: number;
  lastPurchase?: string;
};
export type Expense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
};
export type User = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "owner" | "manager" | "seller";
  status: "active" | "inactive";
  createdAt: string;
};
export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  type:
    | "initial"
    | "sale"
    | "adjustment"
    | "restock"
    | "return"
    | "damaged"
    | "expired"
    | "correction";
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  userId: string;
  userName: string;
  referenceId?: string;
  createdAt: string;
};
export type DB = {
  business: { name: string; currency: string } | null;
  users: User[];
  products: Product[];
  sales: Sale[];
  customers: Customer[];
  expenses: Expense[];
  stockMovements: StockMovement[];
};

const file = path.join(process.cwd(), "server", "data", "db.json");
const id = () => Math.random().toString(36).slice(2, 10);
function emptyDatabase(): DB {
  return {
    business: null,
    users: [],
    products: [],
    sales: [],
    customers: [],
    expenses: [],
    stockMovements: [],
  };
}
let db: DB;
export function load() {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    db = emptyDatabase();
    save();
  } else {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
    db.users = db.users.map((u) => ({
      ...u,
      status: u.status || "active",
      createdAt: u.createdAt || new Date().toISOString(),
    }));
  }
  return db;
}
export function get() {
  return db || load();
}
export function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}
export { id };
