const Listing = require('../models/Listing');
const Review = require('../models/Review');
const User = require('../models/User');
const { getRequesterTelegramId } = require('../middleware/auth');
const { destroyImages, uploadImages } = require('../utils/cloudinary');
const { validateImages } = require('../utils/validators');

async function createReview(req, res) {
  let uploadedScreenshotUrls = [];

  try {
    const {
      user_id,
      target_user_id,
      listing_id = null,
      review_type,
      text,
      screenshot
    } = req.body;

    const requesterTelegramId = getRequesterTelegramId(req);
    if (!requesterTelegramId) {
      return res.status(401).json({ error: 'Не удалось определить пользователя Telegram' });
    }

    if (!user_id || !target_user_id || !review_type || !text) {
      return res.status(400).json({ error: 'Не заполнены обязательные поля' });
    }

    if (!['seller', 'product'].includes(review_type)) {
      return res.status(400).json({ error: 'Некорректный тип отзыва' });
    }

    if (user_id === target_user_id) {
      return res.status(400).json({ error: 'Нельзя оставить отзыв самому себе' });
    }

    const requester = await User.findByTelegramId(requesterTelegramId);
    if (!requester) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    if (requester.id !== user_id) {
      return res.status(403).json({ error: 'Нельзя отправить отзыв от имени другого пользователя' });
    }

    const targetUser = await User.findById(target_user_id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Продавец не найден' });
    }

    if (listing_id) {
      const listing = await Listing.findById(listing_id);
      if (!listing) {
        return res.status(404).json({ error: 'Товар не найден' });
      }

      if (listing.user_id !== target_user_id) {
        return res.status(400).json({ error: 'Этот товар не принадлежит выбранному продавцу' });
      }
    }

    const screenshotValidation = validateImages(screenshot ? [screenshot] : []);
    if (!screenshotValidation.isValid || screenshotValidation.images.length !== 1) {
      return res.status(400).json({ error: 'Нужно прикрепить один скриншот переписки' });
    }

    uploadedScreenshotUrls = await uploadImages(screenshotValidation.images, 'review');

    const reviewId = await Review.create({
      target_user_id,
      author_user_id: user_id,
      listing_id,
      review_type,
      text: String(text).trim(),
      screenshot_url: uploadedScreenshotUrls[0]
    });

    res.json({ success: true, review_id: reviewId });
  } catch (error) {
    console.error('Error creating review:', error);
    if (uploadedScreenshotUrls.length) {
      await destroyImages(uploadedScreenshotUrls);
    }
    res.status(500).json({ error: 'Не удалось отправить отзыв' });
  }
}

async function deleteReview(req, res) {
  try {
    const { review_id } = req.params;
    const review = await Review.findById(review_id);

    if (!review) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    const deleted = await Review.delete(review_id);

    if (deleted && review.screenshot_url) {
      await destroyImages([review.screenshot_url]);
    }

    res.json({ success: deleted });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Не удалось удалить отзыв' });
  }
}

module.exports = {
  createReview,
  deleteReview
};
