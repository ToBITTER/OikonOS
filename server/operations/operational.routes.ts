import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { query, transaction } from "../platform/database.js";
import { queueAdminEmails } from "../notifications/notification.service.js";

const productInput = z.object({
  name: z.string().min(2),
  sku: z.string().min(2),
  barcode: z
    .string()
    .regex(/^\d{6,18}$/)
    .optional()
    .or(z.literal("")),
  category: z.string().min(1),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  stock: z.number().int().nonnegative(),
  threshold: z.number().int().nonnegative(),
});
const productSelect = `SELECT p.id,p.name,p.sku,p.barcode,c.name category,p.selling_price::float8 price,p.cost_price::float8 cost,COALESCE(i.quantity,0)::float8 stock,COALESCE(i.reorder_level,0)::float8 threshold,p.status FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN locations l ON l.organization_id=p.organization_id AND l.is_default=true LEFT JOIN inventory_levels i ON i.product_id=p.id AND i.location_id=l.id`;
async function location(org: string, client: any) {
  const r = await client.query(
    `SELECT id FROM locations WHERE organization_id=$1 AND status='active' ORDER BY is_default DESC,created_at LIMIT 1`,
    [org],
  );
  if (!r.rowCount) throw new Error("Your business needs an active location.");
  return r.rows[0].id;
}
async function category(org: string, name: string, client: any) {
  const r = await client.query(
    `INSERT INTO categories(organization_id,name) VALUES($1,$2) ON CONFLICT(organization_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
    [org, name],
  );
  return r.rows[0].id;
}
const mapSale = (r: any) => ({
  id: r.id,
  number: `SAL-${r.receipt_number}`,
  createdAt: r.completed_at || r.created_at,
  sellerId: r.seller_id,
  sellerName: r.seller_name,
  customerId: r.customer_id,
  customerName: r.customer_name,
  payment: r.payment_method === "card" ? "pos" : r.payment_method,
  total: Number(r.total),
  profit: Number(r.total) - Number(r.cost_total),
  items: r.items || [],
});

export function createOperationalRouter(auth: RequestHandler) {
  const r = Router();
  r.use(auth);
  r.get("/dashboard", async (req: any, res, next) => {
    try {
      const org = req.user.organizationId;
      const metrics = await query(
        `SELECT COALESCE(sum(s.total),0)::float8 revenue,COALESCE(sum(s.total-s.cost_total),0)::float8 gross_profit,count(*)::int transactions,COALESCE(avg(s.total),0)::float8 aov,COALESCE(sum(s.total) FILTER(WHERE p.method='cash'),0)::float8 cash_sales,COALESCE(sum(s.total) FILTER(WHERE p.method='card'),0)::float8 pos_sales FROM sales s LEFT JOIN payments p ON p.sale_id=s.id AND p.status='completed' WHERE s.organization_id=$1 AND s.status='completed' AND s.completed_at>=now()-interval '30 days'`,
        [org],
      );
      const expenses = await query(
        `SELECT COALESCE(sum(amount),0)::float8 value FROM expenses WHERE organization_id=$1 AND status='active' AND expense_date>=current_date-30`,
        [org],
      );
      const products = await query(
        `${productSelect} WHERE p.organization_id=$1 AND p.status='active' ORDER BY p.name`,
        [org],
      );
      const recent = await sales(org, 5);
      const top = await query(
        `SELECT si.product_name name,sum(si.quantity)::float8 units FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.organization_id=$1 AND s.status='completed' AND s.completed_at>=now()-interval '30 days' GROUP BY si.product_name ORDER BY units DESC LIMIT 4`,
        [org],
      );
      const days = await query(
        `SELECT to_char(series_date,'Dy') AS "day",COALESCE(sum(s.total),0)::float8 AS "value" FROM generate_series((current_date-6)::date,current_date::date,interval '1 day') AS calendar(series_date) LEFT JOIN sales s ON s.organization_id=$1 AND s.status='completed' AND s.completed_at::date=series_date::date GROUP BY series_date ORDER BY series_date`,
        [org],
      );
      const low = products.rows.filter((p: any) => p.stock <= p.threshold);
      const m = metrics.rows[0];
      res.json({
        revenue: m.revenue,
        profit: m.gross_profit - expenses.rows[0].value,
        expenses: expenses.rows[0].value,
        transactions: m.transactions,
        aov: m.aov,
        cashSales: m.cash_sales,
        posSales: m.pos_sales,
        inventoryValue: products.rows.reduce(
          (a: number, p: any) => a + p.stock * p.cost,
          0,
        ),
        outOfStock: products.rows.filter((p: any) => p.stock === 0).length,
        lowStock: low,
        byDay: days.rows,
        topProducts: top.rows,
        recent,
        insight: low.length
          ? `${low.length} ${low.length === 1 ? "product needs" : "products need"} stock attention.`
          : null,
      });
    } catch (e) {
      next(e);
    }
  });
  r.get("/products", async (req: any, res, next) => {
    try {
      res.json(
        (
          await query(
            `${productSelect} WHERE p.organization_id=$1 ORDER BY p.created_at DESC`,
            [req.user.organizationId],
          )
        ).rows,
      );
    } catch (e) {
      next(e);
    }
  });
  r.get("/products/barcode/:barcode", async (req: any, res, next) => {
    try {
      const out = await query(
        `${productSelect} WHERE p.organization_id=$1 AND p.barcode=$2 AND p.status='active' LIMIT 1`,
        [req.user.organizationId, req.params.barcode],
      );
      if (!out.rowCount)
        return res
          .status(404)
          .json({ message: "No product is assigned to this barcode." });
      res.json(out.rows[0]);
    } catch (e) {
      next(e);
    }
  });
  r.get("/scan-intelligence/:barcode", async (req: any, res, next) => {
    try {
      const org = req.user.organizationId;
      const product = await query(
        `${productSelect} WHERE p.organization_id=$1 AND p.barcode=$2 AND p.status='active' LIMIT 1`,
        [org, req.params.barcode],
      );
      if (!product.rowCount)
        return res.status(404).json({
          message: "No product is assigned to this barcode.",
          barcode: req.params.barcode,
        });
      const p = product.rows[0];
      const [salesData, movements, supplier, branches] = await Promise.all([
        query(
          `SELECT COALESCE(sum(si.quantity),0)::float8 units,COALESCE(sum(si.line_total),0)::float8 revenue,COALESCE(sum((si.unit_price-si.unit_cost)*si.quantity),0)::float8 profit,count(DISTINCT s.id)::int transactions FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.organization_id=$1 AND si.product_id=$2 AND s.status='completed' AND s.completed_at>=now()-interval '30 days'`,
          [org, p.id],
        ),
        query(
          `SELECT sm.id,sm.type,sm.quantity::float8,sm.balance_after::float8 "balanceAfter",sm.reason,sm.occurred_at "createdAt",concat(u.first_name,' ',u.last_name) "userName" FROM stock_movements sm JOIN users u ON u.id=sm.performed_by WHERE sm.organization_id=$1 AND sm.product_id=$2 ORDER BY sm.occurred_at DESC LIMIT 10`,
          [org, p.id],
        ),
        query(
          `SELECT s.name "supplierName",pi.unit_cost::float8 "purchasePrice",pu.received_at "receivedAt" FROM purchase_items pi JOIN purchases pu ON pu.id=pi.purchase_id JOIN suppliers s ON s.id=pu.supplier_id WHERE pu.organization_id=$1 AND pi.product_id=$2 AND pu.status='received' ORDER BY pu.received_at DESC NULLS LAST LIMIT 1`,
          [org, p.id],
        ),
        query(
          `SELECT l.id,l.name,COALESCE(i.quantity,0)::float8 stock FROM locations l LEFT JOIN inventory_levels i ON i.location_id=l.id AND i.product_id=$2 WHERE l.organization_id=$1 AND l.status='active' ORDER BY l.is_default DESC,l.name`,
          [org, p.id],
        ),
      ]);
      const metrics = salesData.rows[0];
      const dailyVelocity = Number(metrics.units) / 30;
      const daysUntilStockout =
        dailyVelocity > 0 ? Number(p.stock) / dailyVelocity : null;
      const targetStock = Math.ceil(dailyVelocity * 21 + Number(p.threshold));
      res.json({
        product: p,
        intelligence: {
          margin: Number(p.price) - Number(p.cost),
          marginPercent: Number(p.price)
            ? ((Number(p.price) - Number(p.cost)) / Number(p.price)) * 100
            : 0,
          unitsSold30Days: Number(metrics.units),
          revenue30Days: Number(metrics.revenue),
          profit30Days: Number(metrics.profit),
          transactions30Days: Number(metrics.transactions),
          dailyVelocity,
          daysUntilStockout,
          suggestedReorder: Math.max(0, targetStock - Number(p.stock)),
          stockRisk:
            Number(p.stock) === 0
              ? "out"
              : Number(p.stock) <= Number(p.threshold)
                ? "low"
                : daysUntilStockout !== null && daysUntilStockout <= 7
                  ? "soon"
                  : "healthy",
        },
        lastPurchase: supplier.rows[0] || null,
        branches: branches.rows,
        movements: movements.rows,
      });
    } catch (e) {
      next(e);
    }
  });
  r.get("/barcode-lookup/:barcode", async (req: any, res, next) => {
    try {
      const barcode = String(req.params.barcode).trim();
      if (!/^\d{6,18}$/.test(barcode))
        return res
          .status(400)
          .json({ message: "This barcode format is not supported." });
      const fields = [
        "code",
        "product_name",
        "brands",
        "categories",
        "image_front_small_url",
        "quantity",
      ].join(",");
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?fields=${fields}`,
        {
          headers: {
            "User-Agent": "OikonOS/1.0 (https://oikonos.onrender.com)",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(7000),
        },
      );
      if (!response.ok)
        throw new Error("The product directory is temporarily unavailable.");
      const body: any = await response.json();
      if (body.result?.id !== "product_found" || !body.product)
        return res.json({ found: false, barcode, source: "Open Food Facts" });
      const product = body.product;
      res.json({
        found: true,
        barcode,
        source: "Open Food Facts",
        candidate: {
          name: product.product_name || "",
          brand: product.brands || "",
          category: String(product.categories || "")
            .split(",")[0]
            .trim(),
          quantity: product.quantity || "",
          image: product.image_front_small_url || "",
        },
      });
    } catch (e: any) {
      if (e?.name === "TimeoutError")
        return res.status(504).json({
          message: "Product lookup timed out. You can still add it manually.",
        });
      next(e);
    }
  });
  r.post("/products", async (req: any, res, next) => {
    try {
      if (req.user.role === "seller")
        return res.status(403).json({
          message: "Seller accounts cannot create catalogue products.",
        });
      const x = productInput.parse(req.body);
      const result = await transaction(async (c) => {
        const org = req.user.organizationId,
          loc = await location(org, c),
          cat = await category(org, x.category, c);
        const p = await c.query(
          `INSERT INTO products(organization_id,category_id,name,sku,barcode,selling_price,cost_price) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [org, cat, x.name, x.sku, x.barcode || null, x.price, x.cost],
        );
        await c.query(
          `INSERT INTO inventory_levels(organization_id,location_id,product_id,quantity,reorder_level,average_cost) VALUES($1,$2,$3,$4,$5,$6)`,
          [org, loc, p.rows[0].id, x.stock, x.threshold, x.cost],
        );
        if (x.stock)
          await c.query(
            `INSERT INTO stock_movements(organization_id,location_id,product_id,type,quantity,unit_cost,balance_after,reference_type,reference_id,reason,performed_by) VALUES($1,$2,$3,'opening',$4,$5,$4,'product',$3,'Opening stock',$6)`,
            [org, loc, p.rows[0].id, x.stock, x.cost, req.user.id],
          );
        return (await c.query(`${productSelect} WHERE p.id=$1`, [p.rows[0].id]))
          .rows[0];
      });
      res.status(201).json(result);
    } catch (e: any) {
      if (e.code === "23505")
        return res
          .status(400)
          .json({ message: "That SKU or barcode already exists." });
      next(e);
    }
  });
  const importRow = productInput
    .omit({ stock: true })
    .extend({ quantity: z.number().int().nonnegative() });
  r.post("/products/import/preview", async (req: any, res, next) => {
    try {
      const rows = z.array(importRow).min(1).max(5000).parse(req.body.rows);
      const current = await query(
        `SELECT p.id,p.sku,p.name,COALESCE(i.quantity,0)::float8 stock FROM products p LEFT JOIN locations l ON l.organization_id=p.organization_id AND l.is_default=true LEFT JOIN inventory_levels i ON i.product_id=p.id AND i.location_id=l.id WHERE p.organization_id=$1`,
        [req.user.organizationId],
      );
      const existing = new Map(
          current.rows.map((x) => [x.sku.toLowerCase(), x]),
        ),
        seen = new Set<string>();
      const preview = rows.map((data, index) => {
        const duplicate = seen.has(data.sku.toLowerCase());
        seen.add(data.sku.toLowerCase());
        const found = existing.get(data.sku.toLowerCase());
        return {
          row: index + 2,
          data,
          valid: !duplicate,
          errors: duplicate ? ["Duplicate SKU in this file."] : [],
          conflict: found
            ? {
                productId: found.id,
                currentStock: found.stock,
                currentName: found.name,
              }
            : null,
        };
      });
      res.json({
        rows: preview,
        summary: {
          total: preview.length,
          valid: preview.filter((x) => x.valid).length,
          invalid: preview.filter((x) => !x.valid).length,
          conflicts: preview.filter((x) => x.conflict).length,
        },
      });
    } catch (e) {
      next(e);
    }
  });
  r.post("/products/import/confirm", async (req: any, res, next) => {
    try {
      if (req.user.role === "seller")
        return res
          .status(403)
          .json({ message: "Only administrators can import stock." });
      const x = z
        .object({
          mode: z.enum(["add", "replace"]),
          rows: z.array(importRow).min(1).max(5000),
        })
        .parse(req.body);
      const output = await transaction(async (c) => {
        const org = req.user.organizationId,
          loc = await location(org, c),
          summary = { created: 0, updated: 0, movements: 0 };
        for (const row of x.rows) {
          const cat = await category(org, row.category, c);
          const found = await c.query(
            `SELECT p.id,COALESCE(i.quantity,0)::float8 stock FROM products p LEFT JOIN inventory_levels i ON i.product_id=p.id AND i.location_id=$2 WHERE p.organization_id=$1 AND lower(p.sku)=lower($3) FOR UPDATE OF p`,
            [org, loc, row.sku],
          );
          let productId: string,
            previous = 0;
          if (found.rowCount) {
            productId = found.rows[0].id;
            previous = found.rows[0].stock;
            await c.query(
              `UPDATE products SET name=$3,category_id=$4,barcode=COALESCE($5,barcode),selling_price=$6,cost_price=$7,updated_at=now() WHERE id=$1 AND organization_id=$2`,
              [
                productId,
                org,
                row.name,
                cat,
                row.barcode || null,
                row.price,
                row.cost,
              ],
            );
            summary.updated++;
          } else {
            const made = await c.query(
              `INSERT INTO products(organization_id,category_id,name,sku,barcode,selling_price,cost_price) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
              [
                org,
                cat,
                row.name,
                row.sku,
                row.barcode || null,
                row.price,
                row.cost,
              ],
            );
            productId = made.rows[0].id;
            await c.query(
              `INSERT INTO inventory_levels(organization_id,location_id,product_id,quantity,reorder_level,average_cost) VALUES($1,$2,$3,0,$4,$5)`,
              [org, loc, productId, row.threshold, row.cost],
            );
            summary.created++;
          }
          const after =
              x.mode === "add" ? previous + row.quantity : row.quantity,
            change = after - previous;
          await c.query(
            `UPDATE inventory_levels SET quantity=$4,reorder_level=$5,average_cost=$6,version=version+1,updated_at=now() WHERE organization_id=$1 AND location_id=$2 AND product_id=$3`,
            [org, loc, productId, after, row.threshold, row.cost],
          );
          if (change) {
            await c.query(
              `INSERT INTO stock_movements(organization_id,location_id,product_id,type,quantity,unit_cost,balance_after,reference_type,reference_id,reason,performed_by) VALUES($1,$2,$3,$4,$5,$6,$7,'import',gen_random_uuid(),$8,$9)`,
              [
                org,
                loc,
                productId,
                previous === 0 ? "opening" : "adjustment",
                change,
                row.cost,
                after,
                `Stock import (${x.mode} quantity)`,
                req.user.id,
              ],
            );
            summary.movements++;
          }
        }
        return summary;
      });
      res.status(201).json(output);
    } catch (e) {
      next(e);
    }
  });
  r.patch("/products/:id", async (req: any, res, next) => {
    try {
      const fields: any = req.body;
      await transaction(async (c) => {
        if (fields.category) {
          const cat = await category(
            req.user.organizationId,
            fields.category,
            c,
          );
          await c.query(
            `UPDATE products SET category_id=$3 WHERE id=$1 AND organization_id=$2`,
            [req.params.id, req.user.organizationId, cat],
          );
        }
        await c.query(
          `UPDATE products SET name=COALESCE($3,name),sku=COALESCE($4,sku),barcode=COALESCE($5,barcode),selling_price=COALESCE($6,selling_price),cost_price=COALESCE($7,cost_price),updated_at=now() WHERE id=$1 AND organization_id=$2`,
          [
            req.params.id,
            req.user.organizationId,
            fields.name,
            fields.sku,
            fields.barcode,
            fields.price,
            fields.cost,
          ],
        );
      });
      const out = await query(
        `${productSelect} WHERE p.id=$1 AND p.organization_id=$2`,
        [req.params.id, req.user.organizationId],
      );
      res.json(out.rows[0]);
    } catch (e) {
      next(e);
    }
  });
  r.get("/stock-movements", async (req: any, res, next) => {
    try {
      const vals: any[] = [req.user.organizationId];
      let extra = "";
      if (req.query.productId) {
        vals.push(req.query.productId);
        extra = " AND sm.product_id=$2";
      }
      const out = await query(
        `SELECT sm.id,sm.product_id "productId",p.name "productName",sm.type,sm.quantity::float8,sm.balance_after::float8 "newStock",(sm.balance_after-sm.quantity)::float8 "previousStock",sm.reason,sm.performed_by "userId",concat(u.first_name,' ',u.last_name) "userName",sm.reference_id "referenceId",sm.occurred_at "createdAt" FROM stock_movements sm JOIN products p ON p.id=sm.product_id JOIN users u ON u.id=sm.performed_by WHERE sm.organization_id=$1${extra} ORDER BY sm.occurred_at DESC LIMIT 500`,
        vals,
      );
      res.json(out.rows);
    } catch (e) {
      next(e);
    }
  });
  r.post("/products/:id/adjust-stock", async (req: any, res, next) => {
    try {
      if (req.user.role === "seller")
        return res
          .status(403)
          .json({ message: "Only administrators can adjust stock." });
      const x = z
        .object({
          physicalCount: z.number().int().nonnegative(),
          reason: z.string().min(3),
          type: z.string(),
        })
        .parse(req.body);
      const result = await transaction(async (c) => {
        const org = req.user.organizationId,
          loc = await location(org, c);
        const locked = await c.query(
          `SELECT i.quantity::float8,p.name FROM inventory_levels i JOIN products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.location_id=$2 AND i.product_id=$3 FOR UPDATE`,
          [org, loc, req.params.id],
        );
        if (!locked.rowCount) throw new Error("Product not found.");
        const previous = locked.rows[0].quantity,
          change = x.physicalCount - previous;
        if (!change)
          throw new Error("The physical count matches current stock.");
        await c.query(
          `UPDATE inventory_levels SET quantity=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND location_id=$2 AND product_id=$3`,
          [org, loc, req.params.id, x.physicalCount],
        );
        const m = await c.query(
          `INSERT INTO stock_movements(organization_id,location_id,product_id,type,quantity,balance_after,reference_type,reference_id,reason,performed_by) VALUES($1,$2,$3,'adjustment',$4,$5,'adjustment',gen_random_uuid(),$6,$7) RETURNING id,occurred_at`,
          [
            org,
            loc,
            req.params.id,
            change,
            x.physicalCount,
            x.reason,
            req.user.id,
          ],
        );
        await queueAdminEmails(c, {
          organizationId: org,
          event: "inventory.adjusted",
          payload: {
            productName: locked.rows[0].name,
            actorName: req.user.name,
            previousStock: previous,
            newStock: x.physicalCount,
            reason: x.reason,
            url: `${process.env.APP_URL || "https://oikonos.onrender.com"}/inventory`,
          },
          deduplicationKey: `inventory.adjusted:${m.rows[0].id}`,
        });
        return {
          product: {
            id: req.params.id,
            name: locked.rows[0].name,
            stock: x.physicalCount,
          },
          movement: {
            id: m.rows[0].id,
            productId: req.params.id,
            productName: locked.rows[0].name,
            type: x.type,
            quantity: change,
            previousStock: previous,
            newStock: x.physicalCount,
            reason: x.reason,
            userId: req.user.id,
            userName: req.user.name,
            createdAt: m.rows[0].occurred_at,
          },
        };
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });
  r.post("/scan-intelligence/stock-counts", async (req: any, res, next) => {
    try {
      if (req.user.role === "seller")
        return res.status(403).json({
          message: "Seller accounts cannot reconcile physical stock counts.",
        });
      const input = z
        .object({
          reason: z.string().trim().min(3).max(300),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                countedQuantity: z.number().int().nonnegative(),
              }),
            )
            .min(1)
            .max(1000),
        })
        .refine(
          (value) =>
            new Set(value.items.map((item) => item.productId)).size ===
            value.items.length,
          { message: "A product can only appear once in a stock count." },
        )
        .parse(req.body);
      const result = await transaction(async (client) => {
        const organizationId = req.user.organizationId;
        const locationId = await location(organizationId, client);
        const session = await client.query(
          `INSERT INTO inventory_count_sessions(
             organization_id,location_id,status,reason,product_count,created_by
           ) VALUES($1,$2,'draft',$3,$4,$5)
           RETURNING id,started_at`,
          [
            organizationId,
            locationId,
            input.reason,
            input.items.length,
            req.user.id,
          ],
        );
        const lines: any[] = [];
        for (const item of input.items) {
          const locked = await client.query(
            `SELECT i.quantity::float8 recorded_quantity,p.name
             FROM inventory_levels i
             JOIN products p ON p.id=i.product_id
             WHERE i.organization_id=$1 AND i.location_id=$2 AND i.product_id=$3
             FOR UPDATE`,
            [organizationId, locationId, item.productId],
          );
          if (!locked.rowCount)
            throw new Error("A counted product no longer exists in inventory.");
          const recorded = Number(locked.rows[0].recorded_quantity);
          const variance = item.countedQuantity - recorded;
          let movementId: string | null = null;
          if (variance !== 0) {
            await client.query(
              `UPDATE inventory_levels
               SET quantity=$4,version=version+1,updated_at=now()
               WHERE organization_id=$1 AND location_id=$2 AND product_id=$3`,
              [
                organizationId,
                locationId,
                item.productId,
                item.countedQuantity,
              ],
            );
            const movement = await client.query(
              `INSERT INTO stock_movements(
                 organization_id,location_id,product_id,type,quantity,balance_after,
                 reference_type,reference_id,reason,performed_by
               ) VALUES($1,$2,$3,'adjustment',$4,$5,'inventory_count',$6,$7,$8)
               RETURNING id`,
              [
                organizationId,
                locationId,
                item.productId,
                variance,
                item.countedQuantity,
                session.rows[0].id,
                input.reason,
                req.user.id,
              ],
            );
            movementId = movement.rows[0].id;
            await queueAdminEmails(client, {
              organizationId,
              event: "inventory.adjusted",
              payload: {
                productName: locked.rows[0].name,
                actorName: req.user.name,
                previousStock: recorded,
                newStock: item.countedQuantity,
                reason: input.reason,
                url: `${process.env.APP_URL || "https://oikonos.onrender.com"}/inventory`,
              },
              deduplicationKey: `inventory.count:${session.rows[0].id}:${item.productId}`,
            });
          }
          await client.query(
            `INSERT INTO inventory_count_lines(
               session_id,product_id,recorded_quantity,counted_quantity,variance,movement_id
             ) VALUES($1,$2,$3,$4,$5,$6)`,
            [
              session.rows[0].id,
              item.productId,
              recorded,
              item.countedQuantity,
              variance,
              movementId,
            ],
          );
          lines.push({
            productId: item.productId,
            productName: locked.rows[0].name,
            recordedQuantity: recorded,
            countedQuantity: item.countedQuantity,
            variance,
          });
        }
        const changed = lines.filter((line) => line.variance !== 0);
        const totalUnitVariance = changed.reduce(
          (total, line) => total + Math.abs(line.variance),
          0,
        );
        await client.query(
          `UPDATE inventory_count_sessions
           SET status='completed',variance_count=$2,total_unit_variance=$3,completed_at=now()
           WHERE id=$1`,
          [session.rows[0].id, changed.length, totalUnitVariance],
        );
        return {
          id: session.rows[0].id,
          status: "completed",
          productCount: lines.length,
          varianceCount: changed.length,
          totalUnitVariance,
          countedBy: req.user.name,
          lines,
        };
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });
  r.post("/scan-intelligence/receive", async (req: any, res, next) => {
    try {
      if (req.user.role === "seller")
        return res
          .status(403)
          .json({ message: "Seller accounts cannot receive stock." });
      const input = z
        .object({
          supplierName: z.string().trim().min(2).max(160),
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                quantity: z.number().int().positive(),
                unitCost: z.number().nonnegative(),
              }),
            )
            .min(1)
            .max(500),
        })
        .parse(req.body);
      const result = await transaction(async (client) => {
        const org = req.user.organizationId;
        const loc = await location(org, client);
        let supplier = await client.query(
          `SELECT id FROM suppliers WHERE organization_id=$1 AND lower(name)=lower($2) AND status='active' LIMIT 1`,
          [org, input.supplierName],
        );
        if (!supplier.rowCount)
          supplier = await client.query(
            `INSERT INTO suppliers(organization_id,name) VALUES($1,$2) RETURNING id`,
            [org, input.supplierName],
          );
        const total = input.items.reduce(
          (sum, item) => sum + item.quantity * item.unitCost,
          0,
        );
        const purchase = await client.query(
          `INSERT INTO purchases(organization_id,location_id,supplier_id,status,subtotal,total,amount_paid,received_at,created_by) VALUES($1,$2,$3,'received',$4,$4,0,now(),$5) RETURNING id,purchase_number`,
          [org, loc, supplier.rows[0].id, total, req.user.id],
        );
        for (const item of input.items) {
          const stock = await client.query(
            `SELECT i.quantity::float8,p.name FROM inventory_levels i JOIN products p ON p.id=i.product_id WHERE i.organization_id=$1 AND i.location_id=$2 AND i.product_id=$3 FOR UPDATE`,
            [org, loc, item.productId],
          );
          if (!stock.rowCount)
            throw new Error("A received product was not found.");
          const after = Number(stock.rows[0].quantity) + item.quantity;
          await client.query(
            `INSERT INTO purchase_items(purchase_id,product_id,quantity_ordered,quantity_received,unit_cost,line_total) VALUES($1,$2,$3,$3,$4,$5)`,
            [
              purchase.rows[0].id,
              item.productId,
              item.quantity,
              item.unitCost,
              item.quantity * item.unitCost,
            ],
          );
          await client.query(
            `UPDATE inventory_levels SET quantity=$4,updated_at=now(),version=version+1 WHERE organization_id=$1 AND location_id=$2 AND product_id=$3`,
            [org, loc, item.productId, after],
          );
          await client.query(
            `UPDATE products SET cost_price=$3,updated_at=now() WHERE organization_id=$1 AND id=$2`,
            [org, item.productId, item.unitCost],
          );
          await client.query(
            `INSERT INTO stock_movements(organization_id,location_id,product_id,type,quantity,unit_cost,balance_after,reference_type,reference_id,reason,performed_by) VALUES($1,$2,$3,'purchase',$4,$5,$6,'purchase',$7,$8,$9)`,
            [
              org,
              loc,
              item.productId,
              item.quantity,
              item.unitCost,
              after,
              purchase.rows[0].id,
              `Received from ${input.supplierName}`,
              req.user.id,
            ],
          );
        }
        return {
          purchaseNumber: purchase.rows[0].purchase_number,
          items: input.items.length,
          total,
        };
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  });
  async function sales(org: string, limit = 1000) {
    const out = await query(
      `SELECT s.*,concat(u.first_name,' ',u.last_name) seller_name,concat(c.first_name,' ',c.last_name) customer_name,p.method payment_method,COALESCE(json_agg(json_build_object('productId',si.product_id,'name',si.product_name,'qty',si.quantity::float8,'price',si.unit_price::float8)) FILTER(WHERE si.id IS NOT NULL),'[]') items FROM sales s JOIN users u ON u.id=s.seller_id LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN payments p ON p.sale_id=s.id LEFT JOIN sale_items si ON si.sale_id=s.id WHERE s.organization_id=$1 GROUP BY s.id,u.first_name,u.last_name,c.first_name,c.last_name,p.method ORDER BY s.created_at DESC LIMIT $2`,
      [org, limit],
    );
    return out.rows.map(mapSale);
  }
  r.get("/sales", async (req: any, res, next) => {
    try {
      res.json(await sales(req.user.organizationId));
    } catch (e) {
      next(e);
    }
  });
  r.post("/sales", async (req: any, res, next) => {
    try {
      const x = z
        .object({
          items: z
            .array(
              z.object({
                productId: z.string().uuid(),
                qty: z.number().int().positive(),
              }),
            )
            .min(1),
          payment: z.enum(["cash", "pos"]),
          customerId: z.string().uuid().optional(),
        })
        .parse(req.body);
      const sale = await transaction(async (c) => {
        const org = req.user.organizationId,
          loc = await location(org, c);
        let subtotal = 0,
          cost = 0;
        const lines: any[] = [];
        for (const line of x.items) {
          const p = await c.query(
            `SELECT p.id,p.name,p.sku,p.selling_price::float8,p.cost_price::float8,i.quantity::float8 FROM products p JOIN inventory_levels i ON i.product_id=p.id AND i.location_id=$2 WHERE p.organization_id=$1 AND p.id=$3 AND p.status='active' FOR UPDATE OF i`,
            [org, loc, line.productId],
          );
          if (!p.rowCount)
            throw new Error("A product in this cart no longer exists.");
          if (p.rows[0].quantity < line.qty)
            throw new Error(
              `${p.rows[0].name} only has ${p.rows[0].quantity} left in stock.`,
            );
          lines.push({ ...p.rows[0], qty: line.qty });
          subtotal += p.rows[0].selling_price * line.qty;
          cost += p.rows[0].cost_price * line.qty;
        }
        const s = await c.query(
          `INSERT INTO sales(organization_id,location_id,seller_id,customer_id,status,subtotal,total,cost_total,completed_at) VALUES($1,$2,$3,$4,'completed',$5,$5,$6,now()) RETURNING *`,
          [org, loc, req.user.id, x.customerId || null, subtotal, cost],
        );
        for (const line of lines) {
          await c.query(
            `INSERT INTO sale_items(sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              s.rows[0].id,
              line.id,
              line.name,
              line.sku,
              line.qty,
              line.selling_price,
              line.cost_price,
              line.selling_price * line.qty,
            ],
          );
          const after = line.quantity - line.qty;
          await c.query(
            `UPDATE inventory_levels SET quantity=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND location_id=$2 AND product_id=$3`,
            [org, loc, line.id, after],
          );
          await c.query(
            `INSERT INTO stock_movements(organization_id,location_id,product_id,type,quantity,unit_cost,balance_after,reference_type,reference_id,reason,performed_by) VALUES($1,$2,$3,'sale',$4,$5,$6,'sale',$7,'Completed sale',$8)`,
            [
              org,
              loc,
              line.id,
              -line.qty,
              line.cost_price,
              after,
              s.rows[0].id,
              req.user.id,
            ],
          );
        }
        await c.query(
          `INSERT INTO payments(organization_id,sale_id,method,status,amount,idempotency_key,received_by,completed_at) VALUES($1,$2,$3,'completed',$4,$5,$6,now())`,
          [
            org,
            s.rows[0].id,
            x.payment === "pos" ? "card" : "cash",
            subtotal,
            `sale:${s.rows[0].id}`,
            req.user.id,
          ],
        );
        await queueAdminEmails(c, {
          organizationId: org,
          event: "sale.completed",
          payload: {
            number: `SAL-${String(s.rows[0].receipt_number).padStart(4, "0")}`,
            sellerName: req.user.name,
            payment: x.payment,
            total: subtotal,
            currency: "NGN",
            url: `${process.env.APP_URL || "https://oikonos.onrender.com"}/sales`,
          },
          deduplicationKey: `sale.completed:${s.rows[0].id}`,
        });
        return {
          ...s.rows[0],
          seller_name: req.user.name,
          payment_method: x.payment === "pos" ? "card" : "cash",
          items: lines.map((l) => ({
            productId: l.id,
            name: l.name,
            qty: l.qty,
            price: l.selling_price,
          })),
        };
      });
      res.status(201).json(mapSale(sale));
    } catch (e) {
      next(e);
    }
  });
  r.get("/reports", async (req: any, res, next) => {
    try {
      const period = String(req.query.period || "30");
      if (!["7", "30", "90", "365", "all"].includes(period))
        return res.status(400).json({ message: "Invalid report period." });
      const from =
        period === "all"
          ? null
          : new Date(Date.now() - Number(period) * 86_400_000).toISOString();
      const org = req.user.organizationId;
      const dateFilter = `($2::timestamptz IS NULL OR s.completed_at >= $2::timestamptz)`;
      const [summary, trend, products, inventory, customers, expenseGroups] =
        await Promise.all([
          query(
            `SELECT COALESCE(sum(s.total),0)::float8 revenue,COALESCE(sum(s.total-s.cost_total),0)::float8 "grossProfit",count(*)::int transactions,COALESCE(avg(s.total),0)::float8 "averageOrder",COALESCE((SELECT sum(si.quantity) FROM sale_items si JOIN sales sx ON sx.id=si.sale_id WHERE sx.organization_id=$1 AND sx.status='completed' AND ($2::timestamptz IS NULL OR sx.completed_at >= $2::timestamptz)),0)::float8 "unitsSold",COALESCE(sum(s.total) FILTER(WHERE p.method='cash'),0)::float8 cash,COALESCE(sum(s.total) FILTER(WHERE p.method='card'),0)::float8 pos FROM sales s LEFT JOIN payments p ON p.sale_id=s.id AND p.status='completed' WHERE s.organization_id=$1 AND s.status='completed' AND ${dateFilter}`,
            [org, from],
          ),
          query(
            `SELECT to_char(date_trunc('day',s.completed_at),'YYYY-MM-DD') AS "day",sum(s.total)::float8 revenue,sum(s.total-s.cost_total)::float8 profit,count(*)::int transactions FROM sales s WHERE s.organization_id=$1 AND s.status='completed' AND ${dateFilter} GROUP BY date_trunc('day',s.completed_at) ORDER BY date_trunc('day',s.completed_at)`,
            [org, from],
          ),
          query(
            `SELECT si.product_name name,sum(si.quantity)::float8 units,sum(si.line_total)::float8 revenue,sum((si.unit_price-si.unit_cost)*si.quantity)::float8 profit FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.organization_id=$1 AND s.status='completed' AND ${dateFilter} GROUP BY si.product_name ORDER BY revenue DESC LIMIT 20`,
            [org, from],
          ),
          query(
            `SELECT p.name,p.sku,c.name category,COALESCE(i.quantity,0)::float8 stock,COALESCE(i.reorder_level,0)::float8 threshold,(COALESCE(i.quantity,0)*p.cost_price)::float8 value FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN locations l ON l.organization_id=p.organization_id AND l.is_default=true LEFT JOIN inventory_levels i ON i.product_id=p.id AND i.location_id=l.id WHERE p.organization_id=$1 AND p.status='active' ORDER BY value DESC`,
            [org],
          ),
          query(
            `SELECT trim(concat(c.first_name,' ',c.last_name)) name,c.phone,c.email,COALESCE(sum(s.total) FILTER(WHERE s.status='completed' AND ${dateFilter}),0)::float8 "totalSpent",count(s.id) FILTER(WHERE s.status='completed' AND ${dateFilter})::int purchases,max(s.completed_at) FILTER(WHERE s.status='completed' AND ${dateFilter}) "lastPurchase" FROM customers c LEFT JOIN sales s ON s.customer_id=c.id WHERE c.organization_id=$1 AND c.status='active' GROUP BY c.id ORDER BY "totalSpent" DESC`,
            [org, from],
          ),
          query(
            `SELECT ec.name category,sum(e.amount)::float8 amount FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id WHERE e.organization_id=$1 AND e.status='active' AND ($2::timestamptz IS NULL OR e.expense_date >= $2::date) GROUP BY ec.name ORDER BY amount DESC`,
            [org, from],
          ),
        ]);
      const expenses = expenseGroups.rows.reduce(
        (sum: number, row: any) => sum + Number(row.amount),
        0,
      );
      const inventoryValue = inventory.rows.reduce(
        (sum: number, row: any) => sum + Number(row.value),
        0,
      );
      res.json({
        period,
        summary: {
          ...summary.rows[0],
          expenses,
          netProfit: Number(summary.rows[0].grossProfit) - expenses,
          inventoryValue,
          customerCount: customers.rows.length,
        },
        trend: trend.rows,
        products: products.rows,
        inventory: inventory.rows,
        customers: customers.rows,
        expenses: expenseGroups.rows,
      });
    } catch (e) {
      next(e);
    }
  });
  r.get("/customers", async (req: any, res, next) => {
    try {
      const out = await query(
        `SELECT c.id,trim(concat(c.first_name,' ',c.last_name)) name,c.phone,c.email,COALESCE(sum(s.total),0)::float8 "totalSpent",count(s.id)::int purchases,max(s.completed_at) "lastPurchase" FROM customers c LEFT JOIN sales s ON s.customer_id=c.id AND s.status='completed' WHERE c.organization_id=$1 AND c.status='active' GROUP BY c.id ORDER BY c.created_at DESC`,
        [req.user.organizationId],
      );
      res.json(out.rows);
    } catch (e) {
      next(e);
    }
  });
  r.post("/customers", async (req: any, res, next) => {
    try {
      const x = z
          .object({
            name: z.string().min(2),
            phone: z.string().min(7),
            email: z.string().email().or(z.literal("")),
          })
          .parse(req.body),
        parts = x.name.trim().split(/\s+/),
        first = parts.shift()!,
        last = parts.join(" ") || null;
      const out = await query(
        `INSERT INTO customers(organization_id,first_name,last_name,phone,email) VALUES($1,$2,$3,$4,$5) RETURNING id,trim(concat(first_name,' ',last_name)) name,phone,email,0::float8 "totalSpent",0::int purchases,NULL "lastPurchase"`,
        [req.user.organizationId, first, last, x.phone, x.email || null],
      );
      res.status(201).json(out.rows[0]);
    } catch (e) {
      next(e);
    }
  });
  r.get("/expenses", async (req: any, res, next) => {
    try {
      const out = await query(
        `SELECT e.id,e.description,c.name category,e.amount::float8,e.expense_date date FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE e.organization_id=$1 AND e.status='active' ORDER BY e.expense_date DESC`,
        [req.user.organizationId],
      );
      res.json(out.rows);
    } catch (e) {
      next(e);
    }
  });
  r.post("/expenses", async (req: any, res, next) => {
    try {
      const x = z
        .object({
          description: z.string().min(2),
          category: z.string().min(2),
          amount: z.number().positive(),
          date: z.string(),
        })
        .parse(req.body);
      const out = await transaction(async (c) => {
        const cat = await c.query(
          `INSERT INTO expense_categories(organization_id,name) VALUES($1,$2) ON CONFLICT(organization_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [req.user.organizationId, x.category],
        );
        return c.query(
          `INSERT INTO expenses(organization_id,category_id,description,amount,expense_date,payment_method,recorded_by) VALUES($1,$2,$3,$4,$5,'cash',$6) RETURNING id,description,$7::text category,amount::float8,expense_date date`,
          [
            req.user.organizationId,
            cat.rows[0].id,
            x.description,
            x.amount,
            x.date,
            req.user.id,
            x.category,
          ],
        );
      });
      res.status(201).json(out.rows[0]);
    } catch (e) {
      next(e);
    }
  });
  r.get("/inventory/anomalies", async (_req, res) => res.json([]));
  return r;
}
