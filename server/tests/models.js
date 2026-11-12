/**
 * Register every Mongoose model in this Jest module registry.
 * Required because populate('room' | 'queue' | ...) throws
 * MissingSchemaError if the model was never required in this file's
 * registry — each test file gets an isolated registry.
 */
require('../models/AuditLog');
require('../models/Clinic');
require('../models/Queue');
require('../models/QueueCounter');
require('../models/Room');
require('../models/Token');
require('../models/User');

module.exports = {};
