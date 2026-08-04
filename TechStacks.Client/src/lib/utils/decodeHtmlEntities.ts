/**
 * Decodes HTML entities (e.g. "&amp;" -> "&") in text pulled from the API,
 * which is HTML-escaped for safe rendering but needs to be plain text when
 * reused elsewhere, e.g. a tweet intent or a rendered image.
 *
 * Browser-only: relies on the DOM to do the actual decoding.
 */
export function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}
