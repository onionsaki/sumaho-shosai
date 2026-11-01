// Google Books: covers only, after openBD and Rakuten (鬼さん 2026-11-01). Like Rakuten, the API key is the
// user's own and stays on the phone (settings), never in this public repo or in backups.

export const googleBooksIsbnUrl = (isbn, key) =>
  `https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({ q: `isbn:${isbn}`, key, fields: 'items(volumeInfo/imageLinks)' })}`;

// The thumbnail comes as http:// with a curled-page effect; ask for https and a flat picture.
export function parseGoogleCover(json) {
  const links = json?.items?.[0]?.volumeInfo?.imageLinks;
  const url = String(links?.thumbnail || links?.smallThumbnail || '');
  return url ? url.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : '';
}
