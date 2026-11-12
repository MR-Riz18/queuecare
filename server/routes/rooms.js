const express = require('express');
const { listRooms, createRoom, updateRoom, deleteRoom } = require('../controllers/roomController');
const { protect } = require('../middleware/auth');
const { authorize, STAFF_ROLES } = require('../middleware/roles');

const router = express.Router();

router.get('/', protect, authorize(...STAFF_ROLES), listRooms);
router.post('/', protect, authorize('admin'), createRoom);
router.patch('/:id', protect, authorize('admin'), updateRoom);
router.delete('/:id', protect, authorize('admin'), deleteRoom);

module.exports = router;
