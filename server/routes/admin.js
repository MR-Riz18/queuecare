const express = require('express');
const {
  listUsers,
  createUser,
  updateUser,
  getSettings,
  updateSettings,
  regenerateDisplayKey,
  listAuditLogs,
} = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

const router = express.Router();

// Everything under /api/admin requires the admin role.
router.use(protect, authorize('admin'));

router.get('/users', listUsers);
router.post('/users', createUser);
router.patch('/users/:id', updateUser);
router.get('/settings', getSettings);
router.patch('/settings', updateSettings);
router.post('/settings/regenerate-display-key', regenerateDisplayKey);
router.get('/audit-logs', listAuditLogs);

module.exports = router;
