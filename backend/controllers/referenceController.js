const { getCategories, getCities, initializeData } = require('../models/Reference');

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

module.exports = {
  getCategories: getCategories_,
  getCities: getCities_,
  initData
};
