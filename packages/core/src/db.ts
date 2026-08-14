import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

// Walk up from cwd to the workspace root so the same default path works no
// matter which package the process was started from.
export function findRepoRoot(from: string = process.cwd()): string {
  let dir = from;
  for (;;) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(pkg, "utf8"));
        if (parsed.workspaces) return dir;
      } catch {
        // unreadable package.json; keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
}

export function defaultDbPath(): string {
  return (
    process.env.JOBTRACK_DB ?? path.join(findRepoRoot(), "data", "jobtrack.db")
  );
}

function migrationsFolder(): string {
  return path.join(findRepoRoot(), "packages", "core", "drizzle");
}

export function createDb(dbPath: string = defaultDbPath()): Db {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}

let singleton: Db | undefined;

export function getDb(): Db {
  singleton ??= createDb();
  return singleton;
}
