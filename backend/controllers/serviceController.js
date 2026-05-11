const Service = require('../models/Service');
const User = require('../models/User');
const { validateImages } = require('../utils/validators');
const { getRequesterTelegramId } = require('../middleware/auth');
const { getTelegramBot, PROMOTION_PLANS } = require('../telegramBot');
const { destroyImages, uploadImages } = require('../utils/cloudinary');
const {
  BAN_REASON,
  ensureUserCanPublish,
  notifyUserAboutBan,
  requireAdminUser
} = require('../utils/moderation');

async function createService(req, res) {
  let newlyUploadedImages = [];

  try {
    const { user_id, title, description, category_id, subcategory = '', city_id, price, images } = req.body;

    if (!user_id || !title || !category_id || !city_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const author = await ensureUserCanPublish(user_id, res);
    if (!author) {
      return;
    }

    const imageValidation = validateImages(images);
    if (!imageValidation.isValid) {
      return res.status(400).json({ error: imageValidation.errors.join('. ') });
    }

    // Check if user can add more services
    const canAdd = await Service.canAddService(user_id);
    if (!canAdd) {
      return res.status(403).json({ error: 'You have reached the free services limit. Contact @helionstudio for premium services.' });
    }

    const uploadedImages = await uploadImages(imageValidation.images, 'service');
    newlyUploadedImages = uploadedImages.filter((imageUrl) => !imageValidation.images.includes(imageUrl));

    const id = await Service.create(user_id, {
      title,
      description,
      category_id,
      subcategory,
      city_id,
      price,
      images: JSON.stringify(uploadedImages)
    });

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
    const { user_id, title, description, price, category_id, subcategory = '', city_id, images } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const author = await ensureUserCanPublish(user_id, res);
    if (!author) {
      return;
    }

    const imageValidation = validateImages(images);
    if (!imageValidation.isValid) {
      return res.status(400).json({ error: imageValidation.errors.join('. ') });
    }

    const existingService = await Service.findById(service_id);
    const uploadedImages = await uploadImages(imageValidation.images, 'service');
    newlyUploadedImages = uploadedImages.filter((imageUrl) => !imageValidation.images.includes(imageUrl));

    const updated = await Service.update(service_id, user_id, {
      title,
      description,
      price,
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

module.exports = {
  createPromotionInvoice,
  createService,
  adminDeleteService,
  getServicesByUser,
  searchServices,
  deleteService,
  updateService
};
