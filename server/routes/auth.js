const express = require('express');
const { login, logout, me, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', protect, me);
router.patch('/password', protect, changePassword);

module.exports = router;
