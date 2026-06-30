/**
 * Detect Smart TV / set-top-box browsers by user-agent.
 *
 * Covers: Samsung Tizen, LG webOS / NetCast, Android TV / Google TV,
 * Amazon Fire TV (AFT*), Roku, HbbTV, Viera, Bravia, Chromecast (crkey).
 *
 * Used to opt out of Permissions-Policy attributes on iframes — several TV
 * browser engines (Tizen 5.x, webOS 4.x) auto-sandbox cross-origin iframes
 * when they encounter an `allow` attribute they don't fully support, which
 * causes embedded players to display "remove sandbox attribute" and refuse
 * to play.  Stripping the `allow` attribute entirely on these platforms lets
 * the iframe load with the browser's own (permissive) defaults.
 */
export function isTVBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  return /tizen|webos|smart-tv|netcast|nettv|hbbtv|androidtv|crkey|googletv|viera|bravia|roku|aft[a-z]{0,3}\b/.test(ua);
}
