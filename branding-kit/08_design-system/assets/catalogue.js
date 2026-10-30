(() => {
  const byId = (id) => document.getElementById(id);
  const notice = byId('notice');
  let noticeTimer;
  let conversionTimer;
  let running = false;
  const panels = ['demo-files', 'demo-formats', 'demo-results'];
  const themeToggle = byId('theme-toggle');
  const themeStorageKey = 'multi-converter-design-theme';
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    themeToggle.textContent = theme === 'dark' ? 'Mode clair' : 'Mode sombre';
    document.querySelectorAll('.swatch').forEach((swatch, index) => {
      const color = getComputedStyle(swatch.firstElementChild).backgroundColor.match(/[0-9.]+/g);
      if (color) swatch.querySelector('code').textContent = '#' + color.slice(0,3).map(value => Number(value).toString(16).padStart(2,'0')).join('').toUpperCase();
      if (index === 3) swatch.querySelector('strong').textContent = theme === 'dark' ? 'Vert signature' : 'Orange signature';
    });
  }
  let initialTheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  try { const saved = localStorage.getItem(themeStorageKey); if (saved === 'light' || saved === 'dark') initialTheme = saved; } catch { /* Storage is optional in sandboxed previews. */ }
  const requestedTheme = new URLSearchParams(location.search).get('theme');
  if (requestedTheme === 'light' || requestedTheme === 'dark') initialTheme = requestedTheme;
  applyTheme(initialTheme);
  themeToggle.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try { localStorage.setItem(themeStorageKey, theme); } catch { /* Preview still works without persistence. */ }
  });
  const menuToggle = byId('menu-toggle');
  const navigation = byId('brand-navigation');
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(expanded));
    navigation.classList.toggle('is-open', expanded);
  });
  navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    navigation.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));
  function showNotice(message) {
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 3500);
  }
  function showStep(step) {
    if (running) {
      showNotice('Annulez la démonstration en cours avant de changer d’étape.');
      return;
    }
    panels.forEach((id, index) => { byId(id).hidden = index !== step - 1; });
    document.querySelectorAll('[data-step]').forEach((button) => {
      if (Number(button.dataset.step) === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }
  document.querySelectorAll('[data-notice]').forEach((button) => {
    button.addEventListener('click', () => showNotice(button.dataset.notice));
  });
  document.querySelectorAll('[data-step],[data-next]').forEach((button) => {
    button.addEventListener('click', () => showStep(Number(button.dataset.step || button.dataset.next)));
  });
  const qualityDescriptions = {
    Compact: 'Compact : réduire le poids en acceptant une fidélité moindre.',
    Équilibré: 'Équilibré : un compromis entre poids et fidélité.',
    Archivage: 'Archivage : privilégier la fidélité ; le poids peut augmenter.',
  };
  document.querySelectorAll('input[name="quality"]').forEach((input) => {
    input.addEventListener('change', () => { byId('quality-help').textContent = qualityDescriptions[input.value]; });
  });
  byId('run-demo').addEventListener('click', () => {
    showStep(3);
    running = true;
    let progress = 0;
    byId('demo-heading').textContent = 'Conversion simulée';
    byId('demo-progress').value = 0;
    byId('demo-status').textContent = 'Démonstration en cours. Aucun fichier n’est traité.';
    byId('cancel-demo').hidden = false;
    byId('restart-demo').hidden = true;
    conversionTimer = setInterval(() => {
      progress = Math.min(100, progress + 10);
      byId('demo-progress').value = progress;
      if (progress === 100) {
        clearInterval(conversionTimer);
        running = false;
        byId('demo-heading').textContent = 'Un résultat facile à retrouver.';
        byId('demo-status').textContent = 'Démonstration terminée — aucun fichier n’a été converti.';
        byId('cancel-demo').hidden = true;
        byId('restart-demo').hidden = false;
      }
    }, 180);
  });
  byId('cancel-demo').addEventListener('click', () => {
    clearInterval(conversionTimer);
    running = false;
    byId('demo-heading').textContent = 'Démonstration annulée';
    byId('demo-status').textContent = 'Aucun fichier traité. Vous pouvez reprendre le parcours.';
    byId('cancel-demo').hidden = true;
    byId('restart-demo').hidden = false;
  });
  const dialog = byId('ocr-dialog');
  const trigger = byId('open-ocr');
  trigger.addEventListener('click', () => {
    byId('ocr-status').textContent = '';
    dialog.showModal();
    byId('close-ocr').focus();
  });
  byId('close-ocr').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => trigger.focus());
  byId('copy-ocr').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(byId('ocr-text').value);
      byId('ocr-status').textContent = 'Texte copié.';
    } catch {
      byId('ocr-text').focus();
      byId('ocr-text').select();
      byId('ocr-status').textContent = 'Copie automatique indisponible. Copiez la sélection avec votre raccourci habituel.';
    }
  });
})();
