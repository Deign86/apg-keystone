// Runs in the page before Keystone's own code (web({ initScripts }) in e2e.config.ts). It starts every test's clock
// at 10:00 on Monday, Nov 2, 2026 in Manila, and lets it tick from there. Overdue statements, IDs issued this month,
// the greeting and every new document's date then read the same on every run, whatever the real date is.
(() => {
  const RealDate = Date;
  const offset = RealDate.parse('2026-11-02T10:00:00+08:00') - RealDate.now();

  class TestDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }

    static now() {
      return RealDate.now() + offset;
    }
  }

  globalThis.Date = TestDate;
})();
