/**
 * Socket.IO tests: handshake auth, display-key validation, reconnect sync
 * primitives, and public-safety of display payloads.
 * The first two tests need NO database; the display-room broadcast test is
 * DB-gated and skips gracefully without mongodb-memory-server.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';

const http = require('http');
const { io: ioClient } = require('socket.io-client');
const { startMemoryDB, stopMemoryDB, dbAvailable } = require('./setup');

// Build a dedicated Socket.IO server for these tests (separate from the one
// server.js attaches at require time).
const { initSocket, projectForDisplay } = require('../socket');
const { emit } = require('../socket/events');
require('./models'); // register all Mongoose models for populate()

let httpServer;
let url;

beforeAll(async () => {
  httpServer = http.createServer();
  initSocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${httpServer.address().port}`;
  await startMemoryDB();
}, 60000);

afterAll(async () => {
  await new Promise((resolve) => httpServer.close(resolve));
  await stopMemoryDB();
});

function connectClient(auth, extra = {}) {
  return ioClient(url, {
    auth,
    reconnection: false,
    timeout: 5000,
    ...extra,
  });
}

describe('socket handshake auth (no DB required)', () => {
  test('(h) staff socket with no cookie is rejected', async () => {
    const socket = connectClient({});
    const err = await new Promise((resolve) => {
      socket.on('connect_error', resolve);
      socket.on('connect', () => resolve(null));
    });
    expect(err).toBeTruthy();
    expect(String(err.message)).toMatch(/authenticated|log in/i);
    socket.close();
  });

  test('(h) staff socket with a bad JWT cookie is rejected', async () => {
    const socket = connectClient({}, { extraHeaders: { cookie: 'token=garbage' } });
    const err = await new Promise((resolve) => {
      socket.on('connect_error', resolve);
      socket.on('connect', () => resolve(null));
    });
    expect(err).toBeTruthy();
    socket.close();
  });

  test('(h) display handshake (role=display) connects without a cookie', async () => {
    const socket = connectClient({ role: 'display' });
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    expect(socket.connected).toBe(true);
    socket.close();
  });

  test('(h) display join with malformed key → display:error (no DB lookup)', async () => {
    const socket = connectClient({ role: 'display' });
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    const errPayload = await new Promise((resolve) => {
      socket.on('display:error', resolve);
      socket.emit('queue:join', { role: 'display', displayKey: 'not-a-valid-key' });
    });
    expect(errPayload.message).toMatch(/invalid display key/i);
    socket.close();
  });
});

describe('display payload public-safety (no DB required)', () => {
  test('(h) projectForDisplay strips private fields', () => {
    const staffPayload = {
      tokenId: 'abc123',
      tokenNumber: 'G042',
      queueId: 'q1',
      roomId: 'r2',
      roomName: 'Room 2',
      status: 'called',
      at: '2026-10-15T10:00:00.000Z',
      subject: { name: 'Secret Patient', phone: '03001234567', note: 'HIV follow-up' },
    };
    const projected = projectForDisplay(staffPayload);
    expect(projected).toEqual({
      tokenNumber: 'G042',
      roomName: 'Room 2',
      calledAt: '2026-10-15T10:00:00.000Z',
    });
    expect(JSON.stringify(projected)).not.toMatch(/Secret Patient|03001234567|HIV/);
  });
});

describe('display room broadcast (DB-gated)', () => {
  test('(h) token:called reaches a subscribed display room, public-safe only', async () => {
    if (!dbAvailable()) {
      console.log('  ⊘ skipped: no in-memory MongoDB');
      return;
    }
    const Clinic = require('../models/Clinic');
    const Queue = require('../models/Queue');
    const Token = require('../models/Token');

    const clinic = await Clinic.create({
      name: 'Socket Test Clinic',
      facilityType: 'clinic',
      timezone: 'Asia/Karachi',
      settings: {},
    });
    const displayKey = clinic.settings.displayKey;
    expect(displayKey).toMatch(/^[0-9a-f]{32}$/);

    const queue = await Queue.create({
      clinic: clinic._id,
      name: 'General',
      prefix: 'G',
      serviceDate: '2026-10-15',
    });
    const token = await Token.create({
      tokenNumber: 'G001',
      queue: queue._id,
      clinic: clinic._id,
      serviceDate: '2026-10-15',
      seq: 1,
      subject: { name: 'Private Patient', phone: '03009998888', note: 'sensitive' },
      status: 'called',
      calledAt: new Date(),
    });

    const socket = connectClient({ role: 'display' });
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    // Join the display room; the server answers with a snapshot first.
    const snapshot = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no display:snapshot')), 5000);
      socket.on('display:snapshot', (s) => {
        clearTimeout(timer);
        resolve(s);
      });
      socket.on('display:error', (e) => reject(new Error('display:error: ' + e.message)));
      socket.emit('queue:join', { role: 'display', displayKey });
    });
    expect(snapshot.clinicName).toBe('Socket Test Clinic');

    // Simulate what a controller does after committing a call.
    const received = await new Promise((resolve) => {
      socket.on('token:called', resolve);
      emit('token:called', {
        tokenId: String(token._id),
        tokenNumber: 'G001',
        queueId: String(queue._id),
        roomId: null,
        roomName: 'Room 1',
        calledAt: new Date().toISOString(),
      });
    });
    expect(received.tokenNumber).toBe('G001');
    expect(received.roomName).toBe('Room 1');
    const raw = JSON.stringify(received);
    expect(raw).not.toMatch(/Private Patient|03009998888|sensitive/);
    socket.close();

    await Token.deleteMany({ clinic: clinic._id });
    await Queue.deleteMany({ clinic: clinic._id });
    await Clinic.deleteOne({ _id: clinic._id });
  }, 30000);
});
