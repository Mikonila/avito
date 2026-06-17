const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listingController');

router.post('/create', listingController.createListing);
router.get('/user/:user_id', listingController.getListingsByUser);
router.get('/details/:listing_id', listingController.getListingDetails);
router.get('/search', listingController.searchListings);
router.get('/random', listingController.getRandomListings);
router.post('/:listing_id/promotion/admin', listingController.adminActivatePromotion);
router.post('/:listing_id/promotion/invoice', listingController.createPromotionInvoice);
router.post('/:listing_id/archive/admin', listingController.adminArchiveListing);
router.post('/:listing_id/archive', listingController.archiveListing);
router.post('/:listing_id/reactivate', listingController.reactivateListing);
router.delete('/:listing_id/admin', listingController.adminDeleteListing);
router.delete('/:listing_id', listingController.deleteListing);
router.put('/:listing_id', listingController.updateListing);

module.exports = router;
