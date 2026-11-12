/**
 * DB-backed API tests: concurrency, RBAC, clinic isolation, edge cases.
 * Skips gracefully when mongodb-memory-server is unavailable.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
process.env.JWT_EXPIRE = '8h';

const request = require('supertest');
const { startMemoryDB, stopMemoryDB, dbAvailable } = require('./setup');

const app = require('../server');
require('./models'); // register all Mongoose models for populate()
const Clinic = require('../models/Clinic');
const User = require('../models/User');
const Queue = require('../models/Queue');
const Token = require('../models/Token');
const { getServiceDate } = require('../utils/serviceDate');

const skipNote = () => console.log('  ⊘ skipped: no in-memory MongoDB');
const itDB = (name, fn) =>
  it(name, async () => {
    if (!dbAvailable()) {
      skipNote();
      return;
    }
    await fn();
  });

let clinicA;
let clinicB;
let queueA;
let queueB;
let adminAgent; // supertest agent with admin cookie
let recepAgent;
let clinicBAgent;

async function makeUser({ name, email, role, clinic, password = 'Password123!' }) {
  const u = new User({ name, email, role, clinic, isActive: true });
  u.password = password; // virtual setter → bcrypt on save
  await u.save();
  return { user: u, password };
}

async function loginAs(email, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${res.text}`);
  return agent;
}

/**
 * Raw cookie header for burst requests. supertest's shared agent hits a
 * socket-reuse quirk (ECONNRESET) past ~9 concurrent requests on one agent,
 * so concurrency tests bypass the agent and send the cookie directly —
 * the server behavior under test is identical.
 */
async function cookieFor(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${res.text}`);
  return res.headers['set-cookie'].join('; ');
}

const withCookie = (cookie) => ({
  post: (url) => request(app).post(url).set('Cookie', cookie),
  patch: (url) => request(app).patch(url).set('Cookie', cookie),
  get: (url) => request(app).get(url).set('Cookie', cookie),
});

beforeAll(async () => {
  await startMemoryDB();
  if (!dbAvailable()) return;

  clinicA = await Clinic.create({
    name: 'Test Clinic A',
    facilityType: 'clinic',
    timezone: 'Asia/Karachi',
    settings: { announcement: 'Welcome' },
  });
  clinicB = await Clinic.create({
    name: 'Test Clinic B',
    facilityType: 'dental',
    timezone: 'Asia/Karachi',
    settings: { announcement: 'Hi' },
  });

  const sd = getServiceDate('Asia/Karachi');
  queueA = await Queue.create({ clinic: clinicA._id, name: 'General', prefix: 'G', serviceDate: sd });
  queueB = await Queue.create({ clinic: clinicB._id, name: 'General', prefix: 'G', serviceDate: sd });

  await makeUser({ name: 'Admin A', email: 'admin@a.test', role: 'admin', clinic: clinicA._id });
  await makeUser({ name: 'Recep A', email: 'recep@a.test', role: 'receptionist', clinic: clinicA._id });
  await makeUser({ name: 'Admin B', email: 'admin@b.test', role: 'admin', clinic: clinicB._id });

  adminAgent = await loginAs('admin@a.test', 'Password123!');
  recepAgent = await loginAs('recep@a.test', 'Password123!');
  clinicBAgent = await loginAs('admin@b.test', 'Password123!');
}, 60000);

afterAll(async () => {
  await stopMemoryDB();
});

describe('auth & RBAC', () => {
  itDB('unauthenticated request → 401', async () => {
    const res = await request(app).get('/api/queues');
    expect(res.status).toBe(401);
  });

  itDB('receptionist → 403 on admin routes', async () => {
    const res = await recepAgent.get('/api/admin/users');
    expect(res.status).toBe(403);
  });

  itDB('admin can reach admin routes', async () => {
    const res = await adminAgent.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  itDB('password change works and old password stops working', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'recep@a.test', password: 'Password123!' });
    const bad = await agent.patch('/api/auth/password').send({
      currentPassword: 'wrong',
      newPassword: 'Newpass123!',
    });
    expect(bad.status).toBe(401);
    const ok = await agent.patch('/api/auth/password').send({
      currentPassword: 'Password123!',
      newPassword: 'Newpass123!',
    });
    expect(ok.status).toBe(200);
    // restore for other tests
    const back = await agent.patch('/api/auth/password').send({
      currentPassword: 'Newpass123!',
      newPassword: 'Password123!',
    });
    expect(back.status).toBe(200);
  });
});

// A dedicated queue keeps the concurrency tests hermetic without wiping
// the clinic/users other suites rely on.
let queueRace;

async function ensureRaceQueue() {
  if (queueRace) return queueRace;
  const sd = getServiceDate('Asia/Karachi');
  queueRace = await Queue.create({
    clinic: clinicA._id,
    name: 'Race Queue',
    prefix: 'R',
    serviceDate: sd,
  });
  return queueRace;
}

describe('token registration concurrency', () => {
  itDB('(a) 20 concurrent registrations → distinct tokenNumbers, seqs 1..20', async () => {
    const q = await ensureRaceQueue();
    const cookie = await cookieFor('recep@a.test', 'Password123!');
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        withCookie(cookie).post(`/api/queues/${q._id}/tokens`).send({
          subject: { name: `Patient ${i}`, phone: '03000000000' },
        })
      )
    );
    for (const r of results) {
      expect(r.status).toBe(201);
    }
    const numbers = results.map((r) => r.body.data.token.tokenNumber);
    expect(new Set(numbers).size).toBe(20);
    const seqs = (await Token.find({ queue: q._id }).select('seq').lean())
      .map((t) => t.seq)
      .sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(numbers).toContain('R001');
    expect(numbers).toContain('R020');
  }, 60000);
});

describe('call-next concurrency', () => {
  itDB('(b) 5 concurrent call-next → 5 distinct tokens claimed', async () => {
    const q = await ensureRaceQueue();
    const cookie = await cookieFor('recep@a.test', 'Password123!');
    const waiting = await Token.find({ queue: q._id, status: 'waiting' });
    expect(waiting.length).toBeGreaterThanOrEqual(5);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => withCookie(cookie).post(`/api/queues/${q._id}/call-next`).send({}))
    );
    for (const r of results) {
      expect(r.status).toBe(200);
    }
    const claimed = results.map((r) => r.body.data.token.tokenNumber);
    expect(new Set(claimed).size).toBe(5);
    for (const r of results) {
      expect(r.body.data.token.status).toBe('called');
    }
  }, 60000);

  itDB('(f) empty queue call-next → 404 "No waiting patients"', async () => {
    const q = await ensureRaceQueue();
    // claim everything left
    for (;;) {
      const r = await recepAgent.post(`/api/queues/${q._id}/call-next`).send({});
      if (r.status === 404) break;
      expect(r.status).toBe(200);
    }
    const empty = await recepAgent.post(`/api/queues/${q._id}/call-next`).send({});
    expect(empty.status).toBe(404);
    expect(empty.body.message).toMatch(/no waiting patients/i);
  }, 60000);
});

describe('status transitions over HTTP', () => {
  itDB('(c) valid transition succeeds; invalid → 409', async () => {
    const q = await ensureRaceQueue();
    const reg = await recepAgent.post(`/api/queues/${q._id}/tokens`).send({
      subject: { name: 'Transition Patient' },
    });
    expect(reg.status).toBe(201);
    const tokenId = reg.body.data.token._id;

    // waiting -> called (valid)
    const called = await recepAgent.patch(`/api/tokens/${tokenId}/call`).send({});
    expect(called.status).toBe(200);
    expect(called.body.data.token.status).toBe('called');

    // called -> completed is INVALID (must go through serving)
    const bad = await recepAgent.patch(`/api/tokens/${tokenId}/complete`).send({});
    expect(bad.status).toBe(409);

    // called -> serving -> completed (valid chain)
    expect((await recepAgent.patch(`/api/tokens/${tokenId}/start-serving`).send({})).status).toBe(200);
    const done = await recepAgent.patch(`/api/tokens/${tokenId}/complete`).send({});
    expect(done.status).toBe(200);
    expect(done.body.data.token.status).toBe('completed');

    // completed -> anything is invalid
    const after = await recepAgent.patch(`/api/tokens/${tokenId}/cancel`).send({});
    expect(after.status).toBe(409);
  }, 60000);
});

describe('clinic isolation', () => {
  itDB('(e) clinic-B admin cannot see clinic-A token (404)', async () => {
    const tokenA = await Token.findOne({ clinic: clinicA._id }).select('_id').lean();
    expect(tokenA).toBeTruthy();
    const res = await clinicBAgent.get(`/api/tokens/${tokenA._id}`);
    expect(res.status).toBe(404);
  });

  itDB('(e) clinic-B admin sees no clinic-A queues', async () => {
    const res = await clinicBAgent.get('/api/queues');
    expect(res.status).toBe(200);
    const ids = (res.body.data.queues || []).map((q) => String(q._id));
    expect(ids).not.toContain(String(queueA._id));
    expect(ids).toContain(String(queueB._id));
  });
});

describe('analytics', () => {
  itDB('GET /api/analytics/queue returns computed metrics', async () => {
    const res = await recepAgent.get('/api/analytics/queue');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toHaveProperty('servedPerDay');
    expect(d).toHaveProperty('peakHours');
    expect(d).toHaveProperty('volumeByQueue');
    expect(d.totals).toHaveProperty('served');
    expect(Array.isArray(d.servedPerDay)).toBe(true);
    expect(d.peakHours).toHaveLength(24);
  });

  itDB('rejects malformed date range', async () => {
    const res = await recepAgent.get('/api/analytics/queue?from=not-a-date');
    expect(res.status).toBe(400);
  });
});
