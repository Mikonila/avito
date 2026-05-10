const db = require('./database');
const { v4: uuidv4 } = require('uuid');

class User {
  static async create(telegram_id, userData) {
    const id = uuidv4();
    const { first_name, last_name, username } = userData;
    const city = 'Podgorica';

    await db.run(
      `INSERT INTO users (id, telegram_id, first_name, last_name, username, city)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, telegram_id, first_name, last_name, username, city]
    );

    return { id, telegram_id, first_name, last_name, username, city };
  }

  static findByTelegramId(telegram_id) {
    return db.get(`SELECT * FROM users WHERE telegram_id = $1`, [telegram_id]);
  }

  static findById(id) {
    return db.get(`SELECT * FROM users WHERE id = $1`, [id]);
  }

  static async updateCity(user_id, city) {
    const result = await db.run(
      `UPDATE users SET city = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [city, user_id]
    );

    return result.changes > 0;
  }

  static async updatePhone(user_id, phone) {
    const result = await db.run(
      `UPDATE users SET phone = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [phone, user_id]
    );

    return result.changes > 0;
  }
}

module.exports = User;
