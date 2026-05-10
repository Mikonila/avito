const Listing = require('../models/Listing');
const User = require('../models/User');
const { validateImages } = require('../utils/validators');
const { getRequesterTelegramId } = require('../middleware/auth');
const { getTelegramBot, PROMOTION_PLANS } = require('../telegramBot');
const { destroyImages, uploadImages } = require('../utils/cloudinary');

async function createListing(req, res) {
  let newlyUploadedImages = [];

  try {
    const { user_id, title, description, category_id, subcategory = '', city_id, price, images } = req.body;

    if (!user_id || !title || !category_id || !city_id || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const imageValidation = validateImages(images);
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
      price,
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
    await Listing.incrementViews(listing_id);
    const listing = await Listing.findById(listing_id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
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

async function updateListing(req, res) {
  let newlyUploadedImages = [];

  try {
    const { listing_id } = req.params;
    const { user_id, title, description, price, category_id, subcategory = '', city_id, images } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const imageValidation = validateImages(images);
    if (!imageValidation.isValid) {
      return res.status(400).json({ error: imageValidation.errors.join('. ') });
    }

    const existingListing = await Listing.findById(listing_id);
    const uploadedImages = await uploadImages(imageValidation.images, 'listing');
    newlyUploadedImages = uploadedImages.filter((imageUrl) => !imageValidation.images.includes(imageUrl));

    const updated = await Listing.update(listing_id, user_id, {
      title,
      description,
      price,
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

    res.json({ success: updated });
  } catch (error) {
    console.error('Error updating listing:', error);
    if (newlyUploadedImages.length) {
      await destroyImages(newlyUploadedImages);
    }
    res.status(500).json({ error: 'Failed to update listing' });
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

module.exports = {
  createListing,
  createPromotionInvoice,
  getListingsByUser,
  getListingDetails,
  searchListings,
  getRandomListings,
  deleteListing,
  updateListing
};
