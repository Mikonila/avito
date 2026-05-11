const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');

router.post('/create', serviceController.createService);
router.get('/user/:user_id', serviceController.getServicesByUser);
router.get('/search', serviceController.searchServices);
router.post('/:service_id/promotion/invoice', serviceController.createPromotionInvoice);
router.post('/:service_id/publication/invoice', serviceController.createPublicationInvoice);
router.post('/:service_id/reactivate', serviceController.reactivateService);
router.delete('/:service_id/admin', serviceController.adminDeleteService);
router.delete('/:service_id', serviceController.deleteService);
router.put('/:service_id', serviceController.updateService);

module.exports = router;
