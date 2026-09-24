(() => {
  const sidebar = document.getElementById('aup-sidebar');
  const overlay = document.getElementById('aup-overlay');
  const menuButton = document.getElementById('aup-menu-button');
  const title = document.getElementById('aup-header-title');
  const kicker = document.getElementById('aup-header-kicker');
  const links = [...document.querySelectorAll('[data-nav]')];
  const account = document.getElementById('aup-account');
  const saveState = document.getElementById('aup-save-state');
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
  const libraryCounts = {all:document.getElementById('aup-count-all'),published:document.getElementById('aup-count-published'),draft:document.getElementById('aup-count-draft'),featured:document.getElementById('aup-count-featured')};
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
    { test: /#\/edit\/settings\/site|#\/collections\/settings/, nav:'settings', kicker:'SITE / RÉGLAGES', title:'Réglages' },
  ];

  function syncNavigation() {
    const location = window.location.href;
    const route = routes.find((item) => item.test.test(location));
    const active = route?.nav || 'admin';
    links.forEach((link) => link.classList.toggle('is-active', link.dataset.nav === active));
    kicker.textContent = route?.kicker || 'AUPOSITEUR / STUDIO';
    title.textContent = route?.title || 'Tableau de bord';
    const isDashboard = dashboardRequested || !window.location.hash || window.location.hash === '#/' || window.location.hash === '#';
    dashboard?.classList.toggle('is-visible', isDashboard);
    const collectionMatch = window.location.hash.match(/^#\/collections\/(citations|ecrits|musiques|livres)$/);
    const isLibrary = Boolean(collectionMatch);
    if (library) library.hidden = !isLibrary;
    document.getElementById('nc-root')?.classList.toggle('aup-library-active', isLibrary);
    if (isDashboard) loadDashboard();
    if (isLibrary) loadLibrary(collectionMatch[1]);
    closeMenu();
  }

  const searchPageLabels = new Map([
    ['/','Accueil'], ['/a-propos/','À propos'], ['/ecrits/','Écrits'],
    ['/citations/','Citations'], ['/musique/','Musiques'], ['/livres/','Livres'],
  ]);

  function renderSearchState(element, state) {
    if (!element) return;
    const states = {
      loading:['is-loading','Lecture de Search Console…'],
      empty:['is-empty','Pas encore assez de données.'],
      error:['is-error','Données temporairement indisponibles.'],
    };
    const current = states[state] || states.empty;
    element.innerHTML = '<p class="aup-dashboard-search__state '+current[0]+'">'+escapeHtml(current[1])+'</p>';
  }

  function formatSearchMetrics(item) {
    const clicks=Number(item.clicks||0), impressions=Number(item.impressions||0), position=Number(item.position||0);
    return {
      activity: clicks.toLocaleString('fr-BE')+' clic'+(clicks===1?'':'s')+' · '+impressions.toLocaleString('fr-BE')+' impression'+(impressions===1?'':'s'),
      position: position>0?'Position '+position.toLocaleString('fr-BE',{maximumFractionDigits:1}):'Position —',
    };
  }

  function getSearchPagePath(value) {
    try { return new URL(value).pathname || '/'; } catch { return String(value || '/'); }
  }

  function buildSearchContentIndex(manifest) {
    const index=new Map(), collections=manifest?.collections||{};
    const add=(items,prefix)=>{ (items||[]).forEach((item)=>{ if(item.slug&&item.title) index.set(prefix+encodeURIComponent(item.slug)+'/',item.title); }); };
    add(collections.ecrits,'/ecrits/');
    add(collections.citations,'/citations/');
    add(collections.musiques,'/musique/');
    add(collections.livres,'/livres/');
    return index;
  }

  function renderSearchQueries(element, items, available=true) {
    if (!element) return;
    if (!available) return renderSearchState(element,'error');
    if (!Array.isArray(items)||!items.length) return renderSearchState(element,'empty');
    element.innerHTML=items.slice(0,5).map((item,index)=>{
      const query=String(item.query||'').trim();
      if(!query) return '';
      const metrics=formatSearchMetrics(item);
      return '<div class="aup-dashboard-search__item"><span class="aup-dashboard-search__rank">'+String(index+1).padStart(2,'0')+'</span><div class="aup-dashboard-search__content"><strong>'+escapeHtml(query)+'</strong><small>'+escapeHtml(metrics.activity)+'</small></div><em>'+escapeHtml(metrics.position)+'</em></div>';
    }).join('');
    if(!element.innerHTML.trim()) renderSearchState(element,'empty');
  }

  function renderSearchPages(element, items, contentIndex=new Map(), available=true) {
    if (!element) return;
    if (!available) return renderSearchState(element,'error');
    if (!Array.isArray(items)||!items.length) return renderSearchState(element,'empty');
    element.innerHTML=items.slice(0,5).map((item,index)=>{
      const page=String(item.page||'').trim();
      if(!page) return '';
      const path=getSearchPagePath(page);
      const pageTitle=searchPageLabels.get(path)||contentIndex.get(path)||path;
      const metrics=formatSearchMetrics(item);
      const pathLine=pageTitle!==path?'<span class="aup-dashboard-search__path">'+escapeHtml(path)+'</span>':'';
      return '<div class="aup-dashboard-search__item"><span class="aup-dashboard-search__rank">'+String(index+1).padStart(2,'0')+'</span><div class="aup-dashboard-search__content"><strong>'+escapeHtml(pageTitle)+'</strong>'+pathLine+'<small>'+escapeHtml(metrics.activity)+'</small></div><em>'+escapeHtml(metrics.position)+'</em></div>';
    }).join('');
    if(!element.innerHTML.trim()) renderSearchState(element,'empty');
  }

  async function loadGoogleInsights() {
    const gaUsers = document.getElementById('aup-ga4-users');
    const gaDetail = document.getElementById('aup-ga4-detail');
    const gaStatus = document.getElementById('aup-ga4-status');
    const gscClicks = document.getElementById('aup-gsc-clicks');
    const gscDetail = document.getElementById('aup-gsc-detail');
    const gscStatus = document.getElementById('aup-gsc-status');
    const gscQueries = document.getElementById('aup-gsc-queries');
    const gscPages = document.getElementById('aup-gsc-pages');
    if (!gaUsers || !gscClicks) return;
    renderSearchState(gscQueries,'loading');
    renderSearchState(gscPages,'loading');
    try {
      const response = await fetch('https://aupositeur-google-insights.nicolas-rugolo.workers.dev/admin/insights', {
        method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) throw new Error('Insights ' + response.status);
      const data = await response.json();
      const ga = data.analytics || {};
      const gsc = data.searchConsole || {};

      if (ga.error) {
        gaUsers.textContent = 'Données indisponibles';
        gaDetail.textContent = ga.error;
        gaStatus.textContent = 'À VÉRIFIER';
        gaStatus.classList.remove('is-ok');
      } else {
        gaUsers.textContent = Number(ga.activeUsers || 0).toLocaleString('fr-BE') + ' utilisateurs';
        gaDetail.textContent = Number(ga.sessions || 0).toLocaleString('fr-BE') + ' sessions · ' + Number(ga.pageViews || 0).toLocaleString('fr-BE') + ' pages vues';
        gaStatus.textContent = 'ACTIF';
        gaStatus.classList.add('is-ok');
      }

      if (gsc.error) {
        gscClicks.textContent = 'Données indisponibles';
        gscDetail.textContent = gsc.error;
        gscStatus.textContent = 'À VÉRIFIER';
        gscStatus.classList.remove('is-ok');
        renderSearchState(gscQueries,'error');
        renderSearchState(gscPages,'error');
      } else {
        gscClicks.textContent = Number(gsc.clicks || 0).toLocaleString('fr-BE') + ' clics';
        const ctr = Number(gsc.ctr || 0) * 100;
        gscDetail.textContent = Number(gsc.impressions || 0).toLocaleString('fr-BE') + ' impressions · CTR ' + ctr.toLocaleString('fr-BE', {maximumFractionDigits:1}) + '% · position ' + Number(gsc.position || 0).toLocaleString('fr-BE', {maximumFractionDigits:1});
        gscStatus.textContent = 'ACTIF';
        gscStatus.classList.add('is-ok');
        renderSearchQueries(gscQueries,gsc.queries||[],gsc.details?.queriesAvailable!==false);
        let contentIndex=new Map();
        try {
          const manifestResponse=await fetch('/studio-content.json',{cache:'no-store'});
          if(manifestResponse.ok) contentIndex=buildSearchContentIndex(await manifestResponse.json());
        } catch {}
        renderSearchPages(gscPages,gsc.pages||[],contentIndex,gsc.details?.pagesAvailable!==false);
      }
    } catch {
      gaUsers.textContent = 'Connexion impossible';
      gaDetail.textContent = 'Le service Google Insights ne répond pas.';
      gaStatus.textContent = 'À VÉRIFIER';
      gaStatus.classList.remove('is-ok');
      gscClicks.textContent = 'Connexion impossible';
      gscDetail.textContent = 'Le service Google Insights ne répond pas.';
      gscStatus.textContent = 'À VÉRIFIER';
      gscStatus.classList.remove('is-ok');
      renderSearchState(gscQueries,'error');
      renderSearchState(gscPages,'error');
    }
  }

  async function loadDashboard() {
    if (dashboardLoaded || !draftsEl || !recentEl) return;
    dashboardLoaded = true;
    loadGoogleInsights();
    const collections = [
      {name:'citations', label:'Citation'},
      {name:'ecrits', label:'Écrit'},
      {name:'musiques', label:'Musique'},
      {name:'livres', label:'Livre'}
    ];
    const bases = {
      citations:'src/content/citations/', ecrits:'src/content/poemes/', musiques:'src/content/musiques/',
      livres:'src/content/livres/'
    };
    try {
      const manifestResponse = await fetch('/studio-content.json', {cache:'no-store'});
      if (!manifestResponse.ok) throw new Error('Studio manifest');
      const manifest = await manifestResponse.json();
      const details = collections.flatMap((entry) =>
        (manifest.collections?.[entry.name] || []).map((item) => ({
          ...item,
          collection: entry.name,
          type: entry.label,
          path: bases[entry.name] + item.slug + '.md',
          changedAt: item.date || '',
        }))
      );

      const commitResponse = await fetch('https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2/commits?sha=main&per_page=40', {
        headers:{Accept:'application/vnd.github+json'}
      });
      const commits = commitResponse.ok ? await commitResponse.json() : [];
      const latestCommitDate = commits[0]?.commit?.committer?.date || commits[0]?.commit?.author?.date || '';
      const lastChangeEl = document.getElementById('aup-site-last-change');
      if (lastChangeEl) lastChangeEl.textContent = latestCommitDate ? formatDashboardDate(latestCommitDate) : '—';

      const siteStatus = document.getElementById('aup-site-status');
      if (siteStatus) {
        try {
          const siteResponse = await fetch('/', {method:'HEAD', cache:'no-store'});
          siteStatus.classList.toggle('is-ok', siteResponse.ok);
          siteStatus.classList.toggle('is-error', !siteResponse.ok);
          siteStatus.querySelector('strong').textContent = siteResponse.ok ? 'En ligne' : 'À vérifier';
        } catch {
          siteStatus.classList.add('is-error');
          siteStatus.querySelector('strong').textContent = 'À vérifier';
        }
      }

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
      details.forEach((item) => { item.changedAt = changedAt.get(item.path) || item.changedAt || ''; });

      const publishedItems = details
        .filter((item) => !item.draft && item.changedAt)
        .sort((a,b) => b.changedAt.localeCompare(a.changedAt));
      const lastPublicationEl = document.getElementById('aup-site-last-publication');
      if (lastPublicationEl) {
        const lastPublished = publishedItems[0];
        lastPublicationEl.textContent = lastPublished
          ? lastPublished.type + ' · ' + formatDashboardDate(lastPublished.changedAt)
          : '—';
        if (lastPublished) lastPublicationEl.title = lastPublished.title;
      }

      const totals = details.reduce((acc,item) => {
        acc[item.collection] = (acc[item.collection] || 0) + 1;
        return acc;
      }, {});
      ['citations','ecrits','musiques','livres'].forEach((name) => {
        const el = document.getElementById('aup-stat-' + name);
        if (el) el.textContent = String(totals[name] || 0);
      });

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
      const siteStatus = document.getElementById('aup-site-status');
      if (siteStatus) {
        siteStatus.classList.add('is-error');
        siteStatus.querySelector('strong').textContent = 'À vérifier';
      }
      const lastChangeEl = document.getElementById('aup-site-last-change');
      if (lastChangeEl) lastChangeEl.textContent = '—';
      const lastPublicationEl = document.getElementById('aup-site-last-publication');
      if (lastPublicationEl) lastPublicationEl.textContent = '—';
      ['citations','ecrits','musiques','livres'].forEach((name) => {
        const el = document.getElementById('aup-stat-' + name);
        if (el) el.textContent = '—';
      });
    }
  }

  async function loadLibrary(collection) {
    if (!libraryList) return;
    const metas = {
      citations:{title:'Citations',singular:'citation',kicker:'CONTENU / CITATIONS',base:'src/content/citations/'},
      ecrits:{title:'Écrits',singular:'écrit',kicker:'CONTENU / ÉCRITS',base:'src/content/poemes/'},
      musiques:{title:'Musiques',singular:'morceau',kicker:'CONTENU / MUSIQUES',base:'src/content/musiques/'},
      livres:{title:'Livres',singular:'livre',kicker:'CONTENU / LIVRES',base:'src/content/livres/'}
    };
    const meta = metas[collection];
    if (!meta) return;
    libraryTitle.textContent=meta.title; libraryKicker.textContent=meta.kicker;
    libraryNew.href='/admin/#/collections/'+collection+'/new';
    libraryNew.textContent=collection==='musiques'?'+ Nouveau morceau':collection==='ecrits'?'+ Nouvel écrit':collection==='livres'?'+ Nouveau livre':'+ Nouvelle citation';
    library.dataset.collection=collection;
    libraryList.innerHTML='<p class="aup-library-loading">Lecture de la bibliothèque…</p>';
    try {
      let items=libraryCache.get(collection);
      if (!items) {
        const manifestRes=await fetch('/studio-content.json',{cache:'no-store'});
        if(!manifestRes.ok) throw new Error('manifest');
        const manifest=await manifestRes.json();
        items=manifest.collections?.[collection]||[];
        libraryCache.set(collection,items);
      }
      renderLibrary(items,collection,meta);
    } catch {
      libraryList.innerHTML='<p class="aup-library-empty">Impossible de charger la bibliothèque pour le moment.</p>';
    }
  }

  function renderLibrary(items,collection,meta) {
    const query=(librarySearch?.value||'').trim().toLowerCase();
    const counts={all:items.length,published:items.filter((x)=>!x.draft).length,draft:items.filter((x)=>x.draft).length,featured:items.filter((x)=>x.featured).length};
    Object.entries(counts).forEach(([key,value])=>{if(libraryCounts[key]) libraryCounts[key].textContent=String(value);});
    const filtered=items.filter((item)=>{
      if(libraryFilter==='published'&&item.draft)return false;
      if(libraryFilter==='draft'&&!item.draft)return false;
      if(libraryFilter==='featured'&&!item.featured)return false;
      const haystack=[item.title,item.description,item.subtitle,item.author,item.publisher,item.lead].filter(Boolean).join(' ').toLowerCase();
      return !query||haystack.includes(query);
    }).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.title.localeCompare(b.title,'fr'));
    libraryResultCount.textContent=filtered.length+' '+(filtered.length===1?meta.singular:meta.title.toLowerCase());
    libraryList.innerHTML=filtered.length?filtered.map((item)=>{
      const badges=(item.draft?'<span class="is-draft">BROUILLON</span>':'<span class="is-published">PUBLIÉ</span>')+(item.featured?'<span class="is-featured">MIS EN AVANT</span>':'');
      const type=collection==='musiques'&&item.kind?(item.kind==='reprise'?'REPRISE':'COMPOSITION'):'';
      const date=item.date?formatLibraryDate(item.date):'';
      if(collection==='livres'){
        const bookMeta=[item.author,item.publisher].filter(Boolean).map(escapeHtml).join(' · ');
        const price=item.price?formatBookPrice(item.price,item.currency):'';
        return '<a class="aup-library-row aup-library-row--book" href="/admin/#/collections/'+collection+'/entries/'+encodeURIComponent(item.slug)+'">'+(item.cover?'<img class="aup-library-book-cover" src="'+escapeHtml(item.cover)+'" alt="">':'<div class="aup-library-book-cover is-empty">A</div>')+'<div class="aup-library-row-main"><strong>'+escapeHtml(item.title)+'</strong>'+((item.subtitle||item.lead)?'<p>'+escapeHtml(item.subtitle||item.lead)+'</p>':'')+'</div><div class="aup-library-row-meta">'+(bookMeta?'<small>'+bookMeta+'</small>':'')+(price?'<time>'+escapeHtml(price)+'</time>':'')+'</div><div class="aup-library-badges">'+badges+'</div><span class="aup-library-open">Modifier →</span></a>';
      }
      return '<a class="aup-library-row" href="/admin/#/collections/'+collection+'/entries/'+encodeURIComponent(item.slug)+'"><div class="aup-library-row-main"><strong>'+escapeHtml(item.title)+'</strong>'+(item.description?'<p>'+escapeHtml(item.description)+'</p>':'')+'</div><div class="aup-library-row-meta">'+(type?'<small>'+type+'</small>':'')+(date?'<time>'+escapeHtml(date)+'</time>':'')+'</div><div class="aup-library-badges">'+badges+'</div><span class="aup-library-open">Modifier →</span></a>';
    }).join(''):'<p class="aup-library-empty">Aucun contenu ne correspond à ce filtre.</p>';
  }

  function formatBookPrice(value,currency='EUR') {
    const amount=Number(String(value).replace(',','.'));
    if(Number.isNaN(amount)) return value;
    try { return new Intl.NumberFormat('fr-BE',{style:'currency',currency:currency||'EUR'}).format(amount); }
    catch { return amount.toFixed(2)+' '+(currency||'EUR'); }
  }

  function formatLibraryDate(value) {
    const date=new Date(value);
    return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('fr-BE',{day:'2-digit',month:'short',year:'numeric'}).format(date);
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

  libraryFilters.forEach((button)=>button.addEventListener('click',()=>{
    libraryFilter=button.dataset.filter;
    libraryFilters.forEach((item)=>item.classList.toggle('is-active',item===button));
    const collection=library?.dataset.collection;
    const meta=collection==='citations'?{title:'Citations',singular:'citation'}:collection==='ecrits'?{title:'Écrits',singular:'écrit'}:collection==='livres'?{title:'Livres',singular:'livre'}:{title:'Musiques',singular:'morceau'};
    if(collection&&libraryCache.has(collection))renderLibrary(libraryCache.get(collection),collection,meta);
  }));
  librarySearch?.addEventListener('input',()=>{
    const collection=library?.dataset.collection;
    const meta=collection==='citations'?{title:'Citations',singular:'citation'}:collection==='ecrits'?{title:'Écrits',singular:'écrit'}:collection==='livres'?{title:'Livres',singular:'livre'}:{title:'Musiques',singular:'morceau'};
    if(collection&&libraryCache.has(collection))renderLibrary(libraryCache.get(collection),collection,meta);
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
    const editorMatch = window.location.hash.match(/^#\/collections\/(citations|ecrits|musiques|livres)\/(?:new|entries\/)/);
    const homeEditor = /^#\/edit\/pages\/home/.test(window.location.hash);
    const isStudioEditor = Boolean(editorMatch) || homeEditor;
    root.classList.toggle('aup-editor-mode', isStudioEditor);
    root.classList.toggle('aup-home-editor', homeEditor);
    if (saveState) {
      saveState.hidden = !isStudioEditor;
      const dirty = [...root.querySelectorAll('*')].some((el) =>
        el.children.length === 0 && /unsaved changes|modifications non enregistrées|not saved/i.test(el.textContent.trim())
      );
      const nextState = dirty ? 'Modifications non enregistrées' : 'Enregistré ✓';
      if (saveState.textContent !== nextState) saveState.textContent = nextState;
      saveState.classList.toggle('is-dirty', dirty);
    }
    if (isStudioEditor) {
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
    if (homeEditor) {
      const sectionStarts = new Map([
        ['titre principal','01 — INTRODUCTION'],
        ['rubrique lecture','02 — À LIRE'],
        ['rubrique citation','03 — CITATION'],
        ['rubrique musique','04 — MUSIQUE'],
        ['boutique sur l’accueil','05 — BOUTIQUE']
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

    if (editorMatch) {
      const collection = editorMatch[1];

      // Give publication switches a dedicated visual card.
      [...root.querySelectorAll('label')].forEach((label) => {
        const t = label.textContent.trim().toLowerCase();
        if (t.startsWith('mise en avant') || t.startsWith('livre présenté sur l’accueil') || t.startsWith('brouillon')) {
          let box = label;
          while (box.parentElement && box.parentElement !== root) {
            if (box.querySelector('input[type="checkbox"]')) break;
            box = box.parentElement;
          }
          box.dataset.aupPublicationCard = (t.startsWith('mise en avant') || t.startsWith('livre présenté sur l’accueil')) ? 'featured' : 'draft';
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

      if (collection === 'livres') {
        const sectionStarts = new Map([
          ['titre','IDENTITÉ DU LIVRE'], ['couverture','ÉDITION & COUVERTURE'],
          ['prix','COMMERCIALISATION'], ['accroche','PRÉSENTATION'],
          ['livre présenté sur l’accueil','PUBLICATION'], ['mise en avant','PUBLICATION']
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
      if (featuredInput && collection !== 'livres' && !featuredInput.dataset.aupLimitBound) {
        featuredInput.dataset.aupLimitBound = 'true';
        featuredInput.addEventListener('click', async (event) => {
          if (featuredInput.checked) return;
          try {
            const manifestRes = await fetch('/studio-content.json', {cache:'no-store'});
            if (!manifestRes.ok) return;
            const manifest = await manifestRes.json();
            const items = manifest.collections?.[collection] || [];
            const count = items.filter((item) => item.featured).length;
            const currentSlug = decodeURIComponent((window.location.hash.match(/\/entries\/([^/?#]+)/)||[])[1] || '');
            const currentFeatured = items.some((item) => item.slug === currentSlug && item.featured);
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
