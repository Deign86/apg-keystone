import '@testing-library/jest-dom/vitest';

// jsdom leaves out a few browser APIs the screens use; stand-ins so the screens render.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

window.scrollTo = () => {};

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}

if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', { configurable: true, writable: true, value: class { observe() {} unobserve() {} disconnect() {} } });
}
