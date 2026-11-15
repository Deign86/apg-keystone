/**
 * Runs the test browser in a UTF-8 locale when the machine has none. A bare Linux container is POSIX (ASCII only), and
 * Chromium on Linux writes a download's name in the locale's encoding, falling back to "download" for one it cannot:
 * "Payroll Oct 16–31, 2026.pdf" has an en dash. CI's runners and desktops are UTF-8 already, so nothing changes there.
 * The browser inherits the runner's environment, so each config calls this before the run launches one.
 */
export function useUtf8Locale(env: NodeJS.ProcessEnv = process.env) {
  if (!/utf-?8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '')) env.LC_ALL = 'C.UTF-8';
}
