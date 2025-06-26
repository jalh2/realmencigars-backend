const express = require('express');
const router = express.Router();
const vipController = require('../controllers/vipController');

// Route for creating and getting VIPs
router.route('/')
  .post(vipController.createVip)
  .get(vipController.getVips);

module.exports = router;
