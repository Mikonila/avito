const Listing = require('../models/Listing');
const Review = require('../models/Review');
const Service = require('../models/Service');
const User = require('../models/User');
const { getRequesterTelegramId, isAdminTelegramId } = require('../middleware/auth');
const { getTelegramBot } = require('../telegramBot');
const { destroyImages, uploadImages } = require('../utils/cloudinary');
const { validateImages } = require('../utils/validators');

function getReviewMediaValidationOptions(req) {
  const isAdmin = isAdminTelegramId(getRequesterTelegramId(req));

  return {
    maxImageSizeMb: isAdmin ? 4 : 2
  };
}

async function notifySellerAboutReview(targetUser, publicationTitle = '') {
  const bot = getTelegramBot();

  if (!bot || !targetUser?.telegram_id) {
    return;
  }

  const lines = [
    'Вам оставили новый отзыв.'
  ];

  if (publicationTitle) {
    lines.push(`Объявление: ${publicationTitle}`);
  }

  lines.push('', 'Откройте приложение, чтобы посмотреть отзыв.');

  try {
    await bot.sendMessage(targetUser.telegram_id, lines.join('\n'));
  } catch (error) {
    console.error('Error notifying seller about review:', error.message);
  }
}

async function createReview(req, res) {
  let uploadedScreenshotUrls = [];
  let uploadedReviewImageUrls = [];

  try {
    const {
      user_id,
      target_user_id,
      listing_id = null,
      service_id = null,
      review_type,
      rating = 5,
      text,
      screenshot,
      images = []
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

    const normalizedRating = Number(rating);
    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ error: 'Выберите оценку от 1 до 5' });
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

    if (listing_id && service_id) {
      return res.status(400).json({ error: 'Отзыв можно привязать только к одной публикации' });
    }

    let publicationTitle = '';

    if (listing_id) {
      const listing = await Listing.findById(listing_id);
      if (!listing) {
        return res.status(404).json({ error: 'Товар не найден' });
      }

      if (listing.user_id !== target_user_id) {
        return res.status(400).json({ error: 'Этот товар не принадлежит выбранному продавцу' });
      }

      publicationTitle = listing.title || '';
    }

    if (service_id) {
      const service = await Service.findById(service_id);
      if (!service) {
        return res.status(404).json({ error: 'Услуга не найдена' });
      }

      if (service.user_id !== target_user_id) {
        return res.status(400).json({ error: 'Эта услуга не принадлежит выбранному продавцу' });
      }

      publicationTitle = service.title || '';
    }

    const screenshotValidation = validateImages(screenshot ? [screenshot] : [], getReviewMediaValidationOptions(req));
    if (!screenshotValidation.isValid || screenshotValidation.images.length !== 1) {
      return res.status(400).json({ error: 'Нужно прикрепить один скриншот переписки' });
    }

    let reviewImagesToUpload = [];

    if (Array.isArray(images) && images.length) {
      const imagesValidation = validateImages(images, getReviewMediaValidationOptions(req));
      if (!imagesValidation.isValid || imagesValidation.images.length > 5) {
        return res.status(400).json({ error: 'Можно добавить до 5 корректных фотографий к отзыву' });
      }

      reviewImagesToUpload = imagesValidation.images;
    }

    uploadedScreenshotUrls = await uploadImages(screenshotValidation.images, 'review');
    uploadedReviewImageUrls = reviewImagesToUpload.length
      ? await uploadImages(reviewImagesToUpload, 'review')
      : [];

    const reviewId = await Review.create({
      target_user_id,
      author_user_id: user_id,
      listing_id,
      service_id,
      review_type,
      rating: normalizedRating,
      text: String(text).trim(),
      screenshot_url: uploadedScreenshotUrls[0],
      review_images: JSON.stringify(uploadedReviewImageUrls)
    });

    await notifySellerAboutReview(targetUser, publicationTitle);

    res.json({ success: true, review_id: reviewId });
  } catch (error) {
    console.error('Error creating review:', error);
    if (uploadedScreenshotUrls.length || uploadedReviewImageUrls.length) {
      await destroyImages([...uploadedScreenshotUrls, ...uploadedReviewImageUrls]);
    }
    res.status(500).json({ error: 'Не удалось отправить отзыв' });
  }
}

async function createAdminSeededReview(req, res) {
  let uploadedAvatarUrls = [];

  try {
    const {
      target_user_id,
      listing_id = null,
      service_id = null,
      review_type = 'product',
      rating = 5,
      text,
      author_name,
      avatar
    } = req.body;
    const requesterTelegramId = getRequesterTelegramId(req);

    if (!requesterTelegramId || !isAdminTelegramId(requesterTelegramId)) {
      return res.status(403).json({ error: 'Доступно только администратору' });
    }

    const admin = await User.findByTelegramId(requesterTelegramId);
    if (!admin) {
      return res.status(401).json({ error: 'Администратор не найден' });
    }

    if (!target_user_id || !text || !author_name) {
      return res.status(400).json({ error: 'Введите имя автора и текст отзыва' });
    }

    if (!['seller', 'product'].includes(review_type)) {
      return res.status(400).json({ error: 'Некорректный тип отзыва' });
    }

    const normalizedRating = Number(rating);
    if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ error: 'Выберите оценку от 1 до 5' });
    }

    if (listing_id && service_id) {
      return res.status(400).json({ error: 'Отзыв можно привязать только к одной публикации' });
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

    if (service_id) {
      const service = await Service.findById(service_id);
      if (!service) {
        return res.status(404).json({ error: 'Услуга не найдена' });
      }

      if (service.user_id !== target_user_id) {
        return res.status(400).json({ error: 'Эта услуга не принадлежит выбранному продавцу' });
      }
    }

    if (avatar) {
      const avatarValidation = validateImages([avatar], getReviewMediaValidationOptions(req));
      if (!avatarValidation.isValid || avatarValidation.images.length !== 1) {
        return res.status(400).json({ error: 'Загрузите корректную фотографию аватарки' });
      }

      uploadedAvatarUrls = await uploadImages(avatarValidation.images, 'review');
    }

    const reviewId = await Review.create({
      target_user_id,
      author_user_id: admin.id,
      listing_id,
      service_id,
      review_type,
      rating: normalizedRating,
      text: String(text).trim(),
      screenshot_url: '',
      display_author_name: String(author_name).trim(),
      display_author_avatar_url: uploadedAvatarUrls[0] || '',
      is_admin_seeded: true
    });

    res.json({ success: true, review_id: reviewId });
  } catch (error) {
    console.error('Error creating admin seeded review:', error);
    if (uploadedAvatarUrls.length) {
      await destroyImages(uploadedAvatarUrls);
    }
    res.status(500).json({ error: 'Не удалось добавить отзыв' });
  }
}

async function deleteReview(req, res) {
  try {
    const { review_id } = req.params;
    const requesterTelegramId = getRequesterTelegramId(req);

    if (!requesterTelegramId) {
      return res.status(401).json({ error: 'Не удалось определить пользователя Telegram' });
    }

    const review = await Review.findById(review_id);

    if (!review) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    const requester = await User.findByTelegramId(requesterTelegramId);
    const isAdmin = isAdminTelegramId(requesterTelegramId);

    if (!isAdmin && (!requester || requester.id !== review.author_user_id)) {
      return res.status(403).json({ error: 'Удалить отзыв может только его автор или администратор' });
    }

    const deleted = await Review.delete(review_id);

    if (deleted) {
      const reviewImages = (() => {
        try {
          return JSON.parse(review.review_images || '[]');
        } catch (error) {
          return [];
        }
      })();
      await destroyImages([review.screenshot_url, review.display_author_avatar_url, ...reviewImages].filter(Boolean));
    }

    res.json({ success: deleted });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Не удалось удалить отзыв' });
  }
}

module.exports = {
  createReview,
  createAdminSeededReview,
  deleteReview
};
