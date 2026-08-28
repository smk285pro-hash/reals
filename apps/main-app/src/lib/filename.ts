/**
 * A filename reaches the download layer from user-uploaded product files, so it
 * is treated as untrusted input for the quoted `Content-Disposition` value.
 * Rather than listing the characters to strip, keep only a known-safe set:
 * letters, digits, spaces, and the punctuation that legitimately appears in
 * release filenames. Everything else — quotes, backslashes, path separators,
 * semicolons, control characters, non-ASCII — becomes an underscore.
 *
 * Kept free of any environment or SDK import so it can be tested on its own.
 */
export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[^A-Za-z0-9 ._()-]/g, '_')
    // Only runs of literal spaces collapse; underscores are left alone so a
    // stripped sequence stays visible as the several characters it replaced.
    .replace(/ {2,}/g, ' ')
    .trim()

  // A name of nothing but separators carries no information, so fall back rather
  // than handing the browser something like "___".
  return /[A-Za-z0-9]/.test(cleaned) ? cleaned : 'download'
}
