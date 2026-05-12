const express = require('express');
const router = express.Router();
const referenceController = require('../controllers/referenceController');

router.get('/categories', referenceController.getCategories);
router.get('/cities', referenceController.getCities);
router.get('/hero-ad', referenceController.getHeroAd);
router.post('/init', referenceController.initData);

module.exports = router;
