const Service = require('../models/Service');
const { validateImages } = require('../utils/validators');
const { destroyImages, uploadImages } = require('../utils/cloudinary');

async function createService(req, res) {
  let newlyUploadedImages = [];

  try {
    const { user_id, title, description, category_id, subcategory = '', city_id, price, images } = req.body;

    if (!user_id || !title || !category_id || !city_id) {
      return res.status(400).json({ error: 'Missing required fields' });
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

module.exports = {
  createService,
  getServicesByUser,
  searchServices,
  deleteService
};
