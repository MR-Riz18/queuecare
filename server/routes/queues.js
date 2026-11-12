const express = require('express');
const {
  listQueues,
  createQueue,
  getQueue,
  listTokens,
  registerToken,
  callNext,
} = require('../controllers/queueController');
const { protect } = require('../middleware/auth');
const { authorize, RECEPTION_ROLES, STAFF_ROLES } = require('../middleware/roles');

const router = express.Router();

// All queue endpoints require authentication; staff roles vary per action.
// Reads are open to all staff (so practitioners can view today's queues);
// registering and calling stay front-desk actions.
router.get('/', protect, authorize(...STAFF_ROLES), listQueues);
router.post('/', protect, authorize('admin'), createQueue);
router.get('/:id', protect, authorize(...STAFF_ROLES), getQueue);
router.get('/:id/tokens', protect, authorize(...STAFF_ROLES), listTokens);
router.post('/:id/tokens', protect, authorize(...RECEPTION_ROLES), registerToken);
router.post('/:id/call-next', protect, authorize(...RECEPTION_ROLES), callNext);

module.exports = router;
