const Listing = require('../models/Listing');
const User = require('../models/User');
const { validateImages } = require('../utils/validators');
const { getRequesterTelegramId, isAdminTelegramId } = require('../middleware/auth');
const { getTelegramBot, PROMOTION_PLANS } = require('../telegramBot');
const { destroyImages, uploadImages } = require('../utils/cloudinary');
const {
  BAN_REASON,
  ensureUserCanPublish,
  findForbiddenWord,
  notifyForbiddenPublication,
  notifyUserAboutBan,
  requireAdminUser
} = require('../utils/moderation');

function getMediaValidationOptions(req) {
  const isAdmin = isAdminTelegramId(getRequesterTelegramId(req));

  return {
    maxImages: isAdmin ? 10 : 6,
    maxImageSizeMb: isAdmin ? 4 : 2,
    maxVideoSizeMb: isAdmin ? 30 : 15,
    maxTotalMediaSizeMb: isAdmin ? 45 : 25
  };
}

function normalizePriceType(value) {
  return ['from', 'to', 'request'].includes(value) ? value : '';
}

function normalizePriceValue(price, priceType) {
  if (priceType === 'request' && (price === undefined || price === null || price === '')) {
    return 0;
  }

  const normalizedPrice = Number(price);
  return Number.isFinite(normalizedPrice) && normalizedPrice >= 0 ? normalizedPrice : null;
}

function shouldIncrementViews(req, ownerUserId) {
  const rawValue = String(req.query.increment_view ?? 'true').trim().toLowerCase();
  const incrementRequested = !['0', 'false', 'no'].includes(rawValue);
  const viewerUserId = String(req.headers['x-user-id'] || req.query.viewer_user_id || '').trim();

  return incrementRequested && viewerUserId !== String(ownerUserId || '').trim();
}

async function createListing(req, res) {
  let newlyUploadedImages = [];

  try {
    const { user_id, title, description, category_id, subcategory = '', city_id, price, price_type = '', images } = req.body;

    if (!user_id || !title || !category_id || !city_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedPriceType = normalizePriceType(price_type);
    const normalizedPrice = normalizePriceValue(price, normalizedPriceType);
    if (normalizedPrice === null) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    const author = await ensureUserCanPublish(user_id, res);
    if (!author) {
      return;
    }

    const forbiddenWord = await findForbiddenWord(title, description, subcategory);
    if (forbiddenWord) {
      await notifyForbiddenPublication(author, title, forbiddenWord, 'объявление');
      return res.status(422).json({ error: `Объявление не опубликовано: нельзя использовать «${forbiddenWord}»` });
    }

    const imageValidation = validateImages(images, getMediaValidationOptions(req));
    if (!imageValidation.isValid) {
      return res.status(400).json({ error: imageValidation.errors.join('. ') });
    }

    const uploadedImages = await uploadImages(imageValidation.images, 'listing');
    newlyUploadedImages = uploadedImages.filter((imageUrl) => !imageValidation.images.includes(imageUrl));

    const id = await Listing.create(user_id, {
      title,
      description,
      category_id,
      subcategory,
      city_id,
      price: normalizedPrice,
      price_type: normalizedPriceType,
      images: JSON.stringify(uploadedImages)
    });

    res.json({ success: true, listing_id: id });
  } catch (error) {
    console.error('Error creating listing:', error);
    if (newlyUploadedImages.length) {
      await destroyImages(newlyUploadedImages);
    }
    res.status(500).json({ error: 'Failed to create listing' });
  }
}

async function getListingsByUser(req, res) {
  try {
    const { user_id } = req.params;
    const listings = await Listing.findByUserId(user_id);
    res.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
}

async function getListingDetails(req, res) {
  try {
    const { listing_id } = req.params;
    let listing = await Listing.findById(listing_id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (shouldIncrementViews(req, listing.user_id)) {
      await Listing.incrementViews(listing_id);
      listing = await Listing.findById(listing_id);
    }

    res.json(listing);
  } catch (error) {
    console.error('Error fetching listing:', error);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
}

async function searchListings(req, res) {
  try {
    const { city_id, category_id } = req.query;
    const listings = await Listing.findByCityAndCategory(city_id, category_id);
    res.json(listings);
  } catch (error) {
    console.error('Error searching listings:', error);
    res.status(500).json({ error: 'Failed to search listings' });
  }
}

async function getRandomListings(req, res) {
  try {
    const { limit = 20 } = req.query;
    const listings = await Listing.getRandomListings(parseInt(limit));
    res.json(listings);
  } catch (error) {
    console.error('Error fetching random listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
}

async function deleteListing(req, res) {
  try {
    const { listing_id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const listing = await Listing.findById(listing_id);
    const deleted = await Listing.delete(listing_id, user_id);

    if (deleted && listing?.images?.length) {
      await destroyImages(listing.images);
    }

    res.json({ success: deleted });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
}

async function adminDeleteListing(req, res) {
  try {
    const admin = await requireAdminUser(req, res);
    if (!admin) {
      return;
    }

    const { listing_id } = req.params;
    const { ban_user = false } = req.body;
    const listing = await Listing.findById(listing_id);

    if (!listing) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    const author = await User.findById(listing.user_id);
    const deleted = await Listing.deleteAny(listing_id);

    if (!deleted) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    if (listing.images?.length) {
      await destroyImages(listing.images);
    }

    if (ban_user && author) {
      await User.ban(author.id, BAN_REASON);
      await notifyUserAboutBan(author, listing.title);
    }

    res.json({ success: true, banned: Boolean(ban_user && author) });
  } catch (error) {
    console.error('Error deleting listing as admin:', error);
    res.status(500).json({ error: 'Не удалось удалить объявление' });
  }
}

async function updateListing(req, res) {
  let newlyUploadedImages = [];

  try {
    const { listing_id } = req.params;
    const { user_id, title, description, price, price_type = '', category_id, subcategory = '', city_id, images } = req.body;
    const requesterTelegramId = getRequesterTelegramId(req);
    const isAdminRequester = isAdminTelegramId(requesterTelegramId);

    if (!requesterTelegramId) {
      return res.status(401).json({ error: 'Не удалось определить пользователя Telegram' });
    }

    if (!isAdminRequester && !user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const normalizedPriceType = normalizePriceType(price_type);
    const normalizedPrice = normalizePriceValue(price, normalizedPriceType);
    if (!title || !category_id || !city_id || normalizedPrice === null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const imageValidation = validateImages(images, getMediaValidationOptions(req));
    if (!imageValidation.isValid) {
      return res.status(400).json({ error: imageValidation.errors.join('. ') });
    }

    const existingListing = await Listing.findById(listing_id);
    if (!existingListing) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    if (isAdminRequester) {
      const admin = await User.findByTelegramId(requesterTelegramId);
      if (!admin) {
        return res.status(401).json({ error: 'Администратор не найден' });
      }
    } else {
      const requester = await User.findByTelegramId(requesterTelegramId);
      if (!requester || requester.id !== user_id || existingListing.user_id !== user_id) {
        return res.status(403).json({ error: 'Нельзя редактировать чужое объявление' });
      }

      const author = await ensureUserCanPublish(user_id, res);
      if (!author) {
        return;
      }
    }

    if (!isAdminRequester) {
      const forbiddenWord = await findForbiddenWord(title, description, subcategory);
      if (forbiddenWord) {
        const author = await User.findById(user_id);
        await notifyForbiddenPublication(author, title, forbiddenWord, 'объявление при редактировании');
        return res.status(422).json({ error: `Изменения не сохранены: нельзя использовать «${forbiddenWord}»` });
      }
    }

    const uploadedImages = await uploadImages(imageValidation.images, 'listing');
    newlyUploadedImages = uploadedImages.filter((imageUrl) => !imageValidation.images.includes(imageUrl));

    const updated = isAdminRequester
      ? await Listing.updateById(listing_id, {
        title,
        description,
        price: normalizedPrice,
        price_type: normalizedPriceType,
        category_id,
        subcategory,
        city_id,
        images: JSON.stringify(uploadedImages)
      })
      : await Listing.update(listing_id, user_id, {
        title,
        description,
        price: normalizedPrice,
        price_type: normalizedPriceType,
        category_id,
        subcategory,
        city_id,
        images: JSON.stringify(uploadedImages)
      });

    if (updated && existingListing?.images?.length) {
      const imagesToRemove = existingListing.images.filter(
        (imageUrl) => !uploadedImages.includes(imageUrl)
      );
      await destroyImages(imagesToRemove);
    }

    const listing = updated ? await Listing.findById(listing_id) : null;
    res.json({ success: updated, listing });
  } catch (error) {
    console.error('Error updating listing:', error);
    if (newlyUploadedImages.length) {
      await destroyImages(newlyUploadedImages);
    }
    res.status(500).json({ error: 'Failed to update listing' });
  }
}

async function reactivateListing(req, res) {
  try {
    const { listing_id } = req.params;
    const { user_id } = req.body;
    const requesterTelegramId = getRequesterTelegramId(req);

    if (!requesterTelegramId || !user_id) {
      return res.status(400).json({ error: 'Не заполнены обязательные поля' });
    }

    const requester = await User.findByTelegramId(requesterTelegramId);
    if (!requester || requester.id !== user_id) {
      return res.status(403).json({ error: 'Нельзя активировать чужое объявление' });
    }

    const listing = await Listing.findById(listing_id);
    if (!listing || listing.user_id !== user_id) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    const expiresAt = await Listing.activatePublication(listing_id, 30);
    res.json({ success: Boolean(expiresAt), expires_at: expiresAt });
  } catch (error) {
    console.error('Error reactivating listing:', error);
    res.status(500).json({ error: 'Не удалось активировать объявление' });
  }
}

async function archiveListing(req, res) {
  try {
    const { listing_id } = req.params;
    const { user_id } = req.body;
    const requesterTelegramId = getRequesterTelegramId(req);

    if (!requesterTelegramId || !user_id) {
      return res.status(400).json({ error: 'Не заполнены обязательные поля' });
    }

    const requester = await User.findByTelegramId(requesterTelegramId);
    if (!requester || requester.id !== user_id) {
      return res.status(403).json({ error: 'Нельзя архивировать чужое объявление' });
    }

    const listing = await Listing.findById(listing_id);
    if (!listing || listing.user_id !== user_id) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    const archived = await Listing.archive(listing_id);
    const updatedListing = archived ? await Listing.findById(listing_id) : null;
    res.json({ success: archived, item: updatedListing });
  } catch (error) {
    console.error('Error archiving listing:', error);
    res.status(500).json({ error: 'Не удалось архивировать объявление' });
  }
}

async function adminArchiveListing(req, res) {
  try {
    const admin = await requireAdminUser(req, res);
    if (!admin) {
      return;
    }

    const { listing_id } = req.params;
    const listing = await Listing.findById(listing_id);

    if (!listing) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    const archived = await Listing.archive(listing_id);
    const updatedListing = archived ? await Listing.findById(listing_id) : null;
    res.json({ success: archived, item: updatedListing });
  } catch (error) {
    console.error('Error archiving listing as admin:', error);
    res.status(500).json({ error: 'Не удалось архивировать объявление' });
  }
}

async function createPromotionInvoice(req, res) {
  try {
    const { listing_id } = req.params;
    const { user_id, plan } = req.body;
    const requesterTelegramId = getRequesterTelegramId(req);

    if (!requesterTelegramId || !user_id || !plan) {
      return res.status(400).json({ error: 'Не заполнены обязательные поля' });
    }

    const promotionPlan = PROMOTION_PLANS[plan];
    if (!promotionPlan) {
      return res.status(400).json({ error: 'Неизвестный тариф продвижения' });
    }

    const requester = await User.findByTelegramId(requesterTelegramId);
    if (!requester || requester.id !== user_id) {
      return res.status(403).json({ error: 'Нельзя оплатить продвижение для чужого объявления' });
    }

    const listing = await Listing.findById(listing_id);
    if (!listing || listing.user_id !== user_id) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    const bot = getTelegramBot();
    if (!bot) {
      return res.status(503).json({ error: 'Telegram-бот недоступен, попробуйте позже' });
    }

    const payload = [
      'promotion',
      'listing',
      listing_id,
      user_id,
      plan,
      promotionPlan.stars,
      Date.now()
    ].join(':');

    const invoiceLink = await bot.createInvoiceLink(
      'Продвижение объявления',
      `${listing.title} • первая линия на ${promotionPlan.label}`,
      payload,
      '',
      'XTR',
      [{ label: `Продвижение на ${promotionPlan.label}`, amount: promotionPlan.stars }]
    );

    res.json({
      success: true,
      invoice_link: invoiceLink,
      plan: {
        key: plan,
        ...promotionPlan
      }
    });
  } catch (error) {
    console.error('Error creating promotion invoice:', error);
    res.status(500).json({ error: 'Не удалось создать счет на продвижение' });
  }
}

async function adminActivatePromotion(req, res) {
  try {
    const admin = await requireAdminUser(req, res);
    if (!admin) {
      return;
    }

    const { listing_id } = req.params;
    const { plan } = req.body;
    const promotionPlan = PROMOTION_PLANS[plan];

    if (!promotionPlan) {
      return res.status(400).json({ error: 'Неизвестный срок продвижения' });
    }

    const listing = await Listing.findById(listing_id);
    if (!listing) {
      return res.status(404).json({ error: 'Объявление не найдено' });
    }

    const expiresAt = await Listing.activatePromotion(listing_id, promotionPlan.days);
    res.json({
      success: Boolean(expiresAt),
      expires_at: expiresAt,
      plan: {
        key: plan,
        ...promotionPlan
      }
    });
  } catch (error) {
    console.error('Error activating listing promotion as admin:', error);
    res.status(500).json({ error: 'Не удалось включить продвижение' });
  }
}

module.exports = {
  archiveListing,
  adminArchiveListing,
  createListing,
  adminActivatePromotion,
  adminDeleteListing,
  createPromotionInvoice,
  getListingsByUser,
  getListingDetails,
  searchListings,
  getRandomListings,
  deleteListing,
  reactivateListing,
  updateListing
};
