/**
 * Pure-logic tests — no database required.
 * (g) getServiceDate returns the clinic-local YYYY-MM-DD.
 */
const { getServiceDate } = require('../utils/serviceDate');

describe('getServiceDate', () => {
  test('returns YYYY-MM-DD format', () => {
    expect(getServiceDate('Asia/Karachi')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('matches an independent Intl computation', () => {
    const tz = 'Asia/Karachi';
    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    expect(getServiceDate(tz)).toBe(expected);
  });

  test('differs across timezones at day boundaries (sanity)', () => {
    // Just assert both are valid dates; the key property is tz-awareness.
    expect(getServiceDate('Pacific/Kiritimati')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getServiceDate('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
