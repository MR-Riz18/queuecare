/**
 * Pure-logic tests — no database required.
 * (a) The status transition table matches the locked state machine.
 */
const { TRANSITIONS } = require('../controllers/tokenController');

// The state machine from STAGE1_NOTES.md. `called -> called` is the recall.
const VALID = [
  ['waiting', 'called'],
  ['waiting', 'cancelled'],
  ['called', 'called'], // recall
  ['called', 'serving'],
  ['called', 'skipped'],
  ['called', 'cancelled'],
  ['serving', 'completed'],
  ['serving', 'skipped'],
  ['skipped', 'waiting'], // return to queue
  ['skipped', 'cancelled'],
];

const STATUSES = ['waiting', 'called', 'serving', 'completed', 'skipped', 'cancelled'];

describe('token status transition table', () => {
  test('exports a transition list for every status', () => {
    for (const s of STATUSES) {
      expect(Array.isArray(TRANSITIONS[s])).toBe(true);
    }
  });

  test.each(VALID)('valid: %s -> %s is allowed', (from, to) => {
    expect(TRANSITIONS[from]).toContain(to);
  });

  test('invalid transitions are NOT in the table (table-driven)', () => {
    const validSet = new Set(VALID.map(([f, t]) => `${f}>${t}`));
    const invalid = [];
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (!validSet.has(`${from}>${to}`)) invalid.push([from, to]);
      }
    }
    expect(invalid.length).toBeGreaterThan(0); // sanity: there are invalid pairs
    for (const [from, to] of invalid) {
      expect(TRANSITIONS[from]).not.toContain(to);
    }
  });

  test('completed and cancelled are terminal', () => {
    expect(TRANSITIONS.completed).toEqual([]);
    expect(TRANSITIONS.cancelled).toEqual([]);
  });
});
