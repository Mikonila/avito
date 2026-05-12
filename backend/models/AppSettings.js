const db = require('./database');

class AppSettings {
  static async get(key) {
    const row = await db.get(`SELECT value FROM app_settings WHERE key = $1`, [key]);

    if (!row?.value) {
      return null;
    }

    try {
      return JSON.parse(row.value);
    } catch (error) {
      return null;
    }
  }

  static async set(key, value) {
    const serialized = JSON.stringify(value);

    await db.run(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, serialized]
    );

    return value;
  }
}

module.exports = AppSettings;
