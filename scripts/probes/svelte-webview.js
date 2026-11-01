/* Runs only in the owned WebView probe, never imported by the desktop bundle. */
window.runMigrationProbe = async (theme, width) => {
  const checks = [];
  const check = (name, condition, detail = null) => checks.push({ name, passed: Boolean(condition), detail });
  const pause = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (predicate, label) => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (predicate()) return;
      await pause();
    }
    throw new Error('Timed out: ' + label);
  };
  const button = label => [...document.querySelectorAll('button')].find(node =>
    node.textContent.trim() === label || node.getAttribute('aria-label') === label);
  const press = (target, key) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const report = { theme, width, runtimeWidth: innerWidth, userAgent: navigator.userAgent, checks, errors: window.__migrationProbeErrors ?? [] };
  try {
    await until(() => button('Parcourir'), 'application mount');
    check('viewport is the requested width', Math.abs(innerWidth - width) <= 1, innerWidth);
    check('theme initialized from persisted preference', document.documentElement.dataset.theme === theme);
    check('reduced motion is exposed', matchMedia('(prefers-reduced-motion: reduce)').matches);
    await pause(120); // Let the host's native keyboard event reach the WebView process.
    const browse = button('Parcourir');
    browse.focus();
    check('keyboard focus indicator is available', browse.matches(':focus-visible'));
    browse.click();
    await until(() => document.querySelectorAll('.file-ticket').length === 2, 'file intake');
    check('both fixture files are mounted', document.querySelectorAll('.file-ticket').length === 2);
    button('Pr\u00e9parer la conversion').click();
    await until(() => document.querySelector('.format-card'), 'Formats');
    document.querySelector('.format-card').click();
    await until(() => document.querySelectorAll('[role="combobox"]').length === 2, 'Bits select');
    const trigger = document.querySelector('[role="combobox"]');
    check('select has resolvable accessible labels', trigger.getAttribute('aria-labelledby').split(' ').every(id => document.getElementById(id)?.textContent.trim()));
    trigger.focus();
    press(trigger, ' ');
    await until(() => document.querySelector('[role="listbox"]'), 'select opening');
    const menu = document.querySelector('[role="listbox"]');
    const bounds = menu.getBoundingClientRect();
    check('portaled menu stays inside viewport', bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.top >= -1 && bounds.bottom <= innerHeight + 1, { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom });
    check('menu uses theme surface', getComputedStyle(menu).backgroundColor === getComputedStyle(trigger).backgroundColor);
    press(document.activeElement, 'End');
    press(document.activeElement, 'Enter');
    await until(() => trigger.textContent.includes('Copier'), 'copy mode');
    check('copy mode removes encoding quality', document.querySelectorAll('[role="combobox"]').length === 1);
    check('selection restores trigger focus', document.activeElement === trigger);
    trigger.click();
    await until(() => document.querySelector('[role="listbox"]'), 'select reopening');
    press(document.activeElement, 'Escape');
    await until(() => !document.querySelector('[role="listbox"]'), 'menu Escape');
    check('menu Escape restores focus', document.activeElement === trigger);
    const apply = [...document.querySelectorAll('button')].find(node => /^Appliquer aux /.test(node.textContent.trim()));
    apply?.click();
    await pause();
    const action = button('Lancer la conversion');
    check('main action remains visible and enabled', action && !action.disabled && action.getBoundingClientRect().height >= 44);
    const primary = getComputedStyle(action);
    check('primary text is warm white', primary.color === 'rgb(255, 253, 247)', primary.color);
    check('primary background uses canonical role', primary.backgroundColor === (theme === 'dark' ? 'rgb(69, 118, 61)' : 'rgb(176, 90, 43)'), primary.backgroundColor);
    const settings = button('Param\u00e8tres');
    settings.focus(); settings.click();
    await until(() => document.querySelector('.settings-panel'), 'settings chunk and dialog');
    const panel = document.querySelector('.settings-panel');
    await until(() => panel.contains(document.activeElement), 'dialog initial focus');
    check('dialog owns initial focus', panel.contains(document.activeElement));
    press(document.activeElement, 'Escape');
    await until(() => !document.querySelector('.settings-panel'), 'dialog Escape');
    await pause(100);
    check('dialog restores original focus', document.activeElement === settings);
    check('dialog removes modal body state', !document.body.classList.contains('has-open-modal'));
    check('no horizontal document overflow', document.documentElement.scrollWidth <= innerWidth + 1, document.documentElement.scrollWidth);
    check('no captured runtime errors', report.errors.length === 0, report.errors);
  } catch (error) {
    check('complete interaction sequence', false, String(error));
  }
  report.passed = checks.every(item => item.passed);
  return report;
};
