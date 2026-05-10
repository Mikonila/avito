const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');

router.post('/create', serviceController.createService);
router.get('/user/:user_id', serviceController.getServicesByUser);
router.get('/search', serviceController.searchServices);
router.delete('/:service_id', serviceController.deleteService);

module.exports = router;
