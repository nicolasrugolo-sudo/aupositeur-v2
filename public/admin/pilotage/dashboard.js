(() => {
  const dashboard = document.getElementById('aup-dashboard');
  const draftsEl = document.getElementById('aup-drafts');
  const recentEl = document.getElementById('aup-recent');
  const draftCountEl = document.getElementById('aup-draft-count');
  let dashboardLoaded = false;
  let dashboardInsights = null;
  let dashboardManifest = null;
  let dashboardPinterest = null;
  let worksExpanded = false;
  let youtubeExpanded = false;

  const normalizeYoutubeId = (value) => {
    const raw=String(value||'').trim();
    if(!raw) return '';
    try {
      const url=new URL(raw);
      if(url.hostname.includes('youtu.be')) return url.pathname.replace(/^\//,'').split('/')[0];
      if(url.hostname.includes('youtube.com')) return url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop() || '';
    } catch {}
    return raw;
  };

  function openInsight(name) {
    const panel=document.getElementById('aup-details-'+name);
    if(!panel) return;
    panel.open=true;
    panel.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    panel.querySelector('summary')?.focus({preventScroll:true});
  }

  let dashboardSocial = null;
  async function loadSocialTasks() {
    try {
      const response=await fetch('https://aupositeur-social-api.nicolas-rugolo.workers.dev/api/admin/social/posts',{credentials:'include',cache:'no-store'});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const payload=await response.json();
      if(!Array.isArray(payload.posts)) throw new Error('Réponse invalide');
      const now=Date.now();
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const dayKey=value=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));const get=k=>parts.find(p=>p.type===k)?.value||'';return get('year')+'-'+get('month')+'-'+get('day')};
      const pending=payload.posts.filter(p=>p.scheduled_at_utc&&!p.shared_at&&Number.isFinite(Date.parse(p.scheduled_at_utc)));
      dashboardSocial={overdue:pending.filter(p=>Date.parse(p.scheduled_at_utc)<=now).length,today:pending.filter(p=>Date.parse(p.scheduled_at_utc)>now&&dayKey(p.scheduled_at_utc)===today).length,error:false};
    } catch {
      dashboardSocial={error:true};
    }
    renderToday();
  }

  function renderToday() {
    const list=document.getElementById('aup-today-list');
    const count=document.getElementById('aup-today-count');
    if(!list) return;
    const actions=[];
    if(document.getElementById('aup-site-status')?.classList.contains('is-error')) actions.push({title:'Vérifier le site',detail:'Le contrôle de disponibilité signale un problème.',href:'/'});
    if(dashboardInsights?.analytics?.error || dashboardInsights?.searchConsole?.error) actions.push({title:'Vérifier la connexion Google',detail:'Certaines statistiques ne sont pas disponibles.',insight:'google'});
    if(dashboardInsights?.youtube?.error || dashboardInsights?.youtube?.configured===false) actions.push({title:'Vérifier la connexion YouTube',detail:dashboardInsights.youtube.needsReauthorization?'La chaîne demande une nouvelle autorisation.':'Les statistiques YouTube sont indisponibles.',insight:'youtube'});
    if(dashboardPinterest?.error) actions.push({title:'Vérifier la connexion Pinterest',detail:'Consulte le message de connexion pour rétablir les statistiques.',insight:'pinterest'});
    if(dashboardSocial?.overdue) actions.unshift({title:'Publications sociales en retard',detail:dashboardSocial.overdue+' publication(s) non marquée(s) comme partagée(s).',href:moduleHref('/admin/social/#calendar','diffusion')});
    if(dashboardSocial?.today) actions.unshift({title:'Partages prévus aujourd’hui',detail:dashboardSocial.today+' publication(s) à préparer ou confirmer.',href:moduleHref('/admin/social/#calendar','diffusion')});
    if(dashboardSocial?.error) actions.push({title:'Vérifier le calendrier social',detail:'Les publications planifiées sont indisponibles : connexion Social API à rétablir.',href:moduleHref('/admin/social/','diffusion')});
    const checking=!dashboardManifest || !dashboardInsights || !dashboardPinterest || !dashboardSocial;
    if(count) count.textContent=actions.length ? actions.length+' action'+(actions.length>1?'s':'') : (checking?'Vérification':'À jour');
    list.innerHTML=actions.length ? actions.map(action=>'<div class="aup-dashboard-item"><div><strong>'+escapeHtml(action.title)+'</strong><small>'+escapeHtml(action.detail)+'</small></div>'+(action.insight?'<button type="button" data-insight-open="'+action.insight+'">Vérifier →</button>':'<a href="'+action.href+'" target="'+(embedded?'_top':'_self')+'" rel="noopener">Ouvrir →</a>')+'</div>').join('') : '<p class="aup-dashboard-empty">'+(checking?'Vérification des connexions en cours…':'Tout est prêt. Tu peux te consacrer à tes créations.')+'</p>';
  }

  dashboard?.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-insight-open]');
    if(trigger) { event.preventDefault(); openInsight(trigger.dataset.insightOpen); }
    if(event.target.closest('#aup-works-toggle')) { worksExpanded=!worksExpanded; renderWorkPerformance(); }
    if(event.target.closest('#aup-youtube-toggle')) {
      youtubeExpanded=!youtubeExpanded;
      const button=document.getElementById('aup-youtube-toggle');
      const rows=[...document.querySelectorAll('#aup-youtube-videos .aup-dashboard-youtube__video')];
      rows.forEach((row,index)=>{row.hidden=!youtubeExpanded && index>=5;});
      button.setAttribute('aria-expanded',String(youtubeExpanded));
      button.textContent=youtubeExpanded?'Réduire la liste':'Voir les '+rows.length+' vidéos';
    }
  });
  dashboard?.addEventListener('error',event=>{
    const img=event.target;
    if(!(img instanceof HTMLImageElement) || !img.classList.contains('aup-dashboard-youtube__thumb')) return;
    const fallback=document.createElement('span');
    fallback.className='aup-dashboard-youtube__thumb is-empty';
    fallback.textContent='YouTube';
    fallback.setAttribute('aria-hidden','true');
    img.replaceWith(fallback);
  },true);

  function renderWorkPerformance() {
    renderToday();
    renderPinterestPins();
    const element=document.getElementById('aup-work-performance-list');
    if(!element || !dashboardManifest) return;
    const works=(dashboardManifest.collections?.musiques||[]).filter((item)=>!item.draft)
      .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const ga=dashboardInsights?.analytics||{}, gsc=dashboardInsights?.searchConsole||{}, youtube=dashboardInsights?.youtube||{};
    const normalizePath = (value) => {
      let path=getSearchPagePath(value || '/');
      try { path=decodeURIComponent(path); } catch {}
      path=path.replace(/\/{2,}/g,'/').replace(/\/$/,'') || '/';
      return path.normalize ? path.normalize('NFC') : path;
    };
    const gaPages=new Map((ga.pages||[]).map((item)=>[normalizePath(item.path),item]));
    const gscPages=new Map();
    (gsc.pages||[]).forEach((item)=>{
      const key=normalizePath(item.page);
      const current=gscPages.get(key);
      if(!current) gscPages.set(key,{...item});
      else gscPages.set(key,{
        ...current,
        clicks:Number(current.clicks||0)+Number(item.clicks||0),
        impressions:Number(current.impressions||0)+Number(item.impressions||0),
      });
    });
    const youtubeItems=Array.isArray(youtube.topVideos) ? youtube.topVideos : (Array.isArray(youtube.videos) ? youtube.videos : []);
    const youtubeVideos=new Map(youtubeItems.map((item)=>[String(item.videoId||''),item]));
    const gaPagesAvailable=Array.isArray(ga.pages);
    const gscPagesAvailable=Array.isArray(gsc.pages);
    const youtubeVideosAvailable=Array.isArray(youtube.topVideos) || Array.isArray(youtube.videos);
    works.sort((a,b)=>Number(gaPages.get(normalizePath('/musique/'+b.slug))?.pageViews||0)-Number(gaPages.get(normalizePath('/musique/'+a.slug))?.pageViews||0) || (b.date||'').localeCompare(a.date||''));
    const toggle=document.getElementById('aup-works-toggle');
    if(toggle) { toggle.hidden=works.length<=5; toggle.textContent=worksExpanded?'Réduire la liste':'Voir les '+works.length+' œuvres'; toggle.setAttribute('aria-expanded',String(worksExpanded)); }
    const visibleWorks=worksExpanded?works:works.slice(0,5);
    element.innerHTML=works.length ? visibleWorks.map((item)=>{
      const path=normalizePath('/musique/'+item.slug);
      const site=gaPages.get(path), search=gscPages.get(path);
      const videoId=normalizeYoutubeId(item.youtubeId), video=videoId?youtubeVideos.get(videoId):null;
      const siteText=site ? Number(site.pageViews||0).toLocaleString('fr-BE')+' vue'+(Number(site.pageViews||0)===1?'':'s') : (gaPagesAvailable?'—':'Indisponible');
      const googleText=search ? Number(search.clicks||0).toLocaleString('fr-BE')+' clic'+(Number(search.clicks||0)===1?'':'s')+' · '+Number(search.impressions||0).toLocaleString('fr-BE')+' impr.' : (gscPagesAvailable?'—':'Indisponible');
      const googleTitle=search ? 'Search Console · 28 jours · URL correspondante trouvée' :
        (gscPagesAvailable ? 'Search Console · aucune ligne pour cette URL sur la période' : 'Search Console · données par page indisponibles');
      const youtubeText=video ? Number(video.views||0).toLocaleString('fr-BE')+' vue'+(Number(video.views||0)===1?'':'s') : (!videoId?'Non lié':(youtubeVideosAvailable?'—':'Indisponible'));
      const matchedPins=(dashboardPinterest?.pins||[]).filter(pin=>{
        try { const url=new URL(pin.link); return ['aupositeur.be','www.aupositeur.be'].includes(url.hostname) && normalizePath(url.pathname)===path; } catch { return false; }
      });
      const pinClicks=matchedPins.every(pin=>typeof pin.clicks==='number') ? matchedPins.reduce((sum,pin)=>sum+pin.clicks,0) : null;
      const pinterestText=matchedPins.length ? (pinClicks===null?'Clics indisponibles':pinClicks.toLocaleString('fr-BE')+' clics') : (dashboardPinterest?.error || (dashboardPinterest?.configured && !Array.isArray(dashboardPinterest.pins))?'Indisponible':(dashboardPinterest?.configured?'Non rapproché':'À connecter'));
      return '<div class="aup-dashboard-works__row">'+
        '<div><strong>'+escapeHtml(item.title)+'</strong><small>'+escapeHtml(path)+'</small></div>'+
        '<span title="GA4 · 30 jours">'+escapeHtml(siteText)+'</span>'+
        '<span title="'+escapeHtml(googleTitle)+'">'+escapeHtml(googleText)+'</span>'+
        '<span title="'+escapeHtml(videoId?'YouTube Analytics · 28 jours':'Aucune vidéo YouTube liée')+'">'+escapeHtml(youtubeText)+'</span>'+
        '<span title="Pinterest · 30 jours · liens exacts parmi les 20 épingles les plus vues ; total partiel">'+escapeHtml(pinterestText)+'</span>'+
      '</div>';
    }).join('') : '<p class="aup-dashboard-search__state is-empty">Aucune musique publiée à analyser.</p>';
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
    add(collections.reflexions,'/reflexions/');
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

  function renderPinterestPins() {
    const list=document.getElementById('aup-pinterest-pins');
    const data=dashboardPinterest;
    if(!list || !data || data.error) return;
    if(!Array.isArray(data.pins)) {
      list.innerHTML='<p class="aup-dashboard-search__state is-error">'+escapeHtml(data.details?.topPinsError||'Détail des épingles indisponible.')+'</p>';
      return;
    }
    const index=buildSearchContentIndex(dashboardManifest);
    const format=value=>typeof value==='number' ? value.toLocaleString('fr-BE') : '—';
    list.innerHTML=data.pins.length ? data.pins.slice(0,5).map((pin,rank)=>{
      let pageTitle='';
      try {
        const url=new URL(pin.link);
        if(['aupositeur.be','www.aupositeur.be'].includes(url.hostname)) {
          const path=url.pathname.replace(/\/$/,'')+'/';
          pageTitle=index.get(path)||'';
        }
      } catch {}
      const hasTitle=pin.titleSource==='title';
      const title=hasTitle ? pin.title : (pageTitle || pin.title || 'Épingle sans titre');
      const source=!hasTitle && !pageTitle ? (pin.titleSource==='description'?'Description de l’épingle':'Aucun titre fourni par Pinterest') : '';
      const thumbnail=/^https:\/\/i\.pinimg\.com\//.test(pin.thumbnail||'') ? '<img src="'+escapeHtml(pin.thumbnail)+'" alt="" loading="lazy" width="48" height="64" style="object-fit:cover;border-radius:3px;flex-shrink:0">' : '';
      return '<div class="aup-dashboard-search__item"><span class="aup-dashboard-search__rank">'+String(rank+1).padStart(2,'0')+'</span>'+thumbnail+'<div class="aup-dashboard-search__content"><strong><a href="https://www.pinterest.com/pin/'+encodeURIComponent(pin.id)+'/" target="_blank" rel="noopener noreferrer">'+escapeHtml(title)+'</a></strong>'+(source?'<small>'+escapeHtml(source)+'</small>':'')+'<small>'+format(pin.impressions)+' impressions · '+format(pin.engagements)+' engagements · '+format(pin.clicks)+' clics sortants</small></div></div>';
    }).join('') : '<p class="aup-dashboard-search__state is-empty">Aucune épingle retournée sur cette période.</p>';
  }

  async function loadPinterestInsights() {
    const set=(id,value)=>{ const el=document.getElementById(id); if(el) el.textContent=value; };
    const format=value=>typeof value==='number' ? value.toLocaleString('fr-BE') : '—';
    const status=document.getElementById('aup-pinterest-status');
    const cardStatus=document.getElementById('aup-pinterest-card-status');
    const list=document.getElementById('aup-pinterest-pins');
    try {
      const response=await fetch('https://aupositeur-google-insights.nicolas-rugolo.workers.dev/admin/pinterest-insights',{mode:'cors',credentials:'omit',cache:'no-store'});
      const data=await response.json();
      if(!response.ok || !data.configured || data.error) throw new Error(data.error || 'Connexion Pinterest à vérifier.');
      dashboardPinterest=data;
      const connectLink=document.getElementById('aup-pinterest-reconnect'); if(connectLink) connectLink.hidden=true;
      ['impressions','engagements','saves','clicks'].forEach(key=>set('aup-pinterest-'+key,format(data[key])));
      set('aup-pinterest-summary',format(data.impressions));
      set('aup-pinterest-card-detail','Épingles du compte · activité organique');
      set('aup-pinterest-status','ACTIF'); set('aup-pinterest-card-status','ACTIF');
      status?.classList.add('is-ok'); cardStatus?.classList.add('is-ok');
      set('aup-pinterest-detail','Du '+data.start+' au '+data.end+' · Données organiques. Les clics sortants couvrent toutes les destinations des épingles du compte.');
      const previous=data.previous?.impressions;
      const change=document.getElementById('aup-pinterest-change');
      if(change && typeof previous==='number' && typeof data.impressions==='number') {
        const value=previous>0 ? ((data.impressions-previous)/previous)*100 : (data.impressions===0?0:null);
        change.textContent=value===null?'Nouveau':(value>0?'+':'')+value.toLocaleString('fr-BE',{maximumFractionDigits:1})+'%';
        change.title='Par rapport aux 30 jours précédents';
      }
      renderPinterestPins();
    } catch(error) {
      dashboardPinterest={error:true};
      const connectLink=document.getElementById('aup-pinterest-reconnect'); if(connectLink) connectLink.hidden=false;
      set('aup-pinterest-summary','Données indisponibles');
      set('aup-pinterest-status','À VÉRIFIER'); set('aup-pinterest-card-status','À VÉRIFIER');
      set('aup-pinterest-card-detail','Connexion Pinterest à vérifier');
      set('aup-pinterest-detail',error.message || 'Connexion Pinterest impossible.');
      status?.classList.remove('is-ok'); cardStatus?.classList.remove('is-ok');
      if(list) list.innerHTML='<p class="aup-dashboard-search__state is-error">Statistiques Pinterest indisponibles.</p>';
    }
    renderWorkPerformance();
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
    const youtubeViews = document.getElementById('aup-youtube-views');
    const youtubeDetail = document.getElementById('aup-youtube-detail');
    const youtubeStatus = document.getElementById('aup-youtube-status');
    const youtubeMetricViews = document.getElementById('aup-youtube-metric-views');
    const youtubeWatchTime = document.getElementById('aup-youtube-watch-time');
    const youtubeAverage = document.getElementById('aup-youtube-average');
    const youtubeSubs = document.getElementById('aup-youtube-subs');
    const youtubeSubsDetail = document.getElementById('aup-youtube-subs-detail');
    const youtubeVideos = document.getElementById('aup-youtube-videos');
    const youtubeTrend = document.getElementById('aup-youtube-trend');
    const youtubeReportingButton = document.getElementById('aup-youtube-reporting-button');
    const youtubeReportingStatus = document.getElementById('aup-youtube-reporting-status');
    const youtubeReportingDetail = document.getElementById('aup-youtube-reporting-detail');
    const refreshYoutubeReportingStatus = async () => {
      if (!youtubeReportingButton) return;
      try {
        const statusResponse = await fetch('https://aupositeur-google-insights.nicolas-rugolo.workers.dev/admin/youtube-reporting/status', {
          method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
        });
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok || !statusData.ok) return;
        if (statusData.reporting?.active) {
          if (youtubeReportingStatus) youtubeReportingStatus.textContent = 'Rapport actif';
          if (youtubeReportingDetail) youtubeReportingDetail.textContent = 'YouTube prépare et met à jour automatiquement les rapports Reach.';
          youtubeReportingButton.textContent = 'Activé';
          youtubeReportingButton.disabled = true;
          youtubeReportingButton.classList.add('is-active');
        }
      } catch {}
    };
    refreshYoutubeReportingStatus();
    if (youtubeReportingButton && !youtubeReportingButton.dataset.bound) {
      youtubeReportingButton.dataset.bound = 'true';
      youtubeReportingButton.addEventListener('click', async () => {
        youtubeReportingButton.disabled = true;
        youtubeReportingButton.textContent = 'Initialisation…';
        if (youtubeReportingStatus) youtubeReportingStatus.textContent = 'Connexion…';
        try {
          const setupResponse = await fetch('https://aupositeur-google-insights.nicolas-rugolo.workers.dev/admin/youtube-reporting/setup', {
            method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
          });
          const setupData = await setupResponse.json().catch(() => ({}));
          if (!setupResponse.ok || !setupData.ok) throw new Error(setupData.detail || 'Initialisation impossible');
          if (youtubeReportingStatus) youtubeReportingStatus.textContent = setupData.reporting?.created ? 'Rapport initialisé' : 'Rapport déjà actif';
          if (youtubeReportingDetail) youtubeReportingDetail.textContent = 'YouTube prépare maintenant les rapports Reach. Les premières données arriveront automatiquement.';
          youtubeReportingButton.textContent = 'Activé';
          youtubeReportingButton.classList.add('is-active');
        } catch (error) {
          if (youtubeReportingStatus) youtubeReportingStatus.textContent = 'À vérifier';
          if (youtubeReportingDetail) youtubeReportingDetail.textContent = String(error.message || error);
          youtubeReportingButton.disabled = false;
          youtubeReportingButton.textContent = 'Réessayer';
        }
      });
    }
    if (!gaUsers || !gscClicks) return;
    renderSearchState(gscQueries,'loading');
    renderSearchState(gscPages,'loading');
    try {
      const response = await fetch('https://aupositeur-google-insights.nicolas-rugolo.workers.dev/admin/insights', {
        method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) throw new Error('Insights ' + response.status);
      const data = await response.json();
      dashboardInsights = data;
      renderWorkPerformance();
      const ga = data.analytics || {};
      const gsc = data.searchConsole || {};
      const youtube = data.youtube || {};
      const periodChange = (current, previous, options = {}) => {
        const currentValue = Number(current || 0), previousValue = Number(previous || 0);
        if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return null;
        if (options.points) return { value:(currentValue - previousValue) * 100, suffix:' pt' };
        if (previousValue === 0) return currentValue === 0 ? {value:0,suffix:'%'} : null;
        return { value:((currentValue - previousValue) / Math.abs(previousValue)) * 100, suffix:'%' };
      };
      const renderPeriodChange = (id, change, inverse = false) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('is-up','is-down');
        if (!change || !Number.isFinite(change.value)) { el.textContent='Nouveau'; return; }
        const value = change.value;
        el.textContent = (value > 0 ? '+' : '') + value.toLocaleString('fr-BE',{maximumFractionDigits:1}) + change.suffix;
        const positive = inverse ? value < 0 : value > 0;
        if (value !== 0) el.classList.add(positive ? 'is-up' : 'is-down');
        el.title = 'Par rapport à la période précédente';
      };

      if (ga.error) {
        gaUsers.textContent = 'Données indisponibles';
        gaDetail.textContent = ga.error;
        gaStatus.textContent = 'À VÉRIFIER';
        gaStatus.classList.remove('is-ok');
      } else {
        gaUsers.textContent = Number(ga.activeUsers || 0).toLocaleString('fr-BE');
        gaDetail.textContent = Number(ga.sessions || 0).toLocaleString('fr-BE') + ' sessions · ' + Number(ga.pageViews || 0).toLocaleString('fr-BE') + ' pages vues';
        gaStatus.textContent = 'ACTIF';
        gaStatus.classList.add('is-ok');
        renderPeriodChange('aup-ga4-change', periodChange(ga.activeUsers, ga.previous?.activeUsers));
      }

      if (gsc.error) {
        gscClicks.textContent = 'Données indisponibles';
        gscDetail.textContent = gsc.error;
        gscStatus.textContent = 'À VÉRIFIER';
        gscStatus.classList.remove('is-ok');
        renderSearchState(gscQueries,'error');
        renderSearchState(gscPages,'error');
      } else {
        gscClicks.textContent = Number(gsc.clicks || 0).toLocaleString('fr-BE');
        const ctr = Number(gsc.ctr || 0) * 100;
        gscDetail.textContent = Number(gsc.impressions || 0).toLocaleString('fr-BE') + ' impressions · CTR ' + ctr.toLocaleString('fr-BE', {maximumFractionDigits:1}) + '% · position ' + Number(gsc.position || 0).toLocaleString('fr-BE', {maximumFractionDigits:1});
        gscStatus.textContent = 'ACTIF';
        gscStatus.classList.add('is-ok');
        renderPeriodChange('aup-gsc-change', periodChange(gsc.clicks, gsc.previous?.clicks));
        renderSearchQueries(gscQueries,gsc.queries||[],gsc.details?.queriesAvailable!==false);
        let contentIndex=new Map();
        try {
          const manifestResponse=await fetch('/studio-content.json',{cache:'no-store'});
          if(manifestResponse.ok) contentIndex=buildSearchContentIndex(await manifestResponse.json());
        } catch {}
        renderSearchPages(gscPages,gsc.pages||[],contentIndex,gsc.details?.pagesAvailable!==false);
      }

      if (youtubeViews && youtubeStatus) {
        if (youtube.error || youtube.configured === false) {
          youtubeViews.textContent = youtube.configured === false ? 'Non configuré' : 'Données indisponibles';
          const reconnect=youtube.needsReauthorization || /invalid_grant/.test(youtube.error||'');
          youtubeDetail.textContent = reconnect ? 'Autorisation Google expirée ou révoquée. Reconnecte ta chaîne YouTube.' : (youtube.error || 'Autorisation YouTube à terminer.');
          const reconnectLink=document.getElementById('aup-youtube-reconnect');
          if(reconnectLink) reconnectLink.hidden=!reconnect;
          youtubeStatus.textContent = 'À VÉRIFIER';
          youtubeStatus.classList.remove('is-ok');
          if (youtubeVideos) youtubeVideos.innerHTML = '<p class="aup-dashboard-search__state is-error">Données YouTube temporairement indisponibles.</p>';
          if (youtubeTrend) youtubeTrend.innerHTML = '<p class="aup-dashboard-search__state is-error">Évolution indisponible tant que la connexion YouTube n’est pas rétablie.</p>';
          if(reconnect) {
            if(youtubeReportingStatus) youtubeReportingStatus.textContent='Reconnexion requise';
            if(youtubeReportingDetail) youtubeReportingDetail.textContent='Reconnecte la chaîne pour accéder aux rapports YouTube.';
            if(youtubeReportingButton) { youtubeReportingButton.disabled=true; youtubeReportingButton.textContent='Connexion requise'; }
          }
        } else {
          const reconnectLink=document.getElementById('aup-youtube-reconnect');
          if(reconnectLink) reconnectLink.hidden=true;
          const views = Number(youtube.views || 0);
          const minutes = Number(youtube.estimatedMinutesWatched || 0);
          const average = Number(youtube.averageViewDuration || 0);
          const gained = Number(youtube.subscribersGained || 0);
          const lost = Number(youtube.subscribersLost || 0);
          const likes = Number(youtube.likes || 0);
          const previousLikes = Number(youtube.previousLikes || 0);
          const likesChange = Number(youtube.likesChange || 0);
          const likesChangePercent = youtube.likesChangePercent == null ? null : Number(youtube.likesChangePercent);
          const net = gained - lost;
          const hours = minutes / 60;
          const averageMinutes = Math.floor(average / 60);
          const averageSeconds = Math.round(average % 60);
          youtubeViews.textContent = views.toLocaleString('fr-BE');
          youtubeDetail.textContent = hours.toLocaleString('fr-BE',{maximumFractionDigits:1}) + ' h regardées · ' + (net >= 0 ? '+' : '') + net.toLocaleString('fr-BE') + ' abonnés nets';
          youtubeStatus.textContent = 'ACTIF';
          youtubeStatus.classList.add('is-ok');
          if (youtubeMetricViews) youtubeMetricViews.textContent = views.toLocaleString('fr-BE');
          if (youtubeWatchTime) youtubeWatchTime.textContent = hours.toLocaleString('fr-BE',{maximumFractionDigits:1}) + ' h';
          if (youtubeAverage) youtubeAverage.textContent = averageMinutes + ':' + String(averageSeconds).padStart(2,'0');
          if (youtubeSubs) youtubeSubs.textContent = (net >= 0 ? '+' : '') + net.toLocaleString('fr-BE') + ' net';
          if (youtubeSubsDetail) youtubeSubsDetail.textContent = '+' + gained.toLocaleString('fr-BE') + ' gagnés · −' + lost.toLocaleString('fr-BE') + ' perdus';
          if (youtubeTrend) {
            const days = Array.isArray(youtube.daily) ? youtube.daily : [];
            if (days.length) {
              const maxViews = Math.max(1, ...days.map((item) => Number(item.views || 0)));
              const totalDailyViews = days.reduce((sum, item) => sum + Number(item.views || 0), 0);
              const totalDailyLikes = days.reduce((sum, item) => sum + Number(item.likes || 0), 0);
              const cumulativeLikes = Number(days[days.length - 1]?.cumulativeLikes ?? totalDailyLikes);
              const likeVariation = likesChangePercent == null
                ? (previousLikes === 0 && likes > 0 ? 'nouveau sur la période' : 'variation indisponible')
                : ((likesChangePercent >= 0 ? '+' : '') + likesChangePercent.toLocaleString('fr-BE',{maximumFractionDigits:1}) + '% vs 28 j précédents');
              const activeDays = days.filter((item) => Number(item.views || 0) > 0).length;
              const bars = days.map((item) => {
                const value = Number(item.views || 0);
                const height = Math.max(value > 0 ? 8 : 2, (value / maxViews) * 100);
                const label = String(item.date || '').slice(5).split('-').reverse().join('/');
                return '<div class="aup-dashboard-youtube__day" title="'+escapeHtml(label+' · '+value+' vue'+(value===1?'':'s'))+'"><span style="height:'+height.toFixed(1)+'%"></span></div>';
              }).join('');
              youtubeTrend.innerHTML = '<div class="aup-dashboard-youtube__trend-summary"><strong>'+totalDailyViews.toLocaleString('fr-BE')+' vues · '+totalDailyLikes.toLocaleString('fr-BE')+' likes</strong><span>'+escapeHtml(likeVariation)+' · cumul '+cumulativeLikes.toLocaleString('fr-BE')+' likes · '+activeDays+' jours actifs sur '+days.length+'</span></div><div class="aup-dashboard-youtube__bars">'+bars+'</div>';
            } else youtubeTrend.innerHTML = '<p class="aup-dashboard-search__state is-empty">Pas encore assez de données quotidiennes.</p>';
          }

          if (youtubeVideos) {
            const items = Array.isArray(youtube.topVideos) ? youtube.topVideos : [];
            const classifyVideo = (item) => {
              const itemViews = Number(item.views || 0);
              const likes = Number(item.likes || 0);
              const likeRate = itemViews > 0 ? (likes / itemViews) * 100 : 0;
              const impressions = Number(item.impressions || 0);
              const ctr = Number(item.impressionsCtr || 0) * 100;
              const retention = Number(item.averageViewPercentage || 0);

              // Studio thresholds: confidence first, then packaging/retention/engagement.
              // YouTube notes CTR varies widely below 100 views; avoid strong verdicts there.
              if (itemViews < 20 || (youtube.details?.reachAvailable && impressions < 100)) {
                return {priority:4,label:'À OBSERVER',action:'Échantillon encore trop faible'};
              }
              if (youtube.details?.reachAvailable && impressions >= 100) {
                if (ctr < 2) return {priority:3,label:'À RETRAVAILLER',action:'Tester miniature et titre'};
                if (ctr >= 5 && retention >= 45 && likeRate >= 5) return {priority:1,label:'À POUSSER',action:'Créer un Short et relayer le titre'};
                if (ctr >= 5 && retention < 35) return {priority:3,label:'À RETRAVAILLER',action:'Le clic fonctionne : renforcer le début du clip'};
                if (ctr < 4 && retention >= 45) return {priority:2,label:'POTENTIEL',action:'Contenu solide : améliorer miniature et titre'};
              }
              if (retention >= 45 && likeRate >= 5) return {priority:2,label:'POTENTIEL',action:'Tester davantage de diffusion'};
              if (itemViews >= 100 && retention < 30) return {priority:3,label:'À RETRAVAILLER',action:'Améliorer les premières secondes'};
              return {priority:4,label:'À OBSERVER',action:'Accumuler davantage de données'};
            };
            const ranked = items.map((item) => ({item,decision:classifyVideo(item)}))
              .sort((a,b) => Number(b.item.views||0)-Number(a.item.views||0));
            youtubeVideos.innerHTML = ranked.length ? ranked.map(({item,decision},index) => {
              const title = String(item.title || item.videoId || 'Vidéo');
              const itemViews = Number(item.views || 0);
              const watched = Number(item.estimatedMinutesWatched || 0) / 60;
              const itemLikes = Number(item.likes || 0);
              const likeRate = itemViews > 0 ? (itemLikes / itemViews) * 100 : 0;
              const retention = Number(item.averageViewPercentage || 0);
              const impressions = Number(item.impressions || 0);
              const impressionsCtr = Number(item.impressionsCtr || 0) * 100;
              const reachText = youtube.details?.reachAvailable
                ? ' · '+impressions.toLocaleString('fr-BE')+' impressions · CTR '+impressionsCtr.toLocaleString('fr-BE',{maximumFractionDigits:1})+'%'
                : '';
              const retentionText = retention > 0 ? ' · '+retention.toLocaleString('fr-BE',{maximumFractionDigits:0})+'% vu' : '';
              const share = views > 0 ? (itemViews / views) * 100 : 0;
              const href = item.videoId ? 'https://www.youtube.com/watch?v=' + encodeURIComponent(item.videoId) : '';
              const label = href ? '<a href="'+href+'" target="_blank" rel="noopener">'+escapeHtml(title)+'</a>' : '<strong>'+escapeHtml(title)+'</strong>';
              const thumb = item.thumbnail ? '<img class="aup-dashboard-youtube__thumb" src="'+escapeHtml(String(item.thumbnail))+'" alt="" loading="lazy">' : '<span class="aup-dashboard-youtube__thumb is-empty">YT</span>';
              return '<div class="aup-dashboard-youtube__video"'+(!youtubeExpanded && index>=5?' hidden':'')+'><span class="aup-dashboard-search__rank">'+String(index+1).padStart(2,'0')+'</span>'+thumb+'<div class="aup-dashboard-search__content">'+label+'<small>'+itemViews.toLocaleString('fr-BE')+' vues · '+itemLikes.toLocaleString('fr-BE')+' like'+(itemLikes===1?'':'s')+' · '+likeRate.toLocaleString('fr-BE',{maximumFractionDigits:1})+'% · '+watched.toLocaleString('fr-BE',{maximumFractionDigits:1})+' h regardées'+retentionText+reachText+'<br><strong>'+escapeHtml(decision.label)+'</strong> · '+escapeHtml(decision.action)+'</small></div><div class="aup-dashboard-youtube__share"><strong>'+share.toLocaleString('fr-BE',{maximumFractionDigits:0})+'%</strong><span>des vues</span></div></div>';
            }).join('') : '<p class="aup-dashboard-search__state is-empty">Pas encore de données vidéo sur cette période.</p>';
            const toggle=document.getElementById('aup-youtube-toggle');
            if(toggle) { toggle.hidden=ranked.length<=5; toggle.setAttribute('aria-expanded',String(youtubeExpanded)); toggle.textContent=youtubeExpanded?'Réduire la liste':'Voir les '+ranked.length+' vidéos'; }
          }
        }
      }
    } catch {
      dashboardInsights={analytics:{error:true},searchConsole:{error:true},youtube:{error:true}};
      renderToday();
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
      if (youtubeViews) youtubeViews.textContent = 'Connexion impossible';
      if (youtubeDetail) youtubeDetail.textContent = 'Le service YouTube Analytics ne répond pas.';
      if (youtubeStatus) {
        youtubeStatus.textContent = 'À VÉRIFIER';
        youtubeStatus.classList.remove('is-ok');
      }
      if (youtubeVideos) youtubeVideos.innerHTML = '<p class="aup-dashboard-search__state is-error">Données YouTube temporairement indisponibles.</p>';
    }
  }

  async function loadDashboard() {
    if (dashboardLoaded || !draftsEl || !recentEl) return;
    dashboardLoaded = true;
    loadGoogleInsights();
    loadPinterestInsights();
    loadSocialTasks();
    if (document.body.classList.contains("aup-embedded")) loadCommunityCounts();
    const collections = [
      {name:'citations', label:'Citation'},
      {name:'ecrits', label:'Écrit'},
      {name:'reflexions', label:'Réflexion'},
      {name:'musiques', label:'Musique'},
      {name:'livres', label:'Livre'}
    ];
    const bases = {
      citations:'src/content/citations/', ecrits:'src/content/poemes/', musiques:'src/content/musiques/',
      livres:'src/content/livres/', reflexions:'src/content/reflexions/'
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

      // Keep the dashboard independent from GitHub's unauthenticated API.
      // The static Studio manifest is generated with the site and is the source
      // for editorial dates. Its generation time also identifies this deployed build.
      const lastChangeEl = document.getElementById('aup-site-last-change');
      if (lastChangeEl) {
        lastChangeEl.textContent = manifest.generatedAt
          ? formatDashboardDate(manifest.generatedAt)
          : '—';
      }

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

      dashboardManifest = manifest;
      renderWorkPerformance();

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
      ['citations','ecrits','reflexions','musiques','livres'].forEach((name) => {
        const el = document.getElementById('aup-stat-' + name);
        if (el) el.textContent = String(totals[name] || 0);
      });

      const itemHtml = (item, showDate=false) => {
        const date = showDate && item.changedAt ? ` · ${formatDashboardDate(item.changedAt)}` : '';
        return `<div class="aup-dashboard-item"><div><strong>${escapeHtml(item.title)}</strong><small>${item.type}${date}</small></div><a href="${embedded ? studioBase + "#/collections/" + item.collection : "/admin/#/collections/" + item.collection + "/entries/" + encodeURIComponent(item.slug)}" target="${embedded ? "_top" : "_self"}">Ouvrir →</a></div>`;
      };
      renderToday();

      const drafts = details.filter((item) => item.draft).sort((a,b) => (b.changedAt || '').localeCompare(a.changedAt || '')).slice(0,6);
      draftCountEl.textContent = String(details.filter((item) => item.draft).length);
      draftsEl.innerHTML = drafts.length ? drafts.map((item) => itemHtml(item, true)).join('') : '<p class="aup-dashboard-empty">Aucun contenu masqué.</p>';

      const recent = details.filter((item) => item.changedAt).sort((a,b) => b.changedAt.localeCompare(a.changedAt)).slice(0,6);
      recentEl.innerHTML = recent.length ? recent.map((item) => itemHtml(item, true)).join('') : '<p class="aup-dashboard-empty">Aucune modification récente trouvée.</p>';
    } catch {
      draftsEl.innerHTML = '<p class="aup-dashboard-empty">Le catalogue des contenus masqués est indisponible.</p>';
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
      ['citations','ecrits','reflexions','musiques','livres'].forEach((name) => {
        const el = document.getElementById('aup-stat-' + name);
        if (el) el.textContent = '—';
      });
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

  const embedded = document.body.classList.contains('aup-embedded');
  const studioBase = '/admin/sveltia/';
  const moduleHref = (legacy, page) => embedded ? studioBase + '#/pages/' + page : legacy;

  async function loadCommunityCounts() {
    const requests = [
      ['/api/admin/comments?status=pending', 'aup-pending-comments', data =>
        data.comments.length >= 200 ? '200 ou plus' : String(data.comments.length)],
      ['/api/admin/subscribers', 'aup-active-subscribers', data => {
        const count = data.subscribers.filter(item => item.status === 'active').length;
        return data.subscribers.length >= 500 ? count + ' dans les 500 derniers' : String(count);
      }],
    ];
    await Promise.all(requests.map(async ([url, target, count]) => {
      const element = document.getElementById(target);
      try {
        const response = await window.aupositeurCommunityRequest(url, { cache: 'no-store' });
        if (!response.ok) throw Error('HTTP ' + response.status);
        element.textContent = count(await response.json());
      } catch {
        element.textContent = 'Accès à vérifier';
      }
    }));
  }

  window.aupositeurDashboard = Object.freeze({ load: loadDashboard });
  if (embedded) loadDashboard();
})();
