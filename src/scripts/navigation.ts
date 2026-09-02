const initNavigation = (): void => {
  const header =
    document.querySelector<HTMLElement>('[data-site-header]');

  const toggle =
    document.querySelector<HTMLButtonElement>('[data-menu-toggle]');

  const nav =
    document.querySelector<HTMLElement>('[data-site-nav]');

  if (!header || !toggle || !nav) {
    return;
  }

  if (header.dataset.navigationReady === 'true') {
    return;
  }

  header.dataset.navigationReady = 'true';


  const closeMenu = (): void => {
    header.classList.remove('menu-is-open');

    document.documentElement.classList.remove(
      'mobile-menu-open'
    );

    toggle.setAttribute(
      'aria-expanded',
      'false'
    );

    toggle.setAttribute(
      'aria-label',
      'Ouvrir le menu'
    );
  };


  const openMenu = (): void => {
    header.classList.add('menu-is-open');

    document.documentElement.classList.add(
      'mobile-menu-open'
    );

    toggle.setAttribute(
      'aria-expanded',
      'true'
    );

    toggle.setAttribute(
      'aria-label',
      'Fermer le menu'
    );
  };


  toggle.addEventListener('click', () => {
    if (header.classList.contains('menu-is-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });


  nav
    .querySelectorAll<HTMLAnchorElement>('a')
    .forEach((link) => {
      link.addEventListener('click', closeMenu);
    });


  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });


  const desktop =
    window.matchMedia('(min-width:761px)');

  const handleDesktopChange = (
    event: MediaQueryListEvent
  ): void => {
    if (event.matches) {
      closeMenu();
    }
  };

  desktop.addEventListener(
    'change',
    handleDesktopChange
  );
};


initNavigation();

document.addEventListener(
  'astro:page-load',
  initNavigation
);
