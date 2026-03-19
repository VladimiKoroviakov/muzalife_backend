/**
 * @fileoverview Living documentation for {@link module:utils/urlHelper}.
 *
 * Each test is a specification of one behaviour of `constructFullUrl`.
 * The test names are intentionally written as plain English sentences so that
 * the Vitest reporter output reads like a prose specification.
 *
 * @module tests/docs/urlHelper.docs
 */

import { describe, it, expect } from 'vitest';
import { constructFullUrl } from '../../utils/urlHelper.js';

/** Helper: build a minimal Express-like request stub */
const makeReq = ({ protocol = 'https', host = 'localhost:5001' } = {}) => ({
  protocol,
  get: (header) => (header === 'host' ? host : undefined),
});

// ─────────────────────────────────────────────────────────────────────────────
// Null / falsy inputs
// ─────────────────────────────────────────────────────────────────────────────
describe('constructFullUrl — falsy imagePath', () => {
  it('returns null when imagePath is null', () => {
    expect(constructFullUrl(makeReq(), null)).toBeNull();
  });

  it('returns null when imagePath is undefined', () => {
    expect(constructFullUrl(makeReq(), undefined)).toBeNull();
  });

  it('returns null when imagePath is an empty string', () => {
    expect(constructFullUrl(makeReq(), '')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Already-absolute URLs (pass-through behaviour)
// ─────────────────────────────────────────────────────────────────────────────
describe('constructFullUrl — already-absolute URL', () => {
  it('returns an https:// URL unchanged', () => {
    const url = 'https://cdn.example.com/image.png';
    expect(constructFullUrl(makeReq(), url)).toBe(url);
  });

  it('returns an http:// URL unchanged', () => {
    const url = 'http://legacy.example.com/photo.jpg';
    expect(constructFullUrl(makeReq(), url)).toBe(url);
  });

  it('does not prepend server origin to an already-absolute URL', () => {
    const url = 'https://external.cdn.net/asset.webp';
    const result = constructFullUrl(makeReq(), url);
    expect(result).not.toContain('localhost');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Relative paths → absolute URL construction
// ─────────────────────────────────────────────────────────────────────────────
describe('constructFullUrl — relative path → absolute URL', () => {
  it('prepends protocol and host to a /uploads/… path', () => {
    const req = makeReq({ protocol: 'https', host: 'localhost:5001' });
    const result = constructFullUrl(req, '/uploads/products/42/cover.jpg');

    expect(result).toBe('https://localhost:5001/uploads/products/42/cover.jpg');
  });

  it('uses the protocol from req.protocol', () => {
    const req = makeReq({ protocol: 'http', host: 'localhost:5001' });
    const result = constructFullUrl(req, '/images/foo.jpg');

    expect(result).toMatch(/^http:\/\//);
    expect(result).not.toMatch(/^https:\/\//);
  });

  it('uses the host from req.get("host")', () => {
    const req = makeReq({ protocol: 'https', host: 'api.muzalife.com' });
    const result = constructFullUrl(req, '/uploads/x.jpg');

    expect(result).toContain('api.muzalife.com');
  });

  it('preserves deep nested paths', () => {
    const req = makeReq();
    const path = '/uploads/products/42/gallery/slide-1.webp';
    expect(constructFullUrl(req, path)).toBe(`https://localhost:5001${path}`);
  });
});
