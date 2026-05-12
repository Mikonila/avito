const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SQLITE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    city TEXT DEFAULT '',
    about TEXT,
    is_banned BOOLEAN DEFAULT 0,
    banned_at DATETIME,
    ban_reason TEXT,
    balance REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS cities (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL,
    subcategory TEXT,
    city_id TEXT NOT NULL,
    price REAL NOT NULL,
    images TEXT,
    status TEXT DEFAULT 'active',
    views INTEGER DEFAULT 0,
    is_premium BOOLEAN DEFAULT 0,
    premium_expires_at DATETIME,
    expires_at DATETIME,
    archived_notified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(category_id) REFERENCES categories(id),
    FOREIGN KEY(city_id) REFERENCES cities(id)
  )`,
  `CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL,
    subcategory TEXT,
    city_id TEXT NOT NULL,
    price REAL NOT NULL,
    images TEXT,
    status TEXT DEFAULT 'active',
    service_count INTEGER DEFAULT 0,
    max_free_services INTEGER DEFAULT 1,
    is_paid BOOLEAN DEFAULT 0,
    is_premium BOOLEAN DEFAULT 0,
    premium_expires_at DATETIME,
    expires_at DATETIME,
    archived_notified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(category_id) REFERENCES categories(id),
    FOREIGN KEY(city_id) REFERENCES cities(id)
  )`,
  `CREATE TABLE IF NOT EXISTS premium_ads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    redirect_url TEXT,
    price REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    expires_at DATETIME NOT NULL,
    views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    reference_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    target_user_id TEXT NOT NULL,
    author_user_id TEXT NOT NULL,
    listing_id TEXT,
    service_id TEXT,
    review_type TEXT NOT NULL,
    text TEXT NOT NULL,
    screenshot_url TEXT NOT NULL,
    display_author_name TEXT,
    display_author_avatar_url TEXT,
    is_admin_seeded BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(target_user_id) REFERENCES users(id),
    FOREIGN KEY(author_user_id) REFERENCES users(id),
    FOREIGN KEY(listing_id) REFERENCES listings(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_status_city_category ON listings(status, city_id, category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_services_status_city_category ON services(status, city_id, category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_target_user_id ON reviews(target_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_listing_id ON reviews(listing_id)`
];

const POSTGRES_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    city TEXT DEFAULT '',
    about TEXT,
    is_banned BOOLEAN DEFAULT FALSE,
    banned_at TIMESTAMPTZ,
    ban_reason TEXT,
    balance REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS cities (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL REFERENCES categories(id),
    subcategory TEXT,
    city_id TEXT NOT NULL REFERENCES cities(id),
    price REAL NOT NULL,
    images TEXT,
    status TEXT DEFAULT 'active',
    views INTEGER DEFAULT 0,
    is_premium BOOLEAN DEFAULT FALSE,
    premium_expires_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    archived_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL REFERENCES categories(id),
    subcategory TEXT,
    city_id TEXT NOT NULL REFERENCES cities(id),
    price REAL NOT NULL,
    images TEXT,
    status TEXT DEFAULT 'active',
    service_count INTEGER DEFAULT 0,
    max_free_services INTEGER DEFAULT 1,
    is_paid BOOLEAN DEFAULT FALSE,
    is_premium BOOLEAN DEFAULT FALSE,
    premium_expires_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    archived_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS premium_ads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    redirect_url TEXT,
    price REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    reference_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
    service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
    review_type TEXT NOT NULL,
    text TEXT NOT NULL,
    screenshot_url TEXT NOT NULL,
    display_author_name TEXT,
    display_author_avatar_url TEXT,
    is_admin_seeded BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_status_city_category ON listings(status, city_id, category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_services_status_city_category ON services(status, city_id, category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_target_user_id ON reviews(target_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_listing_id ON reviews(listing_id)`
];

let dialect = null;
let pgPool = null;
let sqliteDb = null;
let readyPromise = null;
let sqlite3 = null;

function isPostgresUrl(value) {
  return typeof value === 'string' && /^(postgres|postgresql):\/\//.test(value);
}

function isPlaceholderPostgresUrl(value) {
  if (!isPostgresUrl(value)) {
    return false;
  }

  try {
    const parsedUrl = new URL(value);
    return (
      parsedUrl.hostname === 'host' ||
      parsedUrl.username === 'user' ||
      parsedUrl.password === 'password' ||
      parsedUrl.pathname === '/dbname'
    );
  } catch (error) {
    return false;
  }
}

function resolveSqlitePath() {
  const configuredPath =
    process.env.DATABASE_URL && !isPostgresUrl(process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : path.join('data', 'marketplace.db');

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

function convertSqlForSqlite(sql) {
  return sql.replace(/\$\d+/g, '?');
}

function openSqliteDatabase(filename) {
  return new Promise((resolve, reject) => {
    if (!sqlite3) {
      sqlite3 = require('sqlite3').verbose();
    }

    const dir = path.dirname(filename);
    fs.mkdirSync(dir, { recursive: true });

    const db = new sqlite3.Database(filename, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(db);
    });
  });
}

function sqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.run(convertSqlForSqlite(sql), params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        changes: this.changes || 0,
        lastID: this.lastID || null
      });
    });
  });
}

function sqliteGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.get(convertSqlForSqlite(sql), params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });
}

function sqliteAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqliteDb.all(convertSqlForSqlite(sql), params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows || []);
    });
  });
}

async function applySchema(statements) {
  for (const statement of statements) {
    if (dialect === 'postgres') {
      await pgPool.query(statement);
    } else {
      await sqliteRun(statement);
    }
  }
}

async function ensureColumn(tableName, columnName, definition) {
  if (dialect === 'postgres') {
    await pgPool.query(
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${definition}`
    );
    return;
  }

  const columns = await sqliteAll(`PRAGMA table_info(${tableName})`);
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    await sqliteRun(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function applyMigrations() {
  await applySchema(dialect === 'postgres' ? [POSTGRES_SCHEMA[3]] : [SQLITE_SCHEMA[3]]);
  await ensureColumn('users', 'about', 'TEXT');
  await ensureColumn('users', 'avatar_url', 'TEXT');
  await ensureColumn('users', 'is_banned', 'BOOLEAN DEFAULT FALSE');
  await ensureColumn('users', 'banned_at', 'TIMESTAMPTZ');
  await ensureColumn('users', 'ban_reason', 'TEXT');
  await ensureColumn('listings', 'subcategory', 'TEXT');
  await ensureColumn('services', 'subcategory', 'TEXT');
  await ensureColumn('services', 'is_premium', 'BOOLEAN DEFAULT FALSE');
  await ensureColumn('services', 'premium_expires_at', 'TIMESTAMPTZ');
  await ensureColumn('listings', 'expires_at', 'TIMESTAMPTZ');
  await ensureColumn('listings', 'archived_notified_at', 'TIMESTAMPTZ');
  await ensureColumn('services', 'expires_at', 'TIMESTAMPTZ');
  await ensureColumn('services', 'archived_notified_at', 'TIMESTAMPTZ');
  await ensureColumn('reviews', 'service_id', 'TEXT');
  await ensureColumn('reviews', 'display_author_name', 'TEXT');
  await ensureColumn('reviews', 'display_author_avatar_url', 'TEXT');
  await ensureColumn('reviews', 'is_admin_seeded', 'BOOLEAN DEFAULT FALSE');

  if (dialect === 'postgres') {
    await pgPool.query(`UPDATE listings SET expires_at = created_at + INTERVAL '30 days' WHERE expires_at IS NULL`);
    await pgPool.query(`UPDATE services SET expires_at = created_at + INTERVAL '30 days' WHERE expires_at IS NULL AND status = 'active'`);
  } else {
    await sqliteRun(`UPDATE listings SET expires_at = datetime(created_at, '+30 days') WHERE expires_at IS NULL`);
    await sqliteRun(`UPDATE services SET expires_at = datetime(created_at, '+30 days') WHERE expires_at IS NULL AND status = 'active'`);
  }
}

async function initializeDatabase() {
  if (readyPromise) {
    return readyPromise;
  }

  readyPromise = (async () => {
    if (isPostgresUrl(process.env.DATABASE_URL)) {
      if (isPlaceholderPostgresUrl(process.env.DATABASE_URL)) {
        throw new Error(
          'DATABASE_URL is still a template value. In Railway Variables, replace postgresql://user:password@host:5432/dbname with the real DATABASE_URL from your Railway PostgreSQL service.'
        );
      }

      dialect = 'postgres';
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: parseInt(process.env.DB_POOL_MAX || '5', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
      });

      await pgPool.query('SELECT 1');
      await applySchema(POSTGRES_SCHEMA);
    } else {
      dialect = 'sqlite';
      sqliteDb = await openSqliteDatabase(resolveSqlitePath());
      await sqliteRun('PRAGMA foreign_keys = ON');
      await applySchema(SQLITE_SCHEMA);
    }

    await applyMigrations();

    console.log(`Database initialized using ${dialect}`);
  })().catch((error) => {
    readyPromise = null;
    throw error;
  });

  return readyPromise;
}

async function run(sql, params = []) {
  await initializeDatabase();

  if (dialect === 'postgres') {
    const result = await pgPool.query(sql, params);
    return { changes: result.rowCount || 0, rows: result.rows || [] };
  }

  return sqliteRun(sql, params);
}

async function get(sql, params = []) {
  await initializeDatabase();

  if (dialect === 'postgres') {
    const result = await pgPool.query(sql, params);
    return result.rows[0] || null;
  }

  return sqliteGet(sql, params);
}

async function all(sql, params = []) {
  await initializeDatabase();

  if (dialect === 'postgres') {
    const result = await pgPool.query(sql, params);
    return result.rows || [];
  }

  return sqliteAll(sql, params);
}

async function healthCheck() {
  try {
    await get('SELECT 1 AS ok');
    return { ok: true, dialect };
  } catch (error) {
    return {
      ok: false,
      dialect,
      error: error.message
    };
  }
}

async function close() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }

  if (sqliteDb) {
    await new Promise((resolve, reject) => {
      sqliteDb.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    sqliteDb = null;
  }

  readyPromise = null;
}

function getDialect() {
  return dialect;
}

module.exports = {
  all,
  close,
  get,
  getDialect,
  healthCheck,
  initializeDatabase,
  isPostgresUrl,
  run
};
