/**
 * Service-date helpers.
 *
 * The "service day" for a clinic is computed in the clinic's own timezone
 * (clinic.timezone, e.g. "Asia/Karachi"). Token numbering, queue counters and
 * dashboard stats all roll over at the service-date boundary, not the server's
 * local day. Implemented with Intl.DateTimeFormat so no timezone offset math
 * is needed.
 */

/**
 * Format a JS Date as YYYY-MM-DD in the given IANA timezone.
 */
function formatInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Get today's service date (YYYY-MM-DD) for a clinic.
 * @param {string} timezone IANA timezone, e.g. "Asia/Karachi"
 * @param {Date} [at] optional reference date (defaults to now)
 */
function getServiceDate(timezone, at = new Date()) {
  return formatInTimezone(at, timezone);
}

/**
 * Range filter for Mongoose on a timestamp field for a given service date.
 * Returns { $gte: startOfDayUtc, $lt: startOfNextDayUtc } approximations.
 * Note: service-day boundaries are timezone-relative; for token lifecycle we
 * always query by the stored `serviceDate` string instead — this helper is
 * only for ad-hoc date math on createdAt-style fields.
 */
function dayBoundsUTC(date, timezone) {
  // Conservative UTC window that fully contains the local day.
  const d = new Date(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 2);
  void timezone;
  return { $gte: new Date(start.getTime() - 14 * 3600 * 1000), $lt: end };
}

module.exports = { formatInTimezone, getServiceDate, dayBoundsUTC };
