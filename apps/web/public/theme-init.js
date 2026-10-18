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
  // "oled" was the black dark of the previous version, which is now the only dark.
  if (preference === 'oled') preference = 'dark';
  const fixed = preference === 'light' || preference === 'dark';
  const theme = fixed ? preference : systemDark ? 'dark' : 'light';
  const barColor = { light: '#12285A', dark: '#1E3A8A' };
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', barColor[theme]);
})();
