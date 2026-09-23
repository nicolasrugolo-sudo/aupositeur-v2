(() => {
  const sidebar = document.getElementById('aup-sidebar');
  const overlay = document.getElementById('aup-overlay');
  const menuButton = document.getElementById('aup-menu-button');
  const title = document.getElementById('aup-header-title');
  const kicker = document.getElementById('aup-header-kicker');
  const links = [...document.querySelectorAll('[data-nav]')];

  const routes = [
    { test: /#\/collections\/citations|#\/edit\/citations\//, nav:'citations', kicker:'CONTENU / CITATIONS', title:'Citations' },
    { test: /#\/collections\/ecrits|#\/edit\/ecrits\//, nav:'ecrits', kicker:'CONTENU / ÉCRITS', title:'Écrits' },
    { test: /#\/collections\/musiques|#\/edit\/musiques\//, nav:'musiques', kicker:'CONTENU / MUSIQUES', title:'Musiques' },
    { test: /#\/collections\/livres|#\/edit\/livres\//, nav:'livres', kicker:'CONTENU / LIVRES', title:'Livres' },
    { test: /#\/edit\/pages\/home/, nav:'home', kicker:'SITE / ACCUEIL', title:'Page d’accueil' },
    { test: /#\/collections\/boutique|#\/edit\/boutique\//, nav:'boutique', kicker:'SITE / BOUTIQUE', title:'Boutique' },
    { test: /#\/edit\/settings\/site|#\/collections\/settings/, nav:'settings', kicker:'SITE / RÉGLAGES', title:'Réglages' },
  ];

  function syncNavigation() {
    const location = window.location.href;
    const route = routes.find((item) => item.test.test(location));
    const active = route?.nav || 'admin';
    links.forEach((link) => link.classList.toggle('is-active', link.dataset.nav === active));
    kicker.textContent = route?.kicker || 'AUPOSITEUR / STUDIO';
    title.textContent = route?.title || 'Administration';
    closeMenu();
  }

  function openMenu() {
    sidebar.classList.add('is-open');
    overlay.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    sidebar.classList.remove('is-open');
    overlay.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
  }

  menuButton.addEventListener('click', () => sidebar.classList.contains('is-open') ? closeMenu() : openMenu());
  overlay.addEventListener('click', closeMenu);
  window.addEventListener('hashchange', syncNavigation);
  window.addEventListener('popstate', syncNavigation);
  syncNavigation();
})();
