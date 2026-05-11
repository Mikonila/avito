const db = require('./database');
const { v4: uuidv4 } = require('uuid');

class User {
  static async create(telegram_id, userData) {
    const id = uuidv4();
    const { first_name = '', last_name = '', username = '', avatar_url = '', phone = '', city = '', about = '' } = userData;

    await db.run(
      `INSERT INTO users (id, telegram_id, first_name, last_name, username, avatar_url, phone, city, about)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, telegram_id, first_name, last_name, username, avatar_url, phone, city, about]
    );

    return { id, telegram_id, first_name, last_name, username, avatar_url, phone, city, about };
  }

  static findByTelegramId(telegram_id) {
    return db.get(`SELECT * FROM users WHERE telegram_id = $1`, [telegram_id]);
  }

  static findById(id) {
    return db.get(`SELECT * FROM users WHERE id = $1`, [id]);
  }

  static async fillMissingFromTelegram(user_id, userData) {
    const currentUser = await User.findById(user_id);
    if (!currentUser) {
      return null;
    }

    const nextUser = {
      first_name: currentUser.first_name || userData.first_name || '',
      last_name: currentUser.last_name || userData.last_name || '',
      username: currentUser.username || userData.username || '',
      avatar_url: userData.avatar_url || currentUser.avatar_url || '',
      phone: currentUser.phone || '',
      city: currentUser.city || '',
      about: currentUser.about || ''
    };

    await db.run(
      `UPDATE users
       SET first_name = $1,
           last_name = $2,
           username = $3,
           avatar_url = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [nextUser.first_name, nextUser.last_name, nextUser.username, nextUser.avatar_url, user_id]
    );

    return User.findById(user_id);
  }

  static async updateProfile(user_id, profileData) {
    const {
      first_name = '',
      last_name = '',
      username = '',
      phone = '',
      city = '',
      about = ''
    } = profileData;

    const result = await db.run(
      `UPDATE users
       SET first_name = $1,
           last_name = $2,
           username = $3,
           phone = $4,
           city = $5,
           about = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [first_name, last_name, username, phone, city, about, user_id]
    );

    return result.changes > 0;
  }

  static async ban(user_id, reason = '') {
    const result = await db.run(
      `UPDATE users
       SET is_banned = $1,
           banned_at = CURRENT_TIMESTAMP,
           ban_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [true, reason, user_id]
    );

    return result.changes > 0;
  }
}

module.exports = User;
