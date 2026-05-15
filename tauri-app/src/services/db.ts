import Database from "@tauri-apps/plugin-sql";
import type { ContentCategory, ContentItem, ContentSource, GameInstance, JavaRuntime, JavaVersion, LoaderType } from "../types";

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!_db) _db = await Database.load("sqlite:couchcraft.db");
  return _db;
}

// ── Instances ─────────────────────────────────────────────────────────────────

type InstanceRow = {
  id: string;
  name: string;
  loader: string;
  minecraft_version: string;
  color: string;
  loader_version: string;
  java_version: number;
  ram_mb: number;
  jvm_args: string;
  notes: string;
  last_played_at: number | null;
  play_time_secs: number;
  mod_count: number;
  sort_order: number;
  created_at: number;
};

function rowToInstance(row: InstanceRow): GameInstance {
  return {
    id: row.id,
    name: row.name,
    loaderType: row.loader as LoaderType,
    loaderVersion: row.loader_version,
    minecraftVersion: row.minecraft_version,
    color: row.color,
    javaVersion: row.java_version as JavaVersion,
    ramMb: row.ram_mb,
    jvmArgs: row.jvm_args,
    notes: row.notes,
    lastPlayedAt: row.last_played_at,
    playTimeSecs: row.play_time_secs,
    modCount: row.mod_count,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function loadInstances(): Promise<GameInstance[]> {
  const db = await getDb();
  const rows = await db.select<InstanceRow[]>(`
    SELECT i.id, i.name, i.loader, i.minecraft_version, i.color,
           i.loader_version, i.java_version, i.ram_mb, i.jvm_args, i.notes,
           i.last_played_at, i.play_time_secs, i.sort_order, i.created_at,
           (SELECT COUNT(*) FROM content WHERE instance_id = i.id AND category = 'mod') AS mod_count
    FROM instances i
    ORDER BY i.sort_order ASC, i.created_at ASC
  `);
  return rows.map(rowToInstance);
}

export async function insertInstance(instance: GameInstance, sortOrder: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO instances
     (id, name, loader, minecraft_version, color, loader_version, java_version, ram_mb,
      jvm_args, notes, last_played_at, play_time_secs, sort_order, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      instance.id,
      instance.name,
      instance.loaderType,
      instance.minecraftVersion,
      instance.color,
      instance.loaderVersion,
      instance.javaVersion,
      instance.ramMb,
      instance.jvmArgs,
      instance.notes,
      instance.lastPlayedAt,
      instance.playTimeSecs,
      sortOrder,
      instance.createdAt,
    ],
  );
}

export async function updateInstance(instance: GameInstance, sortOrder: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE instances SET
       name = $2, loader = $3, minecraft_version = $4, color = $5,
       loader_version = $6, java_version = $7, ram_mb = $8, jvm_args = $9,
       notes = $10, last_played_at = $11, play_time_secs = $12, sort_order = $13
     WHERE id = $1`,
    [
      instance.id,
      instance.name,
      instance.loaderType,
      instance.minecraftVersion,
      instance.color,
      instance.loaderVersion,
      instance.javaVersion,
      instance.ramMb,
      instance.jvmArgs,
      instance.notes,
      instance.lastPlayedAt,
      instance.playTimeSecs,
      sortOrder,
    ],
  );
}

export async function touchLastPlayed(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE instances SET last_played_at = $2 WHERE id = $1",
    [id, Math.floor(Date.now() / 1000)],
  );
}

export async function addPlayTime(id: string, secs: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE instances SET play_time_secs = play_time_secs + $2 WHERE id = $1",
    [id, secs],
  );
}

export async function deleteInstance(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM instances WHERE id = $1", [id]);
  await db.execute("DELETE FROM content WHERE instance_id = $1", [id]);
}

// ── Content ───────────────────────────────────────────────────────────────────

type ContentRow = {
  id: string;
  instance_id: string;
  category: string;
  name: string;
  filename: string;
  version: string;
  source: string;
  modrinth_project_id: string | null;
  modrinth_version_id: string | null;
  enabled: number;
  installed_at: number;
  update_checked_at: number | null;
  update_available: number;
};

function rowToContent(row: ContentRow): ContentItem {
  return {
    id: row.id,
    instanceId: row.instance_id,
    category: row.category as ContentCategory,
    name: row.name,
    filename: row.filename,
    version: row.version,
    source: row.source as ContentSource,
    modrinthProjectId: row.modrinth_project_id,
    modrinthVersionId: row.modrinth_version_id,
    enabled: row.enabled === 1,
    installedAt: row.installed_at,
    updateCheckedAt: row.update_checked_at,
    updateAvailable: row.update_available === 1,
  };
}

export async function loadContent(instanceId: string, category?: ContentCategory): Promise<ContentItem[]> {
  const db = await getDb();
  if (category) {
    const rows = await db.select<ContentRow[]>(
      "SELECT * FROM content WHERE instance_id = $1 AND category = $2 ORDER BY name ASC",
      [instanceId, category],
    );
    return rows.map(rowToContent);
  }
  const rows = await db.select<ContentRow[]>(
    "SELECT * FROM content WHERE instance_id = $1 ORDER BY category ASC, name ASC",
    [instanceId],
  );
  return rows.map(rowToContent);
}

export async function insertContent(item: ContentItem): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO content
     (id, instance_id, category, name, filename, version, source,
      modrinth_project_id, modrinth_version_id, enabled, installed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      item.id,
      item.instanceId,
      item.category,
      item.name,
      item.filename,
      item.version,
      item.source,
      item.modrinthProjectId,
      item.modrinthVersionId,
      item.enabled ? 1 : 0,
      item.installedAt,
    ],
  );
}

export async function setContentEnabled(id: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE content SET enabled = $2 WHERE id = $1", [id, enabled ? 1 : 0]);
}

export async function setContentUpdateAvailable(id: string, versionId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE content SET update_available = 1, update_checked_at = (unixepoch()) WHERE id = $1",
    [id],
  );
  // Store the available version id for later use
  await db.execute("UPDATE content SET modrinth_version_id = $2 WHERE id = $1 AND update_available = 1", [id, versionId]);
}

export async function clearContentUpdate(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE content SET update_available = 0, update_checked_at = (unixepoch()) WHERE id = $1",
    [id],
  );
}

export async function deleteContent(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM content WHERE id = $1", [id]);
}

// ── Java runtimes ─────────────────────────────────────────────────────────────

type JavaRuntimeRow = {
  version: number;
  path: string;
  build_string: string;
  is_system: number;
};

export async function loadJavaRuntimes(): Promise<JavaRuntime[]> {
  const db = await getDb();
  const rows = await db.select<JavaRuntimeRow[]>("SELECT * FROM java_runtimes ORDER BY version ASC");
  return rows.map((row) => ({
    version: row.version as JavaVersion,
    path: row.path,
    buildString: row.build_string,
    isSystem: row.is_system === 1,
  }));
}

export async function upsertJavaRuntime(runtime: JavaRuntime): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR REPLACE INTO java_runtimes (version, path, build_string, is_system)
     VALUES ($1, $2, $3, $4)`,
    [runtime.version, runtime.path, runtime.buildString, runtime.isSystem ? 1 : 0],
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

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

// ── Accounts ──────────────────────────────────────────────────────────────────

import type { McAccount } from "../types";

type AccountRow = {
  id: string;
  ms_refresh_token: string;
  mc_access_token: string;
  mc_username: string;
  mc_uuid: string;
  expires_at: number;
  added_at: number;
};

function rowToAccount(row: AccountRow): McAccount {
  return {
    id: row.id,
    msRefreshToken: row.ms_refresh_token,
    mcAccessToken: row.mc_access_token,
    mcUsername: row.mc_username,
    mcUuid: row.mc_uuid,
    expiresAt: row.expires_at,
    addedAt: row.added_at,
  };
}

export async function loadAccounts(): Promise<McAccount[]> {
  const db = await getDb();
  const rows = await db.select<AccountRow[]>(
    "SELECT * FROM accounts ORDER BY added_at ASC",
  );
  return rows.map(rowToAccount);
}

export async function upsertAccount(account: McAccount): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO accounts (id, ms_refresh_token, mc_access_token, mc_username, mc_uuid, expires_at, added_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET
       ms_refresh_token = excluded.ms_refresh_token,
       mc_access_token  = excluded.mc_access_token,
       mc_username      = excluded.mc_username,
       mc_uuid          = excluded.mc_uuid,
       expires_at       = excluded.expires_at`,
    [account.id, account.msRefreshToken, account.mcAccessToken,
     account.mcUsername, account.mcUuid, account.expiresAt, account.addedAt],
  );
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM accounts WHERE id = $1", [id]);
}

export async function getActiveAccountId(): Promise<string | null> {
  return getSetting("auth.active_account_id");
}

export async function setActiveAccountId(id: string | null): Promise<void> {
  const db = await getDb();
  if (id === null) {
    await db.execute("DELETE FROM settings WHERE key = 'auth.active_account_id'", []);
  } else {
    await setSetting("auth.active_account_id", id);
  }
}

// Migrate legacy single-account auth keys into the accounts table.
export async function migrateLegacyAuth(): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = 'auth.ms_refresh_token'",
  );
  if (rows.length === 0) return;

  const [refreshToken, accessToken, username, uuid, expiresAt] = await Promise.all([
    getSetting("auth.ms_refresh_token"),
    getSetting("auth.mc_access_token"),
    getSetting("auth.mc_username"),
    getSetting("auth.mc_uuid"),
    getSetting("auth.expires_at"),
  ]);
  if (!refreshToken || !username || !uuid) return;

  const account: McAccount = {
    id: crypto.randomUUID(),
    msRefreshToken: refreshToken,
    mcAccessToken: accessToken ?? "",
    mcUsername: username,
    mcUuid: uuid,
    expiresAt: Number(expiresAt ?? 0),
    addedAt: Math.floor(Date.now() / 1000),
  };
  await upsertAccount(account);
  await setActiveAccountId(account.id);
  await db.execute("DELETE FROM settings WHERE key LIKE 'auth.%' AND key != 'auth.active_account_id'", []);
}
