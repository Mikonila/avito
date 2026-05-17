const Service = require('../models/Service');
const User = require('../models/User');
const { validateImages } = require('../utils/validators');
const { getRequesterTelegramId, isAdminTelegramId } = require('../middleware/auth');
const { getTelegramBot, PROMOTION_PLANS, SERVICE_PUBLICATION_PLANS } = require('../telegramBot');
const { destroyImages, uploadImages } = require('../utils/cloudinary');
const {
  BAN_REASON,
  ensureUserCanPublish,
  notifyUserAboutBan,
  requireAdminUser
} = require('../utils/moderation');

function getMediaValidationOptions(req) {
  const isAdmin = isAdminTelegramId(getRequesterTelegramId(req));

  return {
    maxImages: isAdmin ? 10 : 5,
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

async function createServicePublicationInvoiceLink(bot, service, userId, planKey = 'month') {
  const publicationPlan = SERVICE_PUBLICATION_PLANS[planKey];

  if (!publicationPlan) {
    throw new Error('Неизвестный тариф публикации');
  }

  const payload = [
    'service_publication',
    service.id,
    userId,
    planKey,
    publicationPlan.stars,
    Date.now()
  ].join(':');

  return bot.createInvoiceLink(
    'Платная публикация услуги',
    `${service.title} • публикация на ${publicationPlan.label}`,
    payload,
    '',
    'XTR',
    [{ label: `Публикация на ${publicationPlan.label}`, amount: publicationPlan.stars }]
  );
}

async function createService(req, res) {
  let newlyUploadedImages = [];

  try {
    const {
      user_id,
      title,
      description,
      category_id,
      subcategory = '',
      city_id,
      price,
      price_type = '',
      images,
      publication_plan = ''
    } = req.body;

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

    const imageValidation = validateImages(images, getMediaValidationOptions(req));
    if (!imageValidation.isValid) {
      return res.status(400).json({ error: imageValidation.errors.join('. ') });
    }

    const isAdminRequester = isAdminTelegramId(getRequesterTelegramId(req));
    const canAdd = await Service.canAddService(user_id);
    const requiresPaidPublication = !isAdminRequester && !canAdd;

    if (requiresPaidPublication && publication_plan !== 'month') {
      return res.status(402).json({ error: 'Для публикации дополнительной услуги нужно оплатить размещение на 1 месяц' });
    }

    const bot = requiresPaidPublication ? getTelegramBot() : null;
    if (requiresPaidPublication && !bot) {
      return res.status(503).json({ error: 'Telegram-бот недоступен, попробуйте позже' });
    }

    const uploadedImages = await uploadImages(imageValidation.images, 'service');
    newlyUploadedImages = uploadedImages.filter((imageUrl) => !imageValidation.images.includes(imageUrl));

    const id = await Service.create(user_id, {
      title,
      description,
      category_id,
      subcategory,
      city_id,
      price: normalizedPrice,
      price_type: normalizedPriceType,
      images: JSON.stringify(uploadedImages),
      status: requiresPaidPublication ? 'pending_payment' : 'active',
      is_paid: false
    });

    if (requiresPaidPublication) {
      const service = await Service.findById(id);
      const invoiceLink = await createServicePublicationInvoiceLink(bot, service, user_id, publication_plan);

      return res.json({
        success: true,
        service_id: id,
        payment_required: true,
        invoice_link: invoiceLink
      });
    }

    res.json({ success: true, service_id: id });
  } catch (error) {
    console.error('Error creating service:', error);
    if (newlyUploadedImages.length) {
      await destroyImages(newlyUploadedImages);
    }
    res.status(500).json({ error: 'Failed to create service' });
  }
}

async function getServicesByUser(req, res) {
  try {
    const { user_id } = req.params;
    const services = await Service.findByUserId(user_id);
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
}

async function getServiceDetails(req, res) {
  try {
    const { service_id } = req.params;
    let service = await Service.findById(service_id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    if (shouldIncrementViews(req, service.user_id)) {
      await Service.incrementViews(service_id);
      service = await Service.findById(service_id);
    }

    res.json(service);
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: 'Failed to fetch service' });
  }
}

async function searchServices(req, res) {
  try {
    const { city_id, category_id } = req.query;
    const services = await Service.findByCityAndCategory(city_id, category_id);
    res.json(services);
  } catch (error) {
    console.error('Error searching services:', error);
    res.status(500).json({ error: 'Failed to search services' });
  }
}

async function deleteService(req, res) {
  try {
    const { service_id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const service = await Service.findById(service_id);
    const deleted = await Service.delete(service_id, user_id);

    if (deleted && service?.images?.length) {
      await destroyImages(service.images);
    }

    res.json({ success: deleted });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
}

async function adminDeleteService(req, res) {
  try {
    const admin = await requireAdminUser(req, res);
    if (!admin) {
      return;
    }

    const { service_id } = req.params;
    const { ban_user = false } = req.body;
    const service = await Service.findById(service_id);

    if (!service) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const author = await User.findById(service.user_id);
    const deleted = await Service.deleteAny(service_id);

    if (!deleted) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    if (service.images?.length) {
      await destroyImages(service.images);
    }

    if (ban_user && author) {
      await User.ban(author.id, BAN_REASON);
      await notifyUserAboutBan(author, service.title);
    }

    res.json({ success: true, banned: Boolean(ban_user && author) });
  } catch (error) {
    console.error('Error deleting service as admin:', error);
    res.status(500).json({ error: 'Не удалось удалить услугу' });
  }
}

async function updateService(req, res) {
  let newlyUploadedImages = [];

  try {
    const { service_id } = req.params;
    const { user_id, title, description, price, price_type = '', category_id, subcategory = '', city_id, images } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const author = await ensureUserCanPublish(user_id, res);
    if (!author) {
      return;
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

    const existingService = await Service.findById(service_id);
    const uploadedImages = await uploadImages(imageValidation.images, 'service');
    newlyUploadedImages = uploadedImages.filter((imageUrl) => !imageValidation.images.includes(imageUrl));

    const updated = await Service.update(service_id, user_id, {
      title,
      description,
      price: normalizedPrice,
      price_type: normalizedPriceType,
      category_id,
      subcategory,
      city_id,
      images: JSON.stringify(uploadedImages)
    });

    if (updated && existingService?.images?.length) {
      const imagesToRemove = existingService.images.filter(
        (imageUrl) => !uploadedImages.includes(imageUrl)
      );
      await destroyImages(imagesToRemove);
    }

    res.json({ success: updated });
  } catch (error) {
    console.error('Error updating service:', error);
    if (newlyUploadedImages.length) {
      await destroyImages(newlyUploadedImages);
    }
    res.status(500).json({ error: 'Failed to update service' });
  }
}

async function createPublicationInvoice(req, res) {
  try {
    const { service_id } = req.params;
    const { user_id, plan = 'month' } = req.body;
    const requesterTelegramId = getRequesterTelegramId(req);

    if (!requesterTelegramId || !user_id) {
      return res.status(400).json({ error: 'Не заполнены обязательные поля' });
    }

    const requester = await User.findByTelegramId(requesterTelegramId);
    if (!requester || requester.id !== user_id) {
      return res.status(403).json({ error: 'Нельзя оплатить чужую услугу' });
    }

    const service = await Service.findById(service_id);
    if (!service || service.user_id !== user_id) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const bot = getTelegramBot();
    if (!bot) {
      return res.status(503).json({ error: 'Telegram-бот недоступен, попробуйте позже' });
    }

    const invoiceLink = await createServicePublicationInvoiceLink(bot, service, user_id, plan);

    res.json({
      success: true,
      payment_required: true,
      invoice_link: invoiceLink,
      plan: {
        key: plan,
        ...SERVICE_PUBLICATION_PLANS[plan]
      }
    });
  } catch (error) {
    console.error('Error creating service publication invoice:', error);
    res.status(500).json({ error: 'Не удалось создать счет на публикацию' });
  }
}

async function reactivateService(req, res) {
  try {
    const { service_id } = req.params;
    const { user_id } = req.body;
    const requesterTelegramId = getRequesterTelegramId(req);

    if (!requesterTelegramId || !user_id) {
      return res.status(400).json({ error: 'Не заполнены обязательные поля' });
    }

    const requester = await User.findByTelegramId(requesterTelegramId);
    if (!requester || requester.id !== user_id) {
      return res.status(403).json({ error: 'Нельзя активировать чужую услугу' });
    }

    const service = await Service.findById(service_id);
    if (!service || service.user_id !== user_id) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const canAddFree = await Service.canAddService(user_id);
    if (!service.is_paid && canAddFree) {
      const expiresAt = await Service.activatePublication(service_id, 30, false);
      return res.json({ success: Boolean(expiresAt), expires_at: expiresAt });
    }

    return createPublicationInvoice(req, res);
  } catch (error) {
    console.error('Error reactivating service:', error);
    res.status(500).json({ error: 'Не удалось активировать услугу' });
  }
}

async function createPromotionInvoice(req, res) {
  try {
    const { service_id } = req.params;
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
      return res.status(403).json({ error: 'Нельзя оплатить продвижение для чужой услуги' });
    }

    const service = await Service.findById(service_id);
    if (!service || service.user_id !== user_id) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const bot = getTelegramBot();
    if (!bot) {
      return res.status(503).json({ error: 'Telegram-бот недоступен, попробуйте позже' });
    }

    const payload = [
      'promotion',
      'service',
      service_id,
      user_id,
      plan,
      promotionPlan.stars,
      Date.now()
    ].join(':');

    const invoiceLink = await bot.createInvoiceLink(
      'Продвижение услуги',
      `${service.title} • первая линия на ${promotionPlan.label}`,
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
    console.error('Error creating service promotion invoice:', error);
    res.status(500).json({ error: 'Не удалось создать счет на продвижение' });
  }
}

async function adminActivatePromotion(req, res) {
  try {
    const admin = await requireAdminUser(req, res);
    if (!admin) {
      return;
    }

    const { service_id } = req.params;
    const { plan } = req.body;
    const promotionPlan = PROMOTION_PLANS[plan];

    if (!promotionPlan) {
      return res.status(400).json({ error: 'Неизвестный срок продвижения' });
    }

    const service = await Service.findById(service_id);
    if (!service) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const expiresAt = await Service.activatePromotion(service_id, promotionPlan.days);
    res.json({
      success: Boolean(expiresAt),
      expires_at: expiresAt,
      plan: {
        key: plan,
        ...promotionPlan
      }
    });
  } catch (error) {
    console.error('Error activating service promotion as admin:', error);
    res.status(500).json({ error: 'Не удалось включить продвижение' });
  }
}

module.exports = {
  createPromotionInvoice,
  createPublicationInvoice,
  createService,
  adminActivatePromotion,
  adminDeleteService,
  getServiceDetails,
  getServicesByUser,
  searchServices,
  deleteService,
  reactivateService,
  updateService
};
