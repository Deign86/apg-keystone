// A phone or a tablet, for the mobile suite (e2e.mobile.config.ts): Chromium at a phone's or tablet's size, saying it is
// one in its user agent, and worked by a finger. The engine cannot switch Chromium's own touch emulation on, so the
// page is told what a touch screen tells it, before Keystone's code runs: the main pointer is coarse (what
// @keystone/ui's watchTouch reads, which gives every control its 44px), and the screen takes five touch points.

/** An iPhone's Safari, which installs a web app from its Share menu. */
export const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

/** An Android tablet's Chrome, which installs a web app from its own dialog. */
export const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export const touchScreen = `(() => {
  const coarse = /\\(\\s*(any-)?pointer\\s*:\\s*coarse\\s*\\)|\\(\\s*(any-)?hover\\s*:\\s*none\\s*\\)/;
  const ask = window.matchMedia.bind(window);

  window.matchMedia = (query) => {
    if (!coarse.test(query)) return ask(query);

    return {
      matches: true, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      dispatchEvent: () => false,
    };
  };
  Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true });
})();`;

/** The sizes a phone or tablet shows Keystone at, upright and on its side, as width × height in CSS px. */
export const SIZES = [
  [320, 640], [360, 740], [375, 812], [390, 844], [414, 896], [768, 1024], [1024, 768],
  [640, 320], [740, 360], [812, 375], [844, 390], [896, 414], [1024, 1366], [1366, 1024],
] as const;
