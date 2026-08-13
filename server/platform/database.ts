import pg from "pg";
import { config } from "./config.js";
const { Pool } = pg;
const databaseUrl = config().DATABASE_URL;
const databaseHost = new URL(databaseUrl).hostname;
const databaseSsl =
  databaseHost === "localhost" || databaseHost === "127.0.0.1"
    ? false
    : { rejectUnauthorized: false };
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: databaseSsl,
});
pool.on("error", (error) =>
  console.error(
    JSON.stringify({
      level: "error",
      event: "postgres_pool_error",
      message: error.message,
    }),
  ),
);
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  values: unknown[] = [],
) {
  return pool.query<T>(text, values);
}
export async function transaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function health() {
  const started = performance.now();
  await query("SELECT 1");
  return { database: "up", latencyMs: Math.round(performance.now() - started) };
}
