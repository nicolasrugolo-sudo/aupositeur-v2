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
  const library = document.getElementById('aup-library');
  const libraryTitle = document.getElementById('aup-library-title');
  const libraryKicker = document.getElementById('aup-library-kicker');
  const libraryNew = document.getElementById('aup-library-new');
  const libraryList = document.getElementById('aup-library-list');
  const librarySearch = document.getElementById('aup-library-search');
  const libraryResultCount = document.getElementById('aup-library-result-count');
  const libraryFilters = [...document.querySelectorAll('[data-filter]')];
  const libraryCounts = {
    all: document.getElementById('aup-count-all'),
    published: document.getElementById('aup-count-published'),
    draft: document.getElementById('aup-count-draft'),
    featured: document.getElementById('aup-count-featured')
  };
  const libraryCache = new Map();
  let libraryFilter = 'all';
  let dashboardLoaded = false;
  let dashboardRequested = false;

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
    const isDashboard = dashboardRequested || !window.location.hash || window.location.hash === '#/' || window.location.hash === '#';
    dashboard?.classList.toggle('is-visible', isDashboard);
    const collectionMatch = window.location.hash.match(/^#\/collections\/(citations|ecrits|musiques)$/);
    const isLibrary = Boolean(collectionMatch);
    if (library) library.hidden = !isLibrary;
    document.getElementById('nc-root')?.classList.toggle('aup-library-active', isLibrary);
    if (isDashboard) loadDashboard();
    if (isLibrary) loadLibrary(collectionMatch[1]);
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

  async function loadLibrary(collection) {
    if (!libraryList) return;
    const meta = {
      citations:{title:'Citations', singular:'citation', kicker:'CONTENU / CITATIONS', base:'src/content/citations/'},
      ecrits:{title:'Écrits', singular:'écrit', kicker:'CONTENU / ÉCRITS', base:'src/content/poemes/'},
      musiques:{title:'Musiques', singular:'morceau', kicker:'CONTENU / MUSIQUES', base:'src/content/musiques/'}
    }[collection];
    if (!meta) return;
    libraryTitle.textContent = meta.title;
    libraryKicker.textContent = meta.kicker;
    libraryNew.href = '/admin/#/collections/' + collection + '/new';
    libraryNew.textContent = collection === 'musiques' ? '+ Nouveau morceau' : collection === 'ecrits' ? '+ Nouvel écrit' : '+ Nouvelle citation';
    library.dataset.collection = collection;
    libraryList.innerHTML = '<p class="aup-library-loading">Lecture de la bibliothèque…</p>';
    try {
      let items = libraryCache.get(collection);
      if (!items) {
        const treeRes = await fetch('https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2/git/trees/main?recursive=1');
        if (!treeRes.ok) throw new Error('tree');
        const tree = (await treeRes.json()).tree || [];
        const paths = tree.filter((x) => x.type === 'blob' && x.path.startsWith(meta.base) && /\.md$/.test(x.path)).map((x) => x.path);
        items = await Promise.all(paths.map(async (path) => {
          const res = await fetch('https://raw.githubusercontent.com/nicolasrugolo-sudo/aupositeur-v2/main/' + path);
          const raw = res.ok ? await res.text() : '';
          const fm = (raw.match(/^---\s*\n([\s\S]*?)\n---/) || [])[1] || '';
          const get = (name) => {
            const match = fm.match(new RegExp('^' + name + ':\\s*["\\x27]?(.+?)["\\x27]?\\s*
    try {
      return new Intl.DateTimeFormat('fr-BE', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
    } catch { return ''; }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function showStudioNotice(titleText, bodyText) {
    document.querySelector('.aup-studio-notice')?.remove();
    const notice = document.createElement('div');
    notice.className = 'aup-studio-notice';
    notice.innerHTML = '<strong>'+escapeHtml(titleText)+'</strong><span>'+escapeHtml(bodyText)+'</span><button type="button" aria-label="Fermer">×</button>';
    notice.querySelector('button').onclick = () => notice.remove();
    document.body.appendChild(notice);
    window.setTimeout(() => notice.remove(), 6500);
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

  const adminLink = document.querySelector('[data-nav="admin"]');
  adminLink?.addEventListener('click', (event) => {
    event.preventDefault();
    dashboardRequested = true;
    history.replaceState(null, '', '/admin/#studio');
    syncNavigation();
  });

  libraryFilters.forEach((button) => button.addEventListener('click', () => {
    libraryFilter = button.dataset.filter;
    libraryFilters.forEach((item) => item.classList.toggle('is-active', item === button));
    const collection = library?.dataset.collection;
    const meta = collection === 'citations' ? {title:'Citations',singular:'citation'} : collection === 'ecrits' ? {title:'Écrits',singular:'écrit'} : {title:'Musiques',singular:'morceau'};
    if (collection && libraryCache.has(collection)) renderLibrary(libraryCache.get(collection), collection, meta);
  }));
  librarySearch?.addEventListener('input', () => {
    const collection = library?.dataset.collection;
    const meta = collection === 'citations' ? {title:'Citations',singular:'citation'} : collection === 'ecrits' ? {title:'Écrits',singular:'écrit'} : {title:'Musiques',singular:'morceau'};
    if (collection && libraryCache.has(collection)) renderLibrary(libraryCache.get(collection), collection, meta);
  });

  menuButton.addEventListener('click', () => sidebar.classList.contains('is-open') ? closeMenu() : openMenu());
  overlay.addEventListener('click', closeMenu);
  window.addEventListener('hashchange', () => {
    if (window.location.hash !== '#studio') dashboardRequested = false;
    syncNavigation();
  });
  window.addEventListener('popstate', syncNavigation);
  function markDecapRegions() {
    const root = document.getElementById('nc-root');
    if (!root) return;

    // Detect Decap's native top navigation by its visible labels rather than
    // generated class names. Hide it only on desktop, where the Shell replaces it.
    const candidates = [...root.querySelectorAll('a,button,[role="button"]')];

    // Editor treatment for Citations, Écrits and Musiques. We identify Decap
    // controls semantically so the Studio remains independent of generated CSS.
    const editorMatch = window.location.hash.match(/^#\/collections\/(citations|ecrits|musiques)\/(?:new|entries\/)/);
    root.classList.toggle('aup-editor-mode', Boolean(editorMatch));
    if (editorMatch) {
      const publish = candidates.find((el) => /^(publish|publier)$/i.test(el.textContent.trim()) || /^publish\b/i.test(el.textContent.trim()));
      if (publish) {
        publish.dataset.aupPublish = 'true';
        let toolbar = publish.parentElement;
        while (toolbar?.parentElement && toolbar.parentElement !== root) {
          const rect = toolbar.getBoundingClientRect();
          if (rect.width > root.getBoundingClientRect().width * .75 && rect.height < 100) break;
          toolbar = toolbar.parentElement;
        }
        if (toolbar) toolbar.dataset.aupEditorToolbar = 'true';
      }
      [...root.querySelectorAll('*')].filter((el) => /unsaved changes|modifications non enregistrées/i.test(el.textContent.trim()) && el.children.length === 0)
        .forEach((el) => { el.dataset.aupStatus = 'true'; });

      // Mark the two editor columns by geometry only when both are clearly present.
      const previewToggle = candidates.find((el) => /preview|aperçu/i.test((el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim()));
      if (previewToggle) {
        const editorArea = [...root.querySelectorAll('div')].find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 700 && r.height > 350 && el.querySelector('form') && el.contains(previewToggle);
        });
        if (editorArea) {
          const cols = [...editorArea.children].filter((el) => el.getBoundingClientRect().width > 250);
          if (cols.length >= 2) {
            cols[0].dataset.aupFormPane = 'true';
            cols[cols.length - 1].dataset.aupPreviewPane = 'true';
          }
        }
      }
    }
    if (editorMatch) {
      const collection = editorMatch[1];

      // Give publication switches a dedicated visual card.
      [...root.querySelectorAll('label')].forEach((label) => {
        const t = label.textContent.trim().toLowerCase();
        if (t.startsWith('mise en avant') || t.startsWith('brouillon')) {
          let box = label;
          while (box.parentElement && box.parentElement !== root) {
            if (box.querySelector('input[type="checkbox"]')) break;
            box = box.parentElement;
          }
          box.dataset.aupPublicationCard = t.startsWith('mise en avant') ? 'featured' : 'draft';
        }
      });

      // Music is long: visually divide the native Decap form into useful
      // editorial sections without changing its data model.
      if (collection === 'musiques') {
        const sectionStarts = new Map([
          ['titre','IDENTITÉ DU MORCEAU'], ['fichier audio','DIFFUSION & PLATEFORMES'],
          ['paroles','PAROLES & CRÉDITS'], ['ordre d’affichage','PUBLICATION']
        ]);
        [...root.querySelectorAll('label')].forEach((label) => {
          const key = label.textContent.trim().toLowerCase().replace(/\s*\(optional\).*$/,'');
          const section = sectionStarts.get(key);
          if (!section) return;
          let field = label;
          while (field.parentElement && field.parentElement !== root) {
            const parent = field.parentElement;
            if (parent.children.length > 1 || parent.querySelector('input,textarea,select,button')) { field = parent; break; }
            field = parent;
          }
          field.dataset.aupSectionStart = section;
        });
      }

      // The limit is enforced in the editor before Decap can save a fourth
      // featured item. Public GitHub content is the source of truth.
      const featuredInput = [...root.querySelectorAll('input[type="checkbox"]')].find((input) => {
        const label = input.closest('label') || input.parentElement?.querySelector('label') || input.parentElement;
        return /mise en avant/i.test(label?.textContent || '');
      });
      if (featuredInput && !featuredInput.dataset.aupLimitBound) {
        featuredInput.dataset.aupLimitBound = 'true';
        featuredInput.addEventListener('click', async (event) => {
          if (featuredInput.checked) return;
          const bases = {citations:'src/content/citations/',ecrits:'src/content/poemes/',musiques:'src/content/musiques/'};
          try {
            const treeRes = await fetch('https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2/git/trees/main?recursive=1');
            if (!treeRes.ok) return;
            const tree = (await treeRes.json()).tree || [];
            const paths = tree.filter((x) => x.type === 'blob' && x.path.startsWith(bases[collection]) && /\.md$/.test(x.path)).map((x)=>x.path);
            const raws = await Promise.all(paths.map((path)=>fetch('https://raw.githubusercontent.com/nicolasrugolo-sudo/aupositeur-v2/main/'+path).then((r)=>r.ok?r.text():'')));
            const count = raws.filter((raw)=>/^featured:\s*true\s*$/mi.test(raw)).length;
            const currentSlug = decodeURIComponent((window.location.hash.match(/\/entries\/([^/?#]+)/)||[])[1] || '');
            const currentPath = paths.find((path)=>path.endsWith('/'+currentSlug+'.md'));
            const currentFeatured = currentPath ? /^featured:\s*true\s*$/mi.test(raws[paths.indexOf(currentPath)]) : false;
            if (count >= 3 && !currentFeatured) {
              event.preventDefault();
              event.stopImmediatePropagation();
              showStudioNotice('Maximum 3 mises en avant', 'Retire d’abord une mise en avant dans cette rubrique avant d’en ajouter une nouvelle.');
            }
          } catch {}
        }, true);
      }
    }

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
, 'mi'));
            return match ? match[1].trim() : '';
          };
          const slug = path.split('/').pop().replace(/\.md$/, '');
          return {
            slug,
            title: get(collection === 'citations' ? 'text' : 'title') || slug,
            draft: /^draft:\s*true\s*$/mi.test(fm),
            featured: /^featured:\s*true\s*$/mi.test(fm),
            date: get(collection === 'musiques' ? 'releaseDate' : 'createdAt'),
            kind: get('kind'),
            description: get(collection === 'musiques' ? 'descriptionCourte' : 'description')
          };
        }));
        libraryCache.set(collection, items);
      }
      renderLibrary(items, collection, meta);
    } catch {
      libraryList.innerHTML = '<p class="aup-library-empty">Impossible de charger la bibliothèque pour le moment.</p>';
    }
  }

  function renderLibrary(items, collection, meta) {
    const query = (librarySearch?.value || '').trim().toLowerCase();
    const counts = {
      all: items.length,
      published: items.filter((x) => !x.draft).length,
      draft: items.filter((x) => x.draft).length,
      featured: items.filter((x) => x.featured).length
    };
    Object.entries(counts).forEach(([key, value]) => {
      if (libraryCounts[key]) libraryCounts[key].textContent = String(value);
    });
    const filtered = items.filter((item) => {
      if (libraryFilter === 'published' && item.draft) return false;
      if (libraryFilter === 'draft' && !item.draft) return false;
      if (libraryFilter === 'featured' && !item.featured) return false;
      return !query || (item.title + ' ' + item.description).toLowerCase().includes(query);
    }).sort((a,b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title, 'fr'));
    libraryResultCount.textContent = filtered.length + ' ' + (filtered.length === 1 ? meta.singular : meta.title.toLowerCase());
    libraryList.innerHTML = filtered.length ? filtered.map((item) => {
      const badges = [
        item.draft ? '<span class="is-draft">BROUILLON</span>' : '<span class="is-published">PUBLIÉ</span>',
        item.featured ? '<span class="is-featured">MIS EN AVANT</span>' : ''
      ].join('');
      const type = collection === 'musiques' && item.kind ? (item.kind === 'reprise' ? 'REPRISE' : 'COMPOSITION') : '';
      const date = item.date ? formatLibraryDate(item.date) : '';
      return '<a class="aup-library-row" href="/admin/#/collections/' + collection + '/entries/' + encodeURIComponent(item.slug) + '">' +
        '<div class="aup-library-row-main"><strong>' + escapeHtml(item.title) + '</strong>' +
        (item.description ? '<p>' + escapeHtml(item.description) + '</p>' : '') + '</div>' +
        '<div class="aup-library-row-meta">' + (type ? '<small>' + type + '</small>' : '') + (date ? '<time>' + escapeHtml(date) + '</time>' : '') + '</div>' +
        '<div class="aup-library-badges">' + badges + '</div><span class="aup-library-open">Modifier →</span></a>';
    }).join('') : '<p class="aup-library-empty">Aucun contenu ne correspond à ce filtre.</p>';
  }

  function formatLibraryDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-BE', {day:'2-digit', month:'short', year:'numeric'}).format(date);
  }

  function formatDashboardDate(value) {
    try {
      return new Intl.DateTimeFormat('fr-BE', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
    } catch { return ''; }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function showStudioNotice(titleText, bodyText) {
    document.querySelector('.aup-studio-notice')?.remove();
    const notice = document.createElement('div');
    notice.className = 'aup-studio-notice';
    notice.innerHTML = '<strong>'+escapeHtml(titleText)+'</strong><span>'+escapeHtml(bodyText)+'</span><button type="button" aria-label="Fermer">×</button>';
    notice.querySelector('button').onclick = () => notice.remove();
    document.body.appendChild(notice);
    window.setTimeout(() => notice.remove(), 6500);
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

  const adminLink = document.querySelector('[data-nav="admin"]');
  adminLink?.addEventListener('click', (event) => {
    event.preventDefault();
    dashboardRequested = true;
    history.replaceState(null, '', '/admin/#studio');
    syncNavigation();
  });

  menuButton.addEventListener('click', () => sidebar.classList.contains('is-open') ? closeMenu() : openMenu());
  overlay.addEventListener('click', closeMenu);
  window.addEventListener('hashchange', () => {
    if (window.location.hash !== '#studio') dashboardRequested = false;
    syncNavigation();
  });
  window.addEventListener('popstate', syncNavigation);
  function markDecapRegions() {
    const root = document.getElementById('nc-root');
    if (!root) return;

    // Detect Decap's native top navigation by its visible labels rather than
    // generated class names. Hide it only on desktop, where the Shell replaces it.
    const candidates = [...root.querySelectorAll('a,button,[role="button"]')];

    // Editor treatment for Citations, Écrits and Musiques. We identify Decap
    // controls semantically so the Studio remains independent of generated CSS.
    const editorMatch = window.location.hash.match(/^#\/collections\/(citations|ecrits|musiques)\/(?:new|entries\/)/);
    root.classList.toggle('aup-editor-mode', Boolean(editorMatch));
    if (editorMatch) {
      const publish = candidates.find((el) => /^(publish|publier)$/i.test(el.textContent.trim()) || /^publish\b/i.test(el.textContent.trim()));
      if (publish) {
        publish.dataset.aupPublish = 'true';
        let toolbar = publish.parentElement;
        while (toolbar?.parentElement && toolbar.parentElement !== root) {
          const rect = toolbar.getBoundingClientRect();
          if (rect.width > root.getBoundingClientRect().width * .75 && rect.height < 100) break;
          toolbar = toolbar.parentElement;
        }
        if (toolbar) toolbar.dataset.aupEditorToolbar = 'true';
      }
      [...root.querySelectorAll('*')].filter((el) => /unsaved changes|modifications non enregistrées/i.test(el.textContent.trim()) && el.children.length === 0)
        .forEach((el) => { el.dataset.aupStatus = 'true'; });

      // Mark the two editor columns by geometry only when both are clearly present.
      const previewToggle = candidates.find((el) => /preview|aperçu/i.test((el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim()));
      if (previewToggle) {
        const editorArea = [...root.querySelectorAll('div')].find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 700 && r.height > 350 && el.querySelector('form') && el.contains(previewToggle);
        });
        if (editorArea) {
          const cols = [...editorArea.children].filter((el) => el.getBoundingClientRect().width > 250);
          if (cols.length >= 2) {
            cols[0].dataset.aupFormPane = 'true';
            cols[cols.length - 1].dataset.aupPreviewPane = 'true';
          }
        }
      }
    }
    if (editorMatch) {
      const collection = editorMatch[1];

      // Give publication switches a dedicated visual card.
      [...root.querySelectorAll('label')].forEach((label) => {
        const t = label.textContent.trim().toLowerCase();
        if (t.startsWith('mise en avant') || t.startsWith('brouillon')) {
          let box = label;
          while (box.parentElement && box.parentElement !== root) {
            if (box.querySelector('input[type="checkbox"]')) break;
            box = box.parentElement;
          }
          box.dataset.aupPublicationCard = t.startsWith('mise en avant') ? 'featured' : 'draft';
        }
      });

      // Music is long: visually divide the native Decap form into useful
      // editorial sections without changing its data model.
      if (collection === 'musiques') {
        const sectionStarts = new Map([
          ['titre','IDENTITÉ DU MORCEAU'], ['fichier audio','DIFFUSION & PLATEFORMES'],
          ['paroles','PAROLES & CRÉDITS'], ['ordre d’affichage','PUBLICATION']
        ]);
        [...root.querySelectorAll('label')].forEach((label) => {
          const key = label.textContent.trim().toLowerCase().replace(/\s*\(optional\).*$/,'');
          const section = sectionStarts.get(key);
          if (!section) return;
          let field = label;
          while (field.parentElement && field.parentElement !== root) {
            const parent = field.parentElement;
            if (parent.children.length > 1 || parent.querySelector('input,textarea,select,button')) { field = parent; break; }
            field = parent;
          }
          field.dataset.aupSectionStart = section;
        });
      }

      // The limit is enforced in the editor before Decap can save a fourth
      // featured item. Public GitHub content is the source of truth.
      const featuredInput = [...root.querySelectorAll('input[type="checkbox"]')].find((input) => {
        const label = input.closest('label') || input.parentElement?.querySelector('label') || input.parentElement;
        return /mise en avant/i.test(label?.textContent || '');
      });
      if (featuredInput && !featuredInput.dataset.aupLimitBound) {
        featuredInput.dataset.aupLimitBound = 'true';
        featuredInput.addEventListener('click', async (event) => {
          if (featuredInput.checked) return;
          const bases = {citations:'src/content/citations/',ecrits:'src/content/poemes/',musiques:'src/content/musiques/'};
          try {
            const treeRes = await fetch('https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2/git/trees/main?recursive=1');
            if (!treeRes.ok) return;
            const tree = (await treeRes.json()).tree || [];
            const paths = tree.filter((x) => x.type === 'blob' && x.path.startsWith(bases[collection]) && /\.md$/.test(x.path)).map((x)=>x.path);
            const raws = await Promise.all(paths.map((path)=>fetch('https://raw.githubusercontent.com/nicolasrugolo-sudo/aupositeur-v2/main/'+path).then((r)=>r.ok?r.text():'')));
            const count = raws.filter((raw)=>/^featured:\s*true\s*$/mi.test(raw)).length;
            const currentSlug = decodeURIComponent((window.location.hash.match(/\/entries\/([^/?#]+)/)||[])[1] || '');
            const currentPath = paths.find((path)=>path.endsWith('/'+currentSlug+'.md'));
            const currentFeatured = currentPath ? /^featured:\s*true\s*$/mi.test(raws[paths.indexOf(currentPath)]) : false;
            if (count >= 3 && !currentFeatured) {
              event.preventDefault();
              event.stopImmediatePropagation();
              showStudioNotice('Maximum 3 mises en avant', 'Retire d’abord une mise en avant dans cette rubrique avant d’en ajouter une nouvelle.');
            }
          } catch {}
        }, true);
      }
    }

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
