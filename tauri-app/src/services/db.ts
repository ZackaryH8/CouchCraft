import Database from "@tauri-apps/plugin-sql";
import type { GameInstance } from "../types";

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!_db) _db = await Database.load("sqlite:couchcraft.db");
  return _db;
}

type InstanceRow = {
  id: string;
  name: string;
  loader: string;
  minecraft_version: string;
  color: string;
  mod_count: string;
  last_played: string;
  playtime: string;
  status: string;
  summary: string;
  details: string;
};

function rowToInstance(row: InstanceRow): GameInstance {
  return {
    id: row.id,
    name: row.name,
    loader: row.loader,
    minecraftVersion: row.minecraft_version,
    color: row.color,
    modCount: row.mod_count,
    lastPlayed: row.last_played,
    playtime: row.playtime,
    status: row.status,
    summary: row.summary,
    details: row.details,
  };
}

export async function loadInstances(): Promise<GameInstance[]> {
  const db = await getDb();
  const rows = await db.select<InstanceRow[]>(
    "SELECT * FROM instances ORDER BY sort_order ASC, created_at ASC",
  );
  return rows.map(rowToInstance);
}

export async function saveInstance(instance: GameInstance, sortOrder: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO instances
     (id, name, loader, minecraft_version, color, mod_count, last_played, playtime, status, summary, details, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      instance.id,
      instance.name,
      instance.loader,
      instance.minecraftVersion,
      instance.color,
      instance.modCount,
      instance.lastPlayed,
      instance.playtime,
      instance.status,
      instance.summary,
      instance.details,
      sortOrder,
    ],
  );
}

export async function deleteInstance(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM instances WHERE id = $1", [id]);
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
    [key, value],
  );
}

// ── Auth ──────────────────────────────────────────────────────────────────────

type StoredAuth = {
  ms_refresh_token: string;
  mc_access_token: string;
  mc_username: string;
  mc_uuid: string;
  expires_at: number;
};

export async function saveAuth(account: StoredAuth): Promise<void> {
  await Promise.all([
    setSetting("auth.ms_refresh_token", account.ms_refresh_token),
    setSetting("auth.mc_access_token", account.mc_access_token),
    setSetting("auth.mc_username", account.mc_username),
    setSetting("auth.mc_uuid", account.mc_uuid),
    setSetting("auth.expires_at", String(account.expires_at)),
  ]);
}

export async function loadAuth(): Promise<StoredAuth | null> {
  const [refreshToken, accessToken, username, uuid, expiresAt] = await Promise.all([
    getSetting("auth.ms_refresh_token"),
    getSetting("auth.mc_access_token"),
    getSetting("auth.mc_username"),
    getSetting("auth.mc_uuid"),
    getSetting("auth.expires_at"),
  ]);
  if (!refreshToken || !username || !uuid || !expiresAt) return null;
  return {
    ms_refresh_token: refreshToken,
    mc_access_token: accessToken ?? "",
    mc_username: username,
    mc_uuid: uuid,
    expires_at: Number(expiresAt),
  };
}

export async function clearAuth(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM settings WHERE key LIKE 'auth.%'", []);
}
