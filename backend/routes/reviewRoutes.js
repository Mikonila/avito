const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');

router.post('/', reviewController.createReview);
router.post('/admin-seeded', reviewController.createAdminSeededReview);
router.delete('/:review_id', reviewController.deleteReview);

module.exports = router;
