const express = require('express');
const {
  getToken,
  callToken,
  recallToken,
  startServing,
  skipToken,
  returnToQueue,
  completeToken,
  cancelToken,
} = require('../controllers/tokenController');
const { protect } = require('../middleware/auth');
const { authorize, RECEPTION_ROLES, STAFF_ROLES } = require('../middleware/roles');

const router = express.Router();

router.use(protect);

// Reading a token is open to all staff; lifecycle changes are front-desk
// actions (receptionist + admin).
router.get('/:id', authorize(...STAFF_ROLES), getToken);
router.patch('/:id/call', authorize(...RECEPTION_ROLES), callToken);
router.patch('/:id/recall', authorize(...RECEPTION_ROLES), recallToken);
router.patch('/:id/start-serving', authorize(...RECEPTION_ROLES), startServing);
router.patch('/:id/skip', authorize(...RECEPTION_ROLES), skipToken);
router.patch('/:id/return', authorize(...RECEPTION_ROLES), returnToQueue);
router.patch('/:id/complete', authorize(...RECEPTION_ROLES), completeToken);
router.patch('/:id/cancel', authorize(...RECEPTION_ROLES), cancelToken);

module.exports = router;
