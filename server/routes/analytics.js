const express = require('express');
const { getQueueAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');
const { authorize, STAFF_ROLES } = require('../middleware/roles');

const router = express.Router();

// Staff analytics — clinic-scoped, computed from Token records.
router.get('/queue', protect, authorize(...STAFF_ROLES), getQueueAnalytics);

module.exports = router;
