const express = require('express');
const router = express.Router();
const likeController = require('../controllers/likeController');

router.post('/toggle', likeController.toggleLike);
router.post('/boost', likeController.boostLikes);
router.get('/user/:user_id', likeController.getUserLikes);

module.exports = router;
