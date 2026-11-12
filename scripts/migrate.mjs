// Applies pending SQL migrations from ./drizzle. Runs once before the app
// starts (see the `migrate` service in docker-compose.yml).
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
