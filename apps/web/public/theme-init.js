// Runs before first paint so the page never flashes the wrong theme.
// Mirrors resolveTheme() in src/app/theme.ts; keep the two in sync.
(() => {
  let preference = 'system';
  try {
    preference = localStorage.getItem('finanz.theme') || 'system';
  } catch {
    // Storage blocked: follow the system setting.
  }
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = preference === 'dark' || (preference === 'system' && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0b1120' : '#f5f7fa');
})();
