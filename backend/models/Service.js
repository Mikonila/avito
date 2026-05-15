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

function getLikeCountJoin() {
  return `
    LEFT JOIN (
      SELECT item_id, COUNT(*) AS like_count
      FROM publication_likes
      WHERE item_type = 'service'
      GROUP BY item_id
    ) like_counts ON like_counts.item_id = services.id
  `;
}

function getReviewStatsJoin() {
  return `
    LEFT JOIN (
      SELECT service_id, AVG(rating) AS rating_average, COUNT(*) AS rating_count
      FROM reviews
      WHERE review_type = 'product' AND service_id IS NOT NULL
      GROUP BY service_id
    ) review_stats ON review_stats.service_id = services.id
  `;
}

function getServiceSelect() {
  return `services.*,
          COALESCE(like_counts.like_count, 0) + COALESCE(services.like_boost, 0) AS like_count,
          COALESCE(review_stats.rating_average, 0) AS rating_average,
          COALESCE(review_stats.rating_count, 0) AS rating_count`;
}

class Service {
  static async create(user_id, data) {
    const id = uuidv4();
    const {
      title,
      description,
      category_id,
      subcategory = '',
      city_id,
      price,
      price_type = '',
      images,
      is_paid = false,
      status = 'active'
    } = data;
    const expiresAt = status === 'active' ? getNextExpiry() : null;

    await db.run(
      `INSERT INTO services (id, user_id, title, description, category_id, subcategory, city_id, price, price_type, images, status, service_count, is_paid, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, $13)`,
      [id, user_id, title, description, category_id, subcategory, city_id, price, price_type, images || '[]', status, is_paid, expiresAt]
    );

    return id;
  }

  static async findByUserId(user_id) {
    const rows = await db.all(
      `SELECT ${getServiceSelect()}
       FROM services
       ${getLikeCountJoin()}
       ${getReviewStatsJoin()}
       WHERE services.user_id = $1
       ORDER BY services.created_at DESC`,
      [user_id]
    );

    return rows.map(withParsedImages);
  }

  static async findById(id) {
    const row = await db.get(
      `SELECT ${getServiceSelect()}
       FROM services
       ${getLikeCountJoin()}
       ${getReviewStatsJoin()}
       WHERE services.id = $1`,
      [id]
    );
    return withParsedImages(row);
  }

  static async findByCityAndCategory(city_id, category_id) {
    let query = `SELECT ${getServiceSelect()}
      FROM services
      ${getLikeCountJoin()}
      ${getReviewStatsJoin()}
      WHERE services.status = 'active'`;
    const params = [];

    if (city_id) {
      params.push(city_id);
      query += ` AND services.city_id = $${params.length}`;
    }

    if (category_id) {
      params.push(category_id);
      query += ` AND services.category_id = $${params.length}`;
    }

    query += ` ORDER BY
      CASE
        WHEN services.is_premium = TRUE AND (services.premium_expires_at IS NULL OR services.premium_expires_at > CURRENT_TIMESTAMP) THEN 0
        ELSE 1
      END,
      services.created_at DESC
      LIMIT 50`;

    const rows = await db.all(query, params);
    return rows.map(withParsedImages);
  }

  static async canAddService(user_id) {
    const row = await db.get(
      `SELECT COUNT(*) as count
       FROM services
       WHERE user_id = $1
         AND is_paid = $2
         AND status IN ('active', 'pending_payment')`,
      [user_id, false]
    );

    return Number(row?.count || 0) === 0;
  }

  static async delete(id, user_id) {
    const result = await db.run(
      `DELETE FROM services WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );

    return result.changes > 0;
  }

  static async deleteAny(id) {
    const result = await db.run(
      `DELETE FROM services WHERE id = $1`,
      [id]
    );

    return result.changes > 0;
  }

  static async update(id, user_id, data) {
    const { title, description, price, price_type = '', category_id, subcategory = '', city_id, images } = data;
    const result = await db.run(
      `UPDATE services
       SET title = $1,
           description = $2,
           price = $3,
           price_type = $4,
           category_id = $5,
           subcategory = $6,
           city_id = $7,
           images = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND user_id = $10`,
      [title, description, price, price_type, category_id, subcategory, city_id, images || '[]', id, user_id]
    );

    return result.changes > 0;
  }

  static async activatePromotion(id, days) {
    const service = await Service.findById(id);

    if (!service) {
      return null;
    }

    const now = new Date();
    const currentExpiry = service.premium_expires_at ? new Date(service.premium_expires_at) : null;
    const startDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const nextExpiry = new Date(startDate.getTime() + (days * 24 * 60 * 60 * 1000));

    const result = await db.run(
      `UPDATE services
       SET is_premium = $1,
           premium_expires_at = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [true, nextExpiry.toISOString(), id]
    );

    return result.changes > 0 ? nextExpiry.toISOString() : null;
  }

  static async activatePublication(id, days = 30, isPaid = true) {
    const expiresAt = getNextExpiry(days);
    const result = await db.run(
      `UPDATE services
       SET status = 'active',
           is_paid = $1,
           expires_at = $2,
           archived_notified_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [isPaid, expiresAt, id]
    );

    return result.changes > 0 ? expiresAt : null;
  }

  static async findExpiredActive() {
    const rows = await db.all(
      `SELECT services.*, users.telegram_id
       FROM services
       JOIN users ON users.id = services.user_id
       WHERE services.status = 'active'
         AND services.expires_at IS NOT NULL
         AND services.expires_at <= CURRENT_TIMESTAMP
         AND services.archived_notified_at IS NULL`
    );

    return rows.map(withParsedImages);
  }

  static async archive(id) {
    const result = await db.run(
      `UPDATE services
       SET status = 'archived',
           archived_notified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    return result.changes > 0;
  }
}

module.exports = Service;
