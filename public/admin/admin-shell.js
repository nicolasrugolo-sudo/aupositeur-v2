(() => {
  const sidebar = document.getElementById('aup-sidebar');
  const overlay = document.getElementById('aup-overlay');
  const menuButton = document.getElementById('aup-menu-button');
  const title = document.getElementById('aup-header-title');
  const kicker = document.getElementById('aup-header-kicker');
  const links = [...document.querySelectorAll('[data-nav]')];
  const account = document.getElementById('aup-account');
  const accountButton = document.getElementById('aup-account-button');
  const accountMenu = document.getElementById('aup-account-menu');
  const accountNative = document.getElementById('aup-account-native');
  const dashboard = document.getElementById('aup-dashboard');
  const draftsEl = document.getElementById('aup-drafts');
  const recentEl = document.getElementById('aup-recent');
  const draftCountEl = document.getElementById('aup-draft-count');
  let dashboardLoaded = false;

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
    const isDashboard = !window.location.hash || window.location.hash === '#/' || window.location.hash === '#';
    dashboard?.classList.toggle('is-visible', isDashboard);
    if (isDashboard) loadDashboard();
    closeMenu();
  }

  async function loadDashboard() {
    if (dashboardLoaded || !draftsEl || !recentEl) return;
    dashboardLoaded = true;
    const collections = [
      {name:'citations', label:'Citation'},
      {name:'ecrits', label:'Écrit'},
      {name:'musiques', label:'Musique'},
      {name:'livres', label:'Livre'},
      {name:'boutique', label:'Boutique'}
    ];
    const bases = {
      citations:'src/content/citations/', ecrits:'src/content/poemes/', musiques:'src/content/musiques/',
      livres:'src/content/livres/', boutique:'src/content/boutique/'
    };
    try {
      const treeResponse = await fetch('https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2/git/trees/main?recursive=1', {
        headers:{Accept:'application/vnd.github+json'}
      });
      if (!treeResponse.ok) throw new Error('GitHub tree');
      const tree = (await treeResponse.json()).tree || [];
      const files = tree.filter((item) => item.type === 'blob').flatMap((item) => {
        const entry = collections.find((col) => item.path.startsWith(bases[col.name]) && /\.md$/.test(item.path));
        return entry ? [{...item, collection:entry.name, type:entry.label}] : [];
      });

      const details = await Promise.all(files.map(async (item) => {
        const res = await fetch(`https://raw.githubusercontent.com/nicolasrugolo-sudo/aupositeur-v2/main/${item.path}`);
        const raw = res.ok ? await res.text() : '';
        const fm = raw.match(/^---\s*\n([\s\S]*?)\n---/);
        const front = fm?.[1] || '';
        const title = (front.match(/^(?:title|text):\s*["']?(.+?)["']?\s*$/m)?.[1] || item.path.split('/').pop().replace(/\.md$/,'')).trim();
        const draft = /^draft:\s*true\s*$/mi.test(front);
        const slug = item.path.split('/').pop().replace(/\.md$/,'');
        return {...item,title,draft,slug};
      }));

      const commitResponse = await fetch('https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2/commits?sha=main&per_page=40', {
        headers:{Accept:'application/vnd.github+json'}
      });
      const commits = commitResponse.ok ? await commitResponse.json() : [];
      const changedAt = new Map();
      await Promise.all(commits.slice(0,20).map(async (commit) => {
        const res = await fetch(commit.url, {headers:{Accept:'application/vnd.github+json'}});
        if (!res.ok) return;
        const full = await res.json();
        const date = full.commit?.committer?.date || full.commit?.author?.date || '';
        (full.files || []).forEach((file) => {
          if (!changedAt.has(file.filename)) changedAt.set(file.filename, date);
        });
      }));
      details.forEach((item) => { item.changedAt = changedAt.get(item.path) || ''; });

      const itemHtml = (item, showDate=false) => {
        const date = showDate && item.changedAt ? ` · ${formatDashboardDate(item.changedAt)}` : '';
        return `<div class="aup-dashboard-item"><div><strong>${escapeHtml(item.title)}</strong><small>${item.type}${date}</small></div><a href="/admin/#/collections/${item.collection}/entries/${encodeURIComponent(item.slug)}">Ouvrir →</a></div>`;
      };
      const drafts = details.filter((item) => item.draft).sort((a,b) => (b.changedAt || '').localeCompare(a.changedAt || '')).slice(0,6);
      draftCountEl.textContent = String(details.filter((item) => item.draft).length);
      draftsEl.innerHTML = drafts.length ? drafts.map((item) => itemHtml(item, true)).join('') : '<p class="aup-dashboard-empty">Aucun brouillon à reprendre.</p>';

      const recent = details.filter((item) => item.changedAt).sort((a,b) => b.changedAt.localeCompare(a.changedAt)).slice(0,6);
      recentEl.innerHTML = recent.length ? recent.map((item) => itemHtml(item, true)).join('') : '<p class="aup-dashboard-empty">Aucune modification récente trouvée.</p>';
    } catch {
      draftsEl.innerHTML = '<p class="aup-dashboard-empty">Les brouillons restent accessibles depuis chaque rubrique.</p>';
      recentEl.innerHTML = '<p class="aup-dashboard-empty">Impossible de charger les contenus récents pour le moment.</p>';
      draftCountEl.textContent = '—';
    }
  }

  function formatDashboardDate(value) {
    try {
      return new Intl.DateTimeFormat('fr-BE', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
    } catch { return ''; }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
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
  function markDecapRegions() {
    const root = document.getElementById('nc-root');
    if (!root) return;

    // Detect Decap's native top navigation by its visible labels rather than
    // generated class names. Hide it only on desktop, where the Shell replaces it.
    const candidates = [...root.querySelectorAll('a,button,[role="button"]')];
    const contentsControl = candidates.find((el) => el.textContent.trim() === 'Contents');
    const mediaControl = candidates.find((el) => el.textContent.trim() === 'Media');
    if (window.innerWidth >= 900 && contentsControl && mediaControl) {
      let topbar = contentsControl;
      while (topbar.parentElement && topbar.parentElement !== root) {
        const parent = topbar.parentElement;
        if (!parent.contains(mediaControl)) {
          topbar = parent;
          continue;
        }
        const rect = parent.getBoundingClientRect();
        topbar = parent;
        if (rect.width > root.getBoundingClientRect().width * .7 && rect.height < 100) break;
      }
      topbar.dataset.aupDecapTopbar = 'true';
    }

    // Keep Decap as the owner of authentication/logout. We only surface its
    // native account control from our Shell.
    const nativeAccount = candidates.find((el) => {
      const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
      const text = el.textContent.trim().toLowerCase();
      return label.includes('user') || label.includes('account') || label.includes('profile') ||
             text === 'log out' || text === 'logout';
    });
    if (nativeAccount && window.innerWidth >= 900) {
      nativeAccount.dataset.aupDecapNativeAccount = 'true';
      account.hidden = false;
      accountNative.onclick = () => {
        accountMenu.hidden = true;
        accountButton.setAttribute('aria-expanded','false');
        nativeAccount.click();
      };
    }

    if (window.innerWidth < 900) return;

    const headings = [...root.querySelectorAll('h1,h2,h3,h4')];
    const collectionsHeading = headings.find((el) => el.textContent.trim() === 'Collections');
    if (!collectionsHeading) {
      root.classList.remove('aup-decap-collection-nav-hidden');
      return;
    }

    // Walk upward only while the candidate stays reasonably small. This avoids
    // binding the Shell to Decap's generated CSS class names.
    let nav = collectionsHeading;
    while (nav.parentElement && nav.parentElement !== root) {
      const parent = nav.parentElement;
      const rect = parent.getBoundingClientRect();
      if (rect.width > 330 || rect.height > window.innerHeight * 0.85) break;
      nav = parent;
    }

    nav.dataset.aupDecapCollectionNav = 'true';

    const parent = nav.parentElement;
    if (parent) {
      [...parent.children].forEach((child) => {
        if (child !== nav) child.dataset.aupDecapContent = 'true';
      });
    }
    root.classList.add('aup-decap-collection-nav-hidden');
  }

  const decapObserver = new MutationObserver(() => {
    window.requestAnimationFrame(markDecapRegions);
  });
  const decapRoot = document.getElementById('nc-root');
  if (decapRoot) decapObserver.observe(decapRoot, { childList:true, subtree:true });

  accountButton.addEventListener('click', () => {
    const next = !accountMenu.hidden;
    accountMenu.hidden = next;
    accountButton.setAttribute('aria-expanded', String(!next));
  });
  document.addEventListener('click', (event) => {
    if (!account.contains(event.target)) {
      accountMenu.hidden = true;
      accountButton.setAttribute('aria-expanded','false');
    }
  });

  window.addEventListener('resize', markDecapRegions);
  syncNavigation();
  markDecapRegions();
})();
