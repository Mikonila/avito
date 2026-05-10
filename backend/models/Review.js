const db = require('./database');
const { v4: uuidv4 } = require('uuid');

class Review {
  static async create(data) {
    const id = uuidv4();
    const {
      target_user_id,
      author_user_id,
      listing_id,
      review_type,
      text,
      screenshot_url
    } = data;

    await db.run(
      `INSERT INTO reviews (id, target_user_id, author_user_id, listing_id, review_type, text, screenshot_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, target_user_id, author_user_id, listing_id || null, review_type, text, screenshot_url]
    );

    return id;
  }

  static findById(id) {
    return db.get(`SELECT * FROM reviews WHERE id = $1`, [id]);
  }

  static async findByTargetUserId(target_user_id, options = {}) {
    const includeAdminFields = options.includeAdminFields === true;

    const rows = await db.all(
      `SELECT
         reviews.id,
         reviews.target_user_id,
         reviews.author_user_id,
         reviews.listing_id,
         reviews.review_type,
         reviews.text,
         reviews.created_at,
         reviews.screenshot_url,
         listings.title AS listing_title,
         author.first_name AS author_first_name,
         author.last_name AS author_last_name,
         author.username AS author_username
       FROM reviews
       LEFT JOIN listings ON listings.id = reviews.listing_id
       LEFT JOIN users AS author ON author.id = reviews.author_user_id
       WHERE reviews.target_user_id = $1
       ORDER BY reviews.created_at DESC`,
      [target_user_id]
    );

    return rows.map((review) => {
      const authorName =
        [review.author_first_name, review.author_last_name].filter(Boolean).join(' ').trim() ||
        review.author_username ||
        'Пользователь';

      return {
        id: review.id,
        target_user_id: review.target_user_id,
        author_user_id: review.author_user_id,
        listing_id: review.listing_id,
        listing_title: review.listing_title || null,
        review_type: review.review_type,
        text: review.text,
        created_at: review.created_at,
        author_name: authorName,
        screenshot_url: includeAdminFields ? review.screenshot_url : undefined
      };
    });
  }

  static async delete(id) {
    const result = await db.run(`DELETE FROM reviews WHERE id = $1`, [id]);
    return result.changes > 0;
  }
}

module.exports = Review;
