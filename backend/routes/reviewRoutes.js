const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { requireAdmin } = require('../middleware/auth');

router.post('/', reviewController.createReview);
router.delete('/:review_id', requireAdmin, reviewController.deleteReview);

module.exports = router;
