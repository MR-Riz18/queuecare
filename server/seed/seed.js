/**
 * Seed script: demo clinic with staff, queues, rooms and 18 tokens.
 *
 *   cd server && npm run seed        (requires MongoDB running + .env)
 *
 * Idempotent-ish: wipes all clinic-scoped data for the demo clinic first,
 * then recreates everything. Prints the display URL and login credentials.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { getServiceDate } = require('../utils/serviceDate');
const Clinic = require('../models/Clinic');
const User = require('../models/User');
const Queue = require('../models/Queue');
const QueueCounter = require('../models/QueueCounter');
const Token = require('../models/Token');
const Room = require('../models/Room');
const AuditLog = require('../models/AuditLog');

const TIMEZONE = 'Asia/Karachi';
const CLINIC_NAME = 'CityCare General Clinic';

const USERS = [
  { name: 'Clinic Admin', email: 'admin@queuecare.local', password: 'Admin123!', role: 'admin' },
  { name: 'Ayesha Khan', email: 'reception1@queuecare.local', password: 'Reception123!', role: 'receptionist' },
  { name: 'Bilal Ahmed', email: 'reception2@queuecare.local', password: 'Reception123!', role: 'receptionist' },
  { name: 'Dr. Sana Iqbal', email: 'doctor1@queuecare.local', password: 'Doctor123!', role: 'practitioner' },
  { name: 'Dr. Usman Tariq', email: 'doctor2@queuecare.local', password: 'Doctor123!', role: 'practitioner' },
];

const QUEUES = [
  { name: 'General Consultation', prefix: 'G', department: 'General Medicine' },
  { name: 'Dental', prefix: 'D', department: 'Dentistry' },
  { name: 'Emergency', prefix: 'E', department: 'Emergency' },
];

// [queuePrefix, patientName, priority, status, roomName|null, reason?]
const TOKENS = [
  ['G', 'Ahmed Raza', 'normal', 'waiting', null],
  ['G', 'Fatima Noor', 'high', 'waiting', null],
  ['G', 'Hassan Ali', 'normal', 'waiting', null],
  ['G', 'Maryam Siddiqui', 'normal', 'called', 'Room 1'],
  ['G', 'Imran Sheikh', 'normal', 'called', 'Room 2'],
  ['G', 'Zainab Qureshi', 'high', 'serving', 'Room 1'],
  ['G', 'Farhan Javed', 'normal', 'completed', 'Room 2'],
  ['G', 'Nadia Aslam', 'normal', 'skipped', null, 'Patient stepped out'],
  ['D', 'Kamran Shah', 'normal', 'waiting', null],
  ['D', 'Rabia Anwar', 'normal', 'waiting', null],
  ['D', 'Shahid Mehmood', 'high', 'called', 'Room 3'],
  ['D', 'Hina Farooq', 'normal', 'completed', 'Room 3'],
  ['D', 'Tariq Mehmood', 'normal', 'cancelled', null, 'Duplicate registration'],
  ['E', 'Saima Akram', 'emergency', 'waiting', null],
  ['E', 'Danish Ali', 'emergency', 'called', 'Room 4'],
  ['E', 'Sadia Rehman', 'high', 'serving', 'Room 4'],
  ['E', 'Waqas Anwar', 'normal', 'completed', 'Room 4'],
  ['E', 'Amina Tariq', 'normal', 'completed', 'Room 4'],
];

function padSeq(seq) {
  return String(seq).padStart(3, '0');
}

async function wipe(clinicId, emails) {
  const queueIds = await Queue.find({ clinic: clinicId }).distinct('_id');
  await Promise.all([
    Token.deleteMany({ clinic: clinicId }),
    QueueCounter.deleteMany({ queue: { $in: queueIds } }),
    Queue.deleteMany({ clinic: clinicId }),
    Room.deleteMany({ clinic: clinicId }),
    AuditLog.deleteMany({ clinic: clinicId }),
    User.deleteMany({ $or: [{ clinic: clinicId }, { email: { $in: emails } }] }),
  ]);
  await Clinic.deleteOne({ _id: clinicId });
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const emails = USERS.map((u) => u.email.toLowerCase());
  const existing = await Clinic.findOne({ name: CLINIC_NAME });
  if (existing) {
    await wipe(existing._id, emails);
    console.log('Wiped previous demo data');
  }

  const serviceDate = getServiceDate(TIMEZONE);

  const clinic = await Clinic.create({
    name: CLINIC_NAME,
    facilityType: 'clinic',
    timezone: TIMEZONE,
    settings: {
      announcement: 'Welcome to CityCare. Please keep your token number visible and listen for announcements.',
    },
  });
  console.log(`Clinic created: ${clinic.name} (${serviceDate}, ${TIMEZONE})`);

  const usersByEmail = {};
  for (const u of USERS) {
    const user = new User({ name: u.name, email: u.email, role: u.role, clinic: clinic._id });
    user.password = u.password; // virtual -> bcrypt hash on save
    await user.save();
    usersByEmail[u.email] = user;
  }
  const admin = usersByEmail['admin@queuecare.local'];
  const receptionist = usersByEmail['reception1@queuecare.local'];
  const practitioner1 = usersByEmail['doctor1@queuecare.local'];
  const practitioner2 = usersByEmail['doctor2@queuecare.local'];
  console.log('Users created:', USERS.length);

  const queuesByPrefix = {};
  for (const q of QUEUES) {
    const queue = await Queue.create({
      clinic: clinic._id,
      name: q.name,
      prefix: q.prefix,
      department: q.department,
      serviceDate,
    });
    queuesByPrefix[q.prefix] = queue;
  }
  console.log('Queues created:', QUEUES.length);

  const roomsByName = {};
  const roomDefs = [
    ['Room 1', practitioner1._id],
    ['Room 2', practitioner2._id],
    ['Room 3', practitioner1._id],
    ['Room 4', practitioner2._id],
  ];
  for (const [name, staff] of roomDefs) {
    const room = await Room.create({ clinic: clinic._id, name, assignedStaff: staff });
    roomsByName[name] = room;
  }
  console.log('Rooms created:', roomDefs.length);

  // Staggered registrations across the morning, ending ~now.
  const now = Date.now();
  let created = 0;
  for (let i = 0; i < TOKENS.length; i++) {
    const [prefix, patientName, priority, status, roomName, reason] = TOKENS[i];
    const queue = queuesByPrefix[prefix];
    const seq = await QueueCounter.nextSeq(queue._id, serviceDate);
    const registeredAt = new Date(now - (TOKENS.length - i) * 9 * 60 * 1000);
    const calledAt = new Date(registeredAt.getTime() + 12 * 60 * 1000);

    const doc = {
      tokenNumber: `${queue.prefix}${padSeq(seq)}`,
      queue: queue._id,
      clinic: clinic._id,
      serviceDate,
      seq,
      subject: { kind: 'human', name: patientName, visitType: 'walk-in' },
      queueType: 'walk-in',
      priority,
      status,
      registeredAt,
      createdBy: receptionist._id,
    };

    if (roomName) doc.room = roomsByName[roomName]._id;
    if (['called', 'serving', 'completed'].includes(status)) doc.calledAt = calledAt;
    if (['serving', 'completed'].includes(status)) {
      doc.servingStartedAt = new Date(calledAt.getTime() + 5 * 60 * 1000);
    }
    if (status === 'completed') {
      doc.completedAt = new Date(doc.servingStartedAt.getTime() + 18 * 60 * 1000);
    }
    if (status === 'skipped') doc.skipReason = reason || '';
    if (status === 'cancelled') doc.cancelReason = reason || '';
    if (prefix === 'E') doc.practitioner = practitioner2._id;

    await Token.create(doc);
    created++;
  }
  console.log(`Tokens created: ${created}`);

  await AuditLog.create({
    clinic: clinic._id,
    user: admin._id,
    action: 'seed.run',
    entityType: 'Clinic',
    entityId: clinic._id,
    metadata: { tokens: created },
  });

  const fresh = await Clinic.findById(clinic._id);
  const port = process.env.PORT || 5000;

  console.log('\n================ SEED COMPLETE ================');
  console.log(`Clinic:      ${CLINIC_NAME} (${TIMEZONE})`);
  console.log(`Display URL: http://localhost:${port}/api/display/${fresh.settings.displayKey}`);
  console.log('             (Stage 3 frontend will serve this at /display/<key>)');
  console.log('\nCredentials:');
  console.log('  admin:        admin@queuecare.local / Admin123!');
  console.log('  receptionist: reception1@queuecare.local / Reception123!');
  console.log('  practitioner: doctor1@queuecare.local / Doctor123!');
  console.log('================================================\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
