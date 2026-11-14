(() => {
  const navButton = document.querySelector('[data-menu-toggle]');
  const navLinks = document.querySelector('[data-nav-links]');
  if (navButton && navLinks) {
    navButton.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navButton.setAttribute('aria-expanded', String(isOpen));
      navButton.textContent = isOpen ? 'Close' : 'Menu';
    });
  }

  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.copy);
      if (!target || !navigator.clipboard) return;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        const original = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => { button.textContent = original; }, 1600);
      } catch {
        button.textContent = 'Select & copy';
      }
    });
  });

  const search = document.querySelector('[data-tool-search]');
  const category = document.querySelector('[data-tool-category]');
  const rows = Array.from(document.querySelectorAll('[data-tool-row]'));
  if (search && category && rows.length) {
    const counter = document.querySelector('[data-tool-count]');
    const empty = document.querySelector('[data-tool-empty]');
    function filter() {
      const term = search.value.trim().toLowerCase();
      const selected = category.value;
      let shown = 0;
      for (const row of rows) {
        const match = (!term || row.textContent.toLowerCase().includes(term)) &&
          (selected === 'all' || row.dataset.group === selected);
        row.hidden = !match;
        if (match) shown++;
      }
      if (counter) counter.textContent = `${shown} of ${rows.length} tools shown`;
      if (empty) empty.hidden = shown !== 0;
    }
    search.addEventListener('input', filter);
    category.addEventListener('change', filter);
    filter();
  }
})();
