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
      WHERE item_type = 'listing'
      GROUP BY item_id
    ) like_counts ON like_counts.item_id = listings.id
  `;
}

function getReviewStatsJoin() {
  return `
    LEFT JOIN (
      SELECT listing_id, AVG(rating) AS rating_average, COUNT(*) AS rating_count
      FROM reviews
      WHERE review_type = 'product' AND listing_id IS NOT NULL
      GROUP BY listing_id
    ) review_stats ON review_stats.listing_id = listings.id
  `;
}

function getListingSelect() {
  return `listings.*,
          COALESCE(like_counts.like_count, 0) + COALESCE(listings.like_boost, 0) AS like_count,
          COALESCE(review_stats.rating_average, 0) AS rating_average,
          COALESCE(review_stats.rating_count, 0) AS rating_count`;
}

function getListingSortExpression() {
  return `COALESCE(listings.reactivated_at, listings.created_at)`;
}

class Listing {
  static async create(user_id, data) {
    const id = uuidv4();
    const { title, description, category_id, subcategory = '', city_id, price, price_type = '', images } = data;
    const expiresAt = getNextExpiry();

    await db.run(
      `INSERT INTO listings (id, user_id, title, description, category_id, subcategory, city_id, price, price_type, images, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)`,
      [id, user_id, title, description, category_id, subcategory, city_id, price, price_type, images || '[]', expiresAt]
    );

    return id;
  }

  static async findById(id) {
    const row = await db.get(
      `SELECT ${getListingSelect()}
       FROM listings
       ${getLikeCountJoin()}
       ${getReviewStatsJoin()}
       WHERE listings.id = $1`,
      [id]
    );
    return withParsedImages(row);
  }

  static async findByUserId(user_id) {
    const rows = await db.all(
      `SELECT ${getListingSelect()}
       FROM listings
       ${getLikeCountJoin()}
       ${getReviewStatsJoin()}
       WHERE listings.user_id = $1
       ORDER BY ${getListingSortExpression()} DESC`,
      [user_id]
    );

    return rows.map(withParsedImages);
  }

  static async findByCityAndCategory(city_id, category_id) {
    let query = `SELECT ${getListingSelect()}
      FROM listings
      ${getLikeCountJoin()}
      ${getReviewStatsJoin()}
      WHERE listings.status = 'active'`;
    const params = [];

    if (city_id) {
      params.push(city_id);
      query += ` AND listings.city_id = $${params.length}`;
    }

    if (category_id) {
      params.push(category_id);
      query += ` AND listings.category_id = $${params.length}`;
    }

    query += ` ORDER BY
      CASE
        WHEN listings.is_premium = TRUE AND (listings.premium_expires_at IS NULL OR listings.premium_expires_at > CURRENT_TIMESTAMP) THEN 0
        ELSE 1
      END,
      ${getListingSortExpression()} DESC
      LIMIT 50`;

    const rows = await db.all(query, params);
    return rows.map(withParsedImages);
  }

  static async getRandomListings(limit = 20) {
    const rows = await db.all(
      `SELECT ${getListingSelect()}
       FROM listings
       ${getLikeCountJoin()}
       ${getReviewStatsJoin()}
       WHERE listings.status = 'active'
       ORDER BY
         CASE
           WHEN listings.is_premium = TRUE AND (listings.premium_expires_at IS NULL OR listings.premium_expires_at > CURRENT_TIMESTAMP) THEN 0
           ELSE 1
         END,
         ${getListingSortExpression()} DESC
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
    const { title, description, price, price_type = '', category_id, subcategory = '', city_id, images } = data;
    const result = await db.run(
      `UPDATE listings
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

  static async updateById(id, data) {
    const { title, description, price, price_type = '', category_id, subcategory = '', city_id, images } = data;
    const result = await db.run(
      `UPDATE listings
       SET title = $1,
           description = $2,
           price = $3,
           price_type = $4,
           category_id = $5,
           subcategory = $6,
           city_id = $7,
           images = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9`,
      [title, description, price, price_type, category_id, subcategory, city_id, images || '[]', id]
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
           reactivated_at = CURRENT_TIMESTAMP,
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
