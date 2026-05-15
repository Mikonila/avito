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

function getTableName(itemType) {
  if (itemType === 'listing') {
    return 'listings';
  }

  if (itemType === 'service') {
    return 'services';
  }

  return '';
}

function withParsedPublication(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    images: parseImages(row.images),
    like_count: Number(row.like_count || 0)
  };
}

async function getLikeCount(itemType, itemId) {
  const likesRow = await db.get(
    `SELECT COUNT(*) AS count
     FROM publication_likes
     WHERE item_type = $1 AND item_id = $2`,
    [itemType, itemId]
  );
  const tableName = getTableName(itemType);
  const boostRow = tableName
    ? await db.get(`SELECT COALESCE(like_boost, 0) AS like_boost FROM ${tableName} WHERE id = $1`, [itemId])
    : null;

  return Number(likesRow?.count || 0) + Number(boostRow?.like_boost || 0);
}

class PublicationLike {
  static async toggle(userId, itemType, itemId) {
    const tableName = getTableName(itemType);

    if (!userId || !tableName || !itemId) {
      return null;
    }

    const publication = await db.get(`SELECT id FROM ${tableName} WHERE id = $1`, [itemId]);
    if (!publication) {
      return null;
    }

    const existing = await db.get(
      `SELECT id
       FROM publication_likes
       WHERE user_id = $1 AND item_type = $2 AND item_id = $3`,
      [userId, itemType, itemId]
    );

    if (existing) {
      await db.run(`DELETE FROM publication_likes WHERE id = $1`, [existing.id]);
      return {
        liked: false,
        like_count: await getLikeCount(itemType, itemId)
      };
    }

    await db.run(
      `INSERT INTO publication_likes (id, user_id, item_type, item_id)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), userId, itemType, itemId]
    );

    return {
      liked: true,
      like_count: await getLikeCount(itemType, itemId)
    };
  }

  static async findByUserId(userId) {
    const listingRows = await db.all(
      `SELECT listings.*,
              likes.created_at AS liked_at,
              'listing' AS item_type,
              COALESCE(like_counts.like_count, 0) + COALESCE(listings.like_boost, 0) AS like_count
       FROM publication_likes likes
       JOIN listings ON listings.id = likes.item_id
       LEFT JOIN (
         SELECT item_id, COUNT(*) AS like_count
         FROM publication_likes
         WHERE item_type = 'listing'
         GROUP BY item_id
       ) like_counts ON like_counts.item_id = listings.id
       WHERE likes.user_id = $1
         AND likes.item_type = 'listing'
         AND listings.status = 'active'`,
      [userId]
    );

    const serviceRows = await db.all(
      `SELECT services.*,
              likes.created_at AS liked_at,
              'service' AS item_type,
              COALESCE(like_counts.like_count, 0) + COALESCE(services.like_boost, 0) AS like_count
       FROM publication_likes likes
       JOIN services ON services.id = likes.item_id
       LEFT JOIN (
         SELECT item_id, COUNT(*) AS like_count
         FROM publication_likes
         WHERE item_type = 'service'
         GROUP BY item_id
       ) like_counts ON like_counts.item_id = services.id
       WHERE likes.user_id = $1
         AND likes.item_type = 'service'
         AND services.status = 'active'`,
      [userId]
    );

    return [...listingRows, ...serviceRows]
      .map(withParsedPublication)
      .sort((a, b) => new Date(b.liked_at || 0) - new Date(a.liked_at || 0));
  }

  static async boost(itemType, itemId, amount) {
    const tableName = getTableName(itemType);
    const normalizedAmount = Number(amount);

    if (!tableName || !itemId || !Number.isInteger(normalizedAmount) || normalizedAmount < 1) {
      return null;
    }

    const result = await db.run(
      `UPDATE ${tableName}
       SET like_boost = COALESCE(like_boost, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [normalizedAmount, itemId]
    );

    if (!result.changes) {
      return null;
    }

    return {
      like_count: await getLikeCount(itemType, itemId)
    };
  }
}

module.exports = PublicationLike;
