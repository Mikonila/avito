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
    phone TEXT,
    city TEXT DEFAULT 'Podgorica',
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
  `CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL,
    city_id TEXT NOT NULL,
    price REAL NOT NULL,
    images TEXT,
    status TEXT DEFAULT 'active',
    views INTEGER DEFAULT 0,
    is_premium BOOLEAN DEFAULT 0,
    premium_expires_at DATETIME,
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
    city_id TEXT NOT NULL,
    price REAL NOT NULL,
    images TEXT,
    status TEXT DEFAULT 'active',
    service_count INTEGER DEFAULT 0,
    max_free_services INTEGER DEFAULT 1,
    is_paid BOOLEAN DEFAULT 0,
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
  `CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_status_city_category ON listings(status, city_id, category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_services_status_city_category ON services(status, city_id, category_id)`
];

const POSTGRES_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    city TEXT DEFAULT 'Podgorica',
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
  `CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL REFERENCES categories(id),
    city_id TEXT NOT NULL REFERENCES cities(id),
    price REAL NOT NULL,
    images TEXT,
    status TEXT DEFAULT 'active',
    views INTEGER DEFAULT 0,
    is_premium BOOLEAN DEFAULT FALSE,
    premium_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL REFERENCES categories(id),
    city_id TEXT NOT NULL REFERENCES cities(id),
    price REAL NOT NULL,
    images TEXT,
    status TEXT DEFAULT 'active',
    service_count INTEGER DEFAULT 0,
    max_free_services INTEGER DEFAULT 1,
    is_paid BOOLEAN DEFAULT FALSE,
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
  `CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_listings_status_city_category ON listings(status, city_id, category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_services_status_city_category ON services(status, city_id, category_id)`
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
