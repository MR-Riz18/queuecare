const express = require('express');
const { getDisplay } = require('../controllers/displayController');
const { displayLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// PUBLIC endpoint — no auth, rate-limited, returns only public-safe data.
router.get('/:displayKey', displayLimiter, getDisplay);

module.exports = router;
