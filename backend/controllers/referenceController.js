const { getCategories, getCities, initializeData } = require('../models/Reference');
const AppSettings = require('../models/AppSettings');

const DEFAULT_HERO_AD = {
  title: 'Покупайте и продавайте по всей Черногории',
  description: 'Недвижимость, авто, услуги и подработка',
  details: 'в привычном формате объявлений.',
  image_url: 'assets/montenegro-hero.png',
  is_custom: false
};

async function getCategories_(req, res) {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

async function getCities_(req, res) {
  try {
    const cities = await getCities();
    res.json(cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
}

async function initData(req, res) {
  try {
    await initializeData();
    res.json({ success: true, message: 'Data initialized' });
  } catch (error) {
    console.error('Error initializing data:', error);
    res.status(500).json({ error: 'Failed to initialize data' });
  }
}

async function getHeroAd(req, res) {
  try {
    const heroAd = await AppSettings.get('hero_ad');
    res.json(heroAd || DEFAULT_HERO_AD);
  } catch (error) {
    console.error('Error fetching hero ad:', error);
    res.status(500).json({ error: 'Failed to fetch hero ad' });
  }
}

module.exports = {
  getCategories: getCategories_,
  getCities: getCities_,
  getHeroAd,
  initData
};
