/**
 * httpOnly cookie helpers for the JWT access token (cookie name: `token`).
 * SameSite=lax so top-level navigation keeps the session; secure only in
 * production so local http:// development works.
 */

const COOKIE_NAME = 'token';
const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h — matches JWT_EXPIRE=8h

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
    path: '/',
  };
}

function setTokenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearTokenCookie(res) {
  // Express 5 deprecates passing maxAge to clearCookie (it expires the
  // cookie automatically). Omit it, but keep path/sameSite/secure/httpOnly
  // so the cleared cookie still matches the one that was set.
  const { maxAge: _maxAge, ...clearOptions } = cookieOptions();
  res.clearCookie(COOKIE_NAME, clearOptions);
}

module.exports = { COOKIE_NAME, setTokenCookie, clearTokenCookie };
