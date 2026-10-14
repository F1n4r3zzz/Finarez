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
  const fixed = preference === 'light' || preference === 'dark' || preference === 'oled';
  const theme = fixed ? preference : systemDark ? 'dark' : 'light';
  const barColor = { light: '#f5f7fa', dark: '#0b1120', oled: '#000000' };
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', barColor[theme]);
})();
