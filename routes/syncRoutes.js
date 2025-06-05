const express = require('express');
const router = express.Router();
const { pushToOnline, pullFromOnline } = require('../controllers/syncController'); // Added pullFromOnline

// POST /api/sync/push-to-online
// Body: { username: "adminUsername", store: "adminStore" }
router.post('/push-to-online', pushToOnline);
router.get('/push-to-online', pushToOnline); // For SSE during push

// GET /api/sync/pull-from-online
// Potentially, query params for storeId if needed, or derive from authenticated user
router.get('/pull-from-online', pullFromOnline); // For SSE during pull

module.exports = router;
