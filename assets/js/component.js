// component.js — v3 (double-load guard)
// ─────────────────────────────────────────────────────────────────
// WHAT CHANGED IN v3:
//   A guard at the top of the file sets a flag on window the first
//   time the script runs. If the browser tries to execute it a
//   second time (because it is referenced twice in the HTML), the
//   guard bails out immediately. This completely prevents the
//   double-header-load bug that breaks the theme toggle.
// ─────────────────────────────────────────────────────────────────

// ── Double-load guard ─────────────────────────────────────────────
// If this script has already run once, do nothing and exit.
if (window.__cedricComponentsLoaded) {
  // Uncomment the line below while debugging if you want confirmation:
  // console.warn('[components] Blocked duplicate load of component.js');
} else {
  window.__cedricComponentsLoaded = true;
  runComponents();
}

function runComponents() {

  /**
   * Fetch an HTML file, inject it into `container`, then re-execute
   * every <script> and hoist every <style> to <head>.
   */
  async function loadComponent(file, container) {
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error(
        `[components] "${file}" — HTTP ${res.status} ${res.statusText}`
      );

      container.innerHTML = await res.text();

      // Hoist <style> tags into <head> so they apply globally
      container.querySelectorAll('style').forEach(style => {
        document.head.appendChild(style.cloneNode(true));
        style.remove();
      });

      // Re-execute <script> tags (innerHTML doesn't run them)
      container.querySelectorAll('script').forEach(oldScript => {
        const newScript = document.createElement('script');
        [...oldScript.attributes].forEach(attr =>
          newScript.setAttribute(attr.name, attr.value)
        );
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript);
        oldScript.remove();
      });

    } catch (err) {
      console.error(err);
    }
  }

  // ── Boot ────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {

    // 1. Header
    const headerSlot = document.getElementById('header-placeholder');
    if (headerSlot) {
      await loadComponent('header.html', headerSlot);

      // Re-assert the saved theme after the header script runs.
      // Prevents any race between the header's own theme logic
      // and the inline init script in <head>.
      const saved = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', saved);
    }

    // 2. Support widget
    const widgetRoot = document.createElement('div');
    widgetRoot.id = 'cedric-support-root';
    document.body.appendChild(widgetRoot);
    loadComponent('support-widget.html', widgetRoot);

  });

} // end runComponents