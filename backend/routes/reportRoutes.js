const express = require('express');
const { reportPublication } = require('../controllers/reportController');

const router = express.Router();
router.post('/', reportPublication);

module.exports = router;
