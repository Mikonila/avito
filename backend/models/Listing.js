const db = require('./database');
const { v4: uuidv4 } = require('uuid');

function parseImages(images) {
  if (!images) {
    return [];
  }

  try {
    return JSON.parse(images);
  } catch (error) {
    return [];
  }
}

function withParsedImages(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    images: parseImages(row.images)
  };
}

function getNextExpiry(days = 30) {
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

class Listing {
  static async create(user_id, data) {
    const id = uuidv4();
    const { title, description, category_id, subcategory = '', city_id, price, images } = data;
    const expiresAt = getNextExpiry();

    await db.run(
      `INSERT INTO listings (id, user_id, title, description, category_id, subcategory, city_id, price, images, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)`,
      [id, user_id, title, description, category_id, subcategory, city_id, price, images || '[]', expiresAt]
    );

    return id;
  }

  static async findById(id) {
    const row = await db.get(`SELECT * FROM listings WHERE id = $1`, [id]);
    return withParsedImages(row);
  }

  static async findByUserId(user_id) {
    const rows = await db.all(
      `SELECT * FROM listings WHERE user_id = $1 ORDER BY created_at DESC`,
      [user_id]
    );

    return rows.map(withParsedImages);
  }

  static async findByCityAndCategory(city_id, category_id) {
    let query = `SELECT * FROM listings WHERE status = 'active'`;
    const params = [];

    if (city_id) {
      params.push(city_id);
      query += ` AND city_id = $${params.length}`;
    }

    if (category_id) {
      params.push(category_id);
      query += ` AND category_id = $${params.length}`;
    }

    query += ` ORDER BY
      CASE
        WHEN is_premium = TRUE AND (premium_expires_at IS NULL OR premium_expires_at > CURRENT_TIMESTAMP) THEN 0
        ELSE 1
      END,
      created_at DESC
      LIMIT 50`;

    const rows = await db.all(query, params);
    return rows.map(withParsedImages);
  }

  static async getRandomListings(limit = 20) {
    const rows = await db.all(
      `SELECT * FROM listings
       WHERE status = 'active'
       ORDER BY
         CASE
           WHEN is_premium = TRUE AND (premium_expires_at IS NULL OR premium_expires_at > CURRENT_TIMESTAMP) THEN 0
           ELSE 1
         END,
         created_at DESC
       LIMIT $1`,
      [limit]
    );

    return rows.map(withParsedImages);
  }

  static async incrementViews(id) {
    const result = await db.run(
      `UPDATE listings SET views = views + 1 WHERE id = $1`,
      [id]
    );

    return result.changes > 0;
  }

  static async delete(id, user_id) {
    const result = await db.run(
      `DELETE FROM listings WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );

    return result.changes > 0;
  }

  static async deleteAny(id) {
    const result = await db.run(
      `DELETE FROM listings WHERE id = $1`,
      [id]
    );

    return result.changes > 0;
  }

  static async update(id, user_id, data) {
    const { title, description, price, category_id, subcategory = '', city_id, images } = data;
    const result = await db.run(
      `UPDATE listings
       SET title = $1,
           description = $2,
           price = $3,
           category_id = $4,
           subcategory = $5,
           city_id = $6,
           images = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9`,
      [title, description, price, category_id, subcategory, city_id, images || '[]', id, user_id]
    );

    return result.changes > 0;
  }

  static async activatePromotion(id, days) {
    const listing = await Listing.findById(id);

    if (!listing) {
      return null;
    }

    const now = new Date();
    const currentExpiry = listing.premium_expires_at ? new Date(listing.premium_expires_at) : null;
    const startDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const nextExpiry = new Date(startDate.getTime() + (days * 24 * 60 * 60 * 1000));

    const result = await db.run(
      `UPDATE listings
       SET is_premium = $1,
           premium_expires_at = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [true, nextExpiry.toISOString(), id]
    );

    return result.changes > 0 ? nextExpiry.toISOString() : null;
  }

  static async activatePublication(id, days = 30) {
    const expiresAt = getNextExpiry(days);
    const result = await db.run(
      `UPDATE listings
       SET status = 'active',
           expires_at = $1,
           archived_notified_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [expiresAt, id]
    );

    return result.changes > 0 ? expiresAt : null;
  }

  static async findExpiredActive() {
    const rows = await db.all(
      `SELECT listings.*, users.telegram_id
       FROM listings
       JOIN users ON users.id = listings.user_id
       WHERE listings.status = 'active'
         AND listings.expires_at IS NOT NULL
         AND listings.expires_at <= CURRENT_TIMESTAMP
         AND listings.archived_notified_at IS NULL`
    );

    return rows.map(withParsedImages);
  }

  static async archive(id) {
    const result = await db.run(
      `UPDATE listings
       SET status = 'archived',
           archived_notified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    return result.changes > 0;
  }
}

module.exports = Listing;
