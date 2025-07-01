const express = require('express');
const router = express.Router();
const vipController = require('../controllers/vipController');

// Route for creating and getting VIPs
router.route('/')
  .post(vipController.createVip)
  .get(vipController.getVips);

router.route('/:id/renew')
  .put(vipController.renewVip);

router.route('/update-statuses')
  .put(vipController.updateVipStatuses);

module.exports = router;
