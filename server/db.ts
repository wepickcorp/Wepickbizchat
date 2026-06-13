import { Pool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from "pg";
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const isLocalDevWithoutDb =
  process.env.NODE_ENV === "development" &&
  process.env.REPL_ID === "local-dev" &&
  !process.env.DATABASE_URL;

if (!process.env.DATABASE_URL && !isLocalDevWithoutDb) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

if (isLocalDevWithoutDb) {
  console.warn("DATABASE_URL is not set; local API requests that need the database will fail.");
}

const connectionString = process.env.DATABASE_URL || "postgresql://localhost:5432/wepick_local";
const isLocalPostgres = /@(localhost|127\.0\.0\.1|postgres)(:|\/)/.test(connectionString);

export const pool = isLocalPostgres
  ? new PgPool({ connectionString })
  : new Pool({ connectionString });

export const db = isLocalPostgres
  ? drizzleNodePostgres(pool as PgPool, { schema })
  : drizzleNeon({ client: pool as Pool, schema });
