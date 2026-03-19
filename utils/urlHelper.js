/**
 * @fileoverview URL construction helpers for the MuzaLife backend.
 *
 * Utility functions for normalising resource URLs.  Relative paths stored in
 * the database (e.g. `/uploads/products/image.jpg`) are converted to
 * absolute URLs before they are sent to the client, so the frontend never
 * needs to know the server hostname.
 *
 * @module utils/urlHelper
 */

/**
 * Builds a fully-qualified URL from a (possibly relative) image path.
 *
 * If `imagePath` is already absolute (`http://…` or `https://…`) it is
 * returned unchanged.  Otherwise the protocol and host are taken from the
 * current Express request object and prepended to the path.
 *
 * **Why this exists:** product images are stored as relative paths in the
 * database so the server can be deployed to any domain without a data
 * migration.  This helper is called in every controller that returns image
 * URLs to the client.
 *
 * @param {Object} req       - The current Express request
 *   (used to read `req.protocol` and the `Host` header).
 * @param {string|null|undefined}     imagePath - Relative or absolute image
 *   path retrieved from the database.
 * @returns {string|null} A fully-qualified URL, or `null` if `imagePath` is
 *   falsy (i.e. no image is associated with the resource).
 *
 * @example
 * // Relative path → absolute URL
 * constructFullUrl(req, '/uploads/products/42/cover.jpg');
 * // => 'https://localhost:5001/uploads/products/42/cover.jpg'
 *
 * @example
 * // Already-absolute URL passed through unchanged
 * constructFullUrl(req, 'https://cdn.example.com/image.png');
 * // => 'https://cdn.example.com/image.png'
 *
 * @example
 * // Null/undefined → null
 * constructFullUrl(req, null);
 * // => null
 */
export const constructFullUrl = (req, imagePath) => {
  if (!imagePath) {return null;}

  // If it's already a full URL (http:// or https://), return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }

  // If it's a relative path, construct the full URL
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}${imagePath}`;
};
