const express = require('express');
const router = express.Router();
const listingController = require('../controllers/listingController');

router.post('/create', listingController.createListing);
router.get('/user/:user_id', listingController.getListingsByUser);
router.get('/details/:listing_id', listingController.getListingDetails);
router.get('/search', listingController.searchListings);
router.get('/random', listingController.getRandomListings);
router.delete('/:listing_id', listingController.deleteListing);
router.put('/:listing_id', listingController.updateListing);

module.exports = router;
