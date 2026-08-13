import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    const dir = path.join(process.cwd(), "database", "migrations");
    for (const name of fs
      .readdirSync(dir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      const done = await client.query(
        "SELECT 1 FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (done.rowCount) continue;
      console.log(`Applying ${name}`);
      await client.query("BEGIN");
      try {
        await client.query(fs.readFileSync(path.join(dir, name), "utf8"));
        await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    console.log("Database migrations complete.");
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
