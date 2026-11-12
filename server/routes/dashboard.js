const express = require('express');
const { getStats } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');
const { authorize, STAFF_ROLES } = require('../middleware/roles');

const router = express.Router();

router.get('/stats', protect, authorize(...STAFF_ROLES), getStats);

module.exports = router;
