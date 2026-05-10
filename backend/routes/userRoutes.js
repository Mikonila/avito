const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.post('/register', userController.register);
router.get('/profile/:user_id', userController.getUserProfile);
router.put('/profile/:user_id/city', userController.updateUserCity);
router.put('/profile/:user_id/phone', userController.updateUserPhone);

module.exports = router;
