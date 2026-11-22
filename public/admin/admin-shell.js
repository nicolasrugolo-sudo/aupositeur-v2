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
  const library = document.getElementById('aup-library');
  const libraryTitle = document.getElementById('aup-library-title');
  const libraryKicker = document.getElementById('aup-library-kicker');
  const libraryNew = document.getElementById('aup-library-new');
  const libraryList = document.getElementById('aup-library-list');
  const librarySearch = document.getElementById('aup-library-search');
  const libraryResultCount = document.getElementById('aup-library-result-count');
  const libraryCategory = document.getElementById('aup-library-category');
  const librarySort = document.getElementById('aup-library-sort');
  const qualityPanel = document.getElementById('aup-editor-quality');
  const qualityList = document.getElementById('aup-editor-quality-list');
  const qualityCount = document.getElementById('aup-quality-count');
  let categoryLabels = new Map();
  const reflectionPreviewButton = document.getElementById('aup-reflection-mobile-preview');
  const cmsRoot = document.getElementById('nc-root');
  const setReflectionPreview = (show) => {
    cmsRoot.classList.toggle('aup-reflection-preview-open', show);
    reflectionPreviewButton.textContent = show ? 'Écrire' : 'Aperçu';
    reflectionPreviewButton.setAttribute('aria-pressed', String(show));
  };
  reflectionPreviewButton.addEventListener('click',()=>{
    const show = reflectionPreviewButton.getAttribute('aria-pressed') !== 'true';
    if (show && !cmsRoot.querySelector('iframe')) cmsRoot.querySelector('button[title="Toggle preview"]')?.click();
    setReflectionPreview(show);
  });
  const libraryFilters = [...document.querySelectorAll('[data-filter]')];
  const libraryCounts = {all:document.getElementById('aup-count-all'),published:document.getElementById('aup-count-published'),draft:document.getElementById('aup-count-draft')};
  const libraryCache = new Map();
  let libraryFilter = 'all';
  // The dashboard uses Decap's valid root route (#/) so a hard refresh never
  // sends the CMS router to an unknown custom hash.
  if (window.location.hash === '#studio') history.replaceState(null, '', '/admin/#/');
  if (window.location.hash === '#studio-media') history.replaceState(null, '', '/admin/#/');
  let dashboardRequested = !window.location.hash || window.location.hash === '#/' || window.location.hash === '#';

  const routes = [
    { test: /#\/workflow(?:[/?]|$)/, nav:"workflow", kicker:"CONTENU", title:"Brouillons et relecture" },
    { test: /#\/collections\/categories|#\/edit\/categories\//, nav:'categories', kicker:'CONTENU / CATÉGORIES', title:'Catégories' },
    { test: /#\/collections\/reflexions|#\/edit\/reflexions\//, nav:'reflexions', kicker:'CONTENU / RÉFLEXIONS', title:'Réflexions' },
    { test: /#\/collections\/citations|#\/edit\/citations\//, nav:'citations', kicker:'CONTENU / CITATIONS', title:'Citations' },
    { test: /#\/collections\/ecrits|#\/edit\/ecrits\//, nav:'ecrits', kicker:'CONTENU / ÉCRITS', title:'Écrits' },
    { test: /#\/collections\/musiques|#\/edit\/musiques\//, nav:'musiques', kicker:'CONTENU / MUSIQUES', title:'Musiques' },
    { test: /#\/collections\/livres|#\/edit\/livres\//, nav:'livres', kicker:'CONTENU / LIVRES', title:'Livres' },
    { test: /#\/collections\/boutique|#\/edit\/boutique\//, nav:'boutique', kicker:'CONTENU / BOUTIQUE', title:'Boutique' },
    { test: /#\/edit\/pages\/home/, nav:'home', kicker:'SITE / ACCUEIL', title:'Page d’accueil' },
    { test: /#\/edit\/pages\/about/, nav:'about', kicker:'SITE / À PROPOS', title:'À propos' },
    { test: /#\/edit\/settings\/site|#\/collections\/settings/, nav:'settings', kicker:'SITE / RÉGLAGES', title:'Réglages' },
  ];

  function syncNavigation() {
    const location = window.location.href;
    const route = routes.find((item) => item.test.test(location));
    const active = route?.nav || 'admin';
    links.forEach((link) => {
      const selected = link.dataset.nav === active;
      link.classList.toggle('is-active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    // Reveal the active section, including after hash navigation and reload.
    const activeLink = links.find((link) => link.dataset.nav === active);
    const activeSection = activeLink?.closest('details.aup-nav-accordion');
    if (activeSection && !activeSection.open) activeSection.open = true;
    kicker.textContent = route?.kicker || 'AUPOSITEUR / STUDIO';
    title.textContent = route?.title || 'Tableau de bord';
    const isDashboard = dashboardRequested || !window.location.hash || window.location.hash === '#/' || window.location.hash === '#';
    document.getElementById('aup-dashboard')?.classList.toggle('is-visible', isDashboard);
    const collectionMatch = window.location.hash.match(/^#\/collections\/(citations|ecrits|musiques|livres|reflexions)$/);
    const isLibrary = Boolean(collectionMatch);
    const help = document.getElementById('aup-reflection-help');
    help.hidden = !/^#\/collections\/(citations|ecrits|reflexions|musiques|livres)\/(new|entries\/)/.test(window.location.hash);
    qualityPanel.hidden = true;
    if (help.hidden) help.open = false;
    reflectionPreviewButton.hidden = help.hidden;
    cmsRoot.classList.toggle('aup-reflection-editor', !help.hidden);
    setReflectionPreview(false);
    if (library) library.hidden = !isLibrary;
    if (mediaPage) mediaPage.hidden = true;
    document.getElementById('nc-root')?.classList.toggle('aup-library-active', isLibrary);
    if (isDashboard) window.aupositeurDashboard.load();
    if (isLibrary) loadLibrary(collectionMatch[1]);
    closeMenu();
  }

  const libraryMetas = {
      reflexions:{title:"Réflexions",singular:"réflexion",kicker:"CONTENU / RÉFLEXIONS"},
      citations:{title:'Citations',singular:'citation',kicker:'CONTENU / CITATIONS',base:'src/content/citations/'},
      ecrits:{title:'Écrits',singular:'écrit',kicker:'CONTENU / ÉCRITS',base:'src/content/poemes/'},
      musiques:{title:'Musiques',singular:'morceau',kicker:'CONTENU / MUSIQUES',base:'src/content/musiques/'},
      livres:{title:'Livres',singular:'livre',kicker:'CONTENU / LIVRES',base:'src/content/livres/'}
    };

  async function loadLibrary(collection) {
    if (!libraryList) return;
    const meta = libraryMetas[collection];
    if (!meta) return;
    libraryTitle.textContent=meta.title; libraryKicker.textContent=meta.kicker;
    libraryNew.href='/admin/#/collections/'+collection+'/new';
    libraryNew.textContent=collection==='reflexions'?'Nouvelle réflexion':collection==='musiques'?'+ Nouveau morceau':collection==='ecrits'?'+ Nouvel écrit':collection==='livres'?'+ Nouveau livre':'+ Nouvelle citation';
    if (library.dataset.collection !== collection) {
      libraryCategory.value = '';
      librarySearch.value = '';
      libraryFilters.find(button => button.dataset.filter === 'all')?.click();
    }
    library.dataset.collection=collection;
    const feature = document.getElementById('aup-reflection-feature');
    feature.hidden = false;
    if (!feature.hidden) {
      document.getElementById('aup-reflection-current').textContent = 'Lecture de la sélection…';
      document.getElementById('aup-reflection-current-edit').hidden = true;
    }
    libraryList.innerHTML='<p class="aup-library-loading">Lecture de la bibliothèque…</p>';
    try {
      const manifestRes = await fetch('/studio-content.json', {cache:'no-store'});
      if (!manifestRes.ok) throw new Error('manifest');
      const manifest = await manifestRes.json();
      const items = manifest.collections?.[collection] || [];
      libraryCache.set(collection, items);
      categoryLabels = new Map((manifest.categories || []).map(({id, label}) => [id, label]));
      if (window.location.hash !== '#/collections/' + collection) return;
      const candidates = items.filter(item => item.featured && !item.draft);
      if (collection === 'reflexions') candidates.sort((a, b) => b.date.localeCompare(a.date));
      if (collection === 'musiques') candidates.sort((a, b) => a.order - b.order);
      const limit = ['livres', 'reflexions'].includes(collection) ? 1 : 3;
      const selection = candidates.slice(0, limit);
      document.getElementById('aup-reflection-current').textContent = selection.length
        ? selection.map(item => item.title).join(' · ')
        : 'Aucune sélection pour cette rubrique.';
      const edit = document.getElementById('aup-reflection-current-edit');
      if (selection.length === 1) edit.href = '/admin/#/collections/' + collection + '/entries/' + encodeURIComponent(selection[0].slug);
      edit.hidden = selection.length !== 1;
      document.getElementById('aup-home-selection-overflow').hidden = candidates.length <= limit;
      const category = libraryCategory.value;
      const usedCategories = new Set(items.flatMap(item => item.categories || []));
      libraryCategory.replaceChildren(new Option('Toutes', ''), ...[...usedCategories]
        .sort((a, b) => (categoryLabels.get(a) || a).localeCompare(categoryLabels.get(b) || b, 'fr'))
        .map(id => new Option(categoryLabels.get(id) || id, id)));
      libraryCategory.value = usedCategories.has(category) ? category : '';
      renderLibrary(items,collection,meta);
    } catch {
      if (window.location.hash !== '#/collections/' + collection) return;
      if (!feature.hidden) document.getElementById('aup-reflection-current').textContent = 'Sélection indisponible.';
      libraryList.innerHTML='<p class="aup-library-empty">Impossible de charger la bibliothèque pour le moment.</p>';
    }
  }

  const searchText = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');

  function renderLibrary(items,collection,meta) {
    const query=searchText(librarySearch.value.trim());
    const counts={all:items.length,published:items.filter((x)=>!x.draft).length,draft:items.filter((x)=>x.draft).length};
    Object.entries(counts).forEach(([key,value])=>{if(libraryCounts[key]) libraryCounts[key].textContent=String(value);});
    const filtered=items.filter((item)=>{
      if(libraryFilter==='published'&&item.draft)return false;
      if(libraryFilter==='draft'&&!item.draft)return false;
      const categories = item.categories || [];
      if (libraryCategory.value && !categories.includes(libraryCategory.value)) return false;
      const haystack=searchText([item.title,item.description,item.subtitle,item.author,item.publisher,item.lead,...categories.map(id => categoryLabels.get(id) || id)].filter(Boolean).join(' '));
      return !query||haystack.includes(query);
    }).sort((a,b)=>{
      const sort = librarySort?.value || 'newest';
      if (sort === 'title') return (a.title||'').localeCompare(b.title||'', 'fr');
      if (sort === 'title-desc') return (b.title||'').localeCompare(a.title||'', 'fr');
      if (sort === 'oldest') return (a.date||'').localeCompare(b.date||'') || (a.title||'').localeCompare(b.title||'', 'fr');
      return (b.date||'').localeCompare(a.date||'') || (a.title||'').localeCompare(b.title||'', 'fr');
    });
    libraryResultCount.textContent=filtered.length+' '+(filtered.length===1?meta.singular:meta.title.toLowerCase());
    libraryList.innerHTML=filtered.length?filtered.map((item)=>{
      const badges=(item.draft?'<span class="is-draft">MASQUÉ</span>':'<span class="is-published">SUR LE SITE</span>');
      const type=collection==='musiques'&&item.kind?(item.kind==='reprise'?'REPRISE':'COMPOSITION'):'';
      const date=item.date?formatLibraryDate(item.date):'';
      const description = item.subtitle || item.lead || item.description;
      const categoryNames = (item.categories || []).map(id => categoryLabels.get(id) || id).join(' · ');
      const editorialUrl = '/admin/#/collections/' + collection + '/entries/' + encodeURIComponent(item.slug);
      const publicSection = collection === 'musiques' ? 'musique' : collection;
      const publicUrl = '/' + publicSection + '/' + (item.publicSlug || item.slug).split('/').map(encodeURIComponent).join('/') + '/';
      const publicLink = item.draft ? '' : '<a href="' + publicUrl + '" target="_blank" rel="noopener">Voir ↗</a>';
      return '<article class="aup-library-row"><div class="aup-library-row-main"><strong><a href="' + editorialUrl + '">' + escapeHtml(item.title) + '</a></strong>' + (description ? '<p>' + escapeHtml(description) + '</p>' : '') + '</div><div class="aup-library-row-meta">' + (type ? '<small>'+type+'</small>' : '') + (date ? '<time>'+escapeHtml(date)+'</time>' : '') + (categoryNames ? '<small>' + escapeHtml(categoryNames) + '</small>' : '') + '</div><div class="aup-library-badges">'+badges+'</div><div class="aup-library-row-actions"><a href="' + editorialUrl + '">Modifier</a>' + publicLink + '</div></article>';
    }).join(''):'<p class="aup-library-empty">Aucun contenu ne correspond à ce filtre.</p>';
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

  const mediaLink = document.querySelector('[data-nav="media"]');
  const mediaPage = document.getElementById('aup-media-page');
  const mediaGrid = document.getElementById('aup-media-grid');
  const mediaSearch = document.getElementById('aup-media-search');
  const mediaSort = document.getElementById('aup-media-sort');
  const mediaStatus = document.getElementById('aup-media-status');
  const mediaNative = document.getElementById('aup-media-native');
  const mediaUpload = document.getElementById('aup-media-upload');
  const mediaUploadInput = document.getElementById('aup-media-upload-input');
  const mediaUploadDialog = document.getElementById('aup-media-upload-dialog');
  const mediaUploadNote = document.getElementById('aup-media-upload-note');
  const mediaDelete = document.getElementById('aup-media-delete');
  const mediaSelectedCount = document.getElementById('aup-media-selected-count');
  const mediaButtons = [...document.querySelectorAll('[data-media-filter]')];
  let mediaItems = [];
  let mediaFilter = 'all';
  let mediaLoaded = false;
  const selectedMedia = new Set();

  const formatMediaBytes = (bytes) => {
    const n=Number(bytes||0); if(!n) return '—';
    if(n<1024*1024) return (n/1024).toFixed(0)+' Ko';
    return (n/(1024*1024)).toFixed(1)+' Mo';
  };

  function mediaAdminToken() {
    return window.aupositeurMediaSession.get('audio');
  }

  function downloadMedia(url,name) {
    const a=document.createElement('a');
    a.href=url; a.download=name||''; a.rel='noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function openNativeMedia() {
    const root=document.getElementById('nc-root');
    const candidates=[...(root?.querySelectorAll('button,[role="button"]')||[])];
    const nativeMedia=candidates.find((el)=>{
      const t=(el.textContent||'').trim().toLowerCase();
      const a=(el.getAttribute('aria-label')||el.getAttribute('title')||'').trim().toLowerCase();
      return ['media','média','médias'].includes(t)||['media','média','médias'].includes(a);
    });
    if(nativeMedia) nativeMedia.click();
    else showStudioNotice('Sélecteur Decap indisponible','Decap n’a pas encore initialisé son gestionnaire de médias.');
  }

  async function inspectWav(item, card) {
    const out=card.querySelector('[data-audio-tech]');
    if(!out||out.dataset.loaded==='1') return;
    out.textContent='Analyse WAV…';
    try {
      const r=await fetch(item.url,{headers:{Range:'bytes=0-65535'},cache:'no-store'});
      if(!r.ok && r.status!==206) throw new Error('HTTP '+r.status);
      const b=await r.arrayBuffer(), v=new DataView(b);
      const ascii=(o,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(v.getUint8(o+i))).join('');
      if(ascii(0,4)!=='RIFF'||ascii(8,4)!=='WAVE') throw new Error('En-tête WAV invalide');
      let p=12, fmt=null;
      while(p+8<=v.byteLength){
        const id=ascii(p,4), size=v.getUint32(p+4,true), start=p+8;
        if(id==='fmt ' && start+Math.min(size,40)<=v.byteLength){
          let tag=v.getUint16(start,true), channels=v.getUint16(start+2,true), rate=v.getUint32(start+4,true), byteRate=v.getUint32(start+8,true), bits=v.getUint16(start+14,true);
          let effectiveTag=tag;
          if(tag===0xfffe && size>=40 && start+26<v.byteLength) effectiveTag=v.getUint16(start+24,true);
          const label=effectiveTag===1?'PCM':effectiveTag===3?'IEEE FLOAT':effectiveTag===0xfffe?'EXTENSIBLE':'FORMAT '+effectiveTag;
          fmt={tag,effectiveTag,label,channels,rate,byteRate,bits};
          break;
        }
        p=start+size+(size%2);
      }
      if(!fmt) throw new Error('Bloc fmt introuvable');
      out.dataset.loaded='1';
      out.textContent=fmt.label+' · tag '+fmt.effectiveTag+' · '+fmt.bits+' bits · '+(fmt.rate/1000).toFixed(fmt.rate%1000?1:0)+' kHz · '+fmt.channels+' canaux · '+((fmt.byteRate*8)/1000000).toFixed(3)+' Mb/s';
    } catch(e) {
      out.textContent='Analyse impossible : '+(e&&e.message?e.message:'erreur');
    }
  }

  function updateMediaSelection() {
    const count=selectedMedia.size;
    if(mediaDelete) mediaDelete.disabled=count===0;
    if(mediaSelectedCount) mediaSelectedCount.textContent=count?'('+count+')':'';
    mediaGrid?.querySelectorAll('.aup-media-card').forEach(card=>{
      const selected = selectedMedia.has(card.dataset.mediaId);
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }

  function mediaId(item){ return item.type+':'+(item.key||item.path||item.url); }

  function renderMedia() {
    if(!mediaGrid) return;
    const q=(mediaSearch?.value||'').trim().toLowerCase();
    const shown=mediaItems.filter((item)=>(mediaFilter==='all'||item.type===mediaFilter)&&(!q||item.name.toLowerCase().includes(q))).sort((a,b)=>{
      const mode=mediaSort?.value||'name';
      if(mode==='size') return (a.bytes||0)-(b.bytes||0)||a.name.localeCompare(b.name,'fr');
      if(mode==='size-desc') return (b.bytes||0)-(a.bytes||0)||a.name.localeCompare(b.name,'fr');
      if(mode==='name-desc') return b.name.localeCompare(a.name,'fr');
      return a.name.localeCompare(b.name,'fr');
    });
    mediaGrid.innerHTML=shown.map((item)=>{
      const badge=item.type==='image'?'PHOTO':item.type==='audio'?'MUSIQUE':'VIDÉO';
      const preview=item.type==='image'
        ? '<img loading="lazy" src="'+escapeHtml(item.url)+'" alt="">'
        : item.type==='audio'
          ? '<div class="aup-media-audio-mark">♪</div><audio controls preload="none" src="'+escapeHtml(item.url)+'"></audio>'
          : '<video controls preload="none" src="'+escapeHtml(item.url)+'"></video>';
      return '<article class="aup-media-card" tabindex="0" role="button" aria-pressed="'+(selectedMedia.has(mediaId(item))?'true':'false')+'" data-media-id="'+escapeHtml(mediaId(item))+'" data-type="'+item.type+'" data-media-url="'+escapeHtml(item.url)+'"><div class="aup-media-preview">'+preview+'</div><div class="aup-media-card-body"><span>'+badge+'</span><strong title="'+escapeHtml(item.name)+'">'+escapeHtml(item.name)+'</strong><small>'+formatMediaBytes(item.bytes)+'</small>'+(item.type==='audio'?'<small class="aup-media-tech" data-audio-tech>Analyse en attente</small>':'')+'<div class="aup-media-card-actions"><a href="'+escapeHtml(item.url)+'" target="_blank" rel="noopener">Ouvrir ↗</a><button type="button" data-media-download="'+escapeHtml(item.url)+'" data-media-name="'+escapeHtml(item.name)+'">Télécharger ↓</button><button type="button" data-copy-media="'+escapeHtml(item.url)+'">Copier le lien</button></div></div></article>';
    }).join('') || '<p class="aup-library-empty">Aucun média correspondant.</p>';
    mediaGrid.querySelectorAll('[data-media-download]').forEach((button)=>button.addEventListener('click',(event)=>{event.stopPropagation();downloadMedia(button.dataset.mediaDownload,button.dataset.mediaName)}));
    mediaGrid.querySelectorAll('.aup-media-card').forEach((card)=>{
      const toggle=()=>{const id=card.dataset.mediaId;if(selectedMedia.has(id))selectedMedia.delete(id);else selectedMedia.add(id);updateMediaSelection();};
      card.addEventListener('click',(event)=>{if(event.target.closest('a,audio,video,button'))return;toggle();});
      card.addEventListener('keydown',(event)=>{if(event.target===card && (event.key==='Enter'||event.key===' ')){event.preventDefault();toggle();}});
    });
    mediaGrid.querySelectorAll('[data-copy-media]').forEach(button => button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(new URL(button.dataset.copyMedia, window.location.origin).href);
        showStudioNotice('Lien copié', 'Le lien du média est dans le presse-papiers.');
      } catch {
        showStudioNotice('Copie indisponible', 'Ouvre le média pour récupérer son adresse.');
      }
    }));
    updateMediaSelection();
    const audioShown=shown.filter(x=>x.type==='audio');
    [...mediaGrid.querySelectorAll('.aup-media-card[data-type="audio"]')].forEach((card,i)=>{
      card.addEventListener('focusin', () => inspectWav(audioShown[i],card), {once:true});
      card.addEventListener('pointerenter', () => inspectWav(audioShown[i],card), {once:true});
    });
  }

  async function loadMediaPage() {
    if(mediaLoaded) return renderMedia();
    mediaStatus.textContent='Chargement…';
    try {
      const manifest=await fetch('/admin/media-manifest.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('manifest');return r.json();});
      const local=[
        ...(manifest.images||[]).map(x=>({...x,type:'image'})),
        ...(manifest.videos||[]).map(x=>({...x,type:'video'})),
      ];
      let audio=[];
      try {
        let token=mediaAdminToken();
        if(token) {
          const r=await fetch('https://aupositeur-media-api.nicolas-rugolo.workers.dev/admin/audio-files',{headers:{'X-Aupositeur-Admin':token}});
          if(r.ok) {
            const data=await r.json();
            audio=(data.files||[]).map(x=>({type:'audio',name:x.name||x.key.split('/').pop(),url:'https://aupositeur-media-api.nicolas-rugolo.workers.dev/media/'+x.key,bytes:x.bytes||0,key:x.key}));
          }
        }
      } catch {}
      mediaItems=[...local,...audio];
      for(const id of [...selectedMedia]) if(!mediaItems.some(item=>mediaId(item)===id)) selectedMedia.delete(id);
      const counts={image:mediaItems.filter(x=>x.type==='image').length,audio:mediaItems.filter(x=>x.type==='audio').length,video:mediaItems.filter(x=>x.type==='video').length};
      document.getElementById('aup-media-count-all').textContent=mediaItems.length;
      document.getElementById('aup-media-count-image').textContent=counts.image;
      document.getElementById('aup-media-count-audio').textContent=counts.audio;
      document.getElementById('aup-media-count-video').textContent=counts.video;
      mediaStatus.textContent=counts.image+' photos · '+counts.audio+' musiques · '+counts.video+' vidéos';
      mediaLoaded=true; renderMedia();
    } catch {
      mediaStatus.textContent='Chargement impossible';
      mediaGrid.innerHTML='<p class="aup-library-empty">La médiathèque n’a pas pu être chargée.</p>';
    }
  }

  function showMediaPage({updateUrl=true}={}) {
    dashboardRequested=false;
    if(updateUrl) history.replaceState({aupPage:'media'}, '', '/admin/#studio-media');
    document.getElementById('aup-dashboard')?.classList.remove('is-visible');
    if(library) library.hidden=true;
    if(mediaPage) mediaPage.hidden=false;
    document.getElementById('nc-root')?.classList.add('aup-library-active');
    links.forEach((link) => {
      const selected = link.dataset.nav === 'media';
      link.classList.toggle('is-active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const mediaSection = mediaLink?.closest('details.aup-nav-accordion');
    if (mediaSection) mediaSection.open = true;
    kicker.textContent='MÉDIAS / MÉDIATHÈQUE'; title.textContent='Médiathèque';
    closeMenu(); loadMediaPage();
  }

  async function uploadAudioFile(file) {
    if (!['www.aupositeur.be', 'aupositeur.be'].includes(window.location.hostname)) throw new Error('Les écritures de la médiathèque sont réservées au site de production.');
    const token=mediaAdminToken(); if(!token) throw new Error('Token administrateur requis.');
    const base='https://aupositeur-media-api.nicolas-rugolo.workers.dev';
    const headers={'X-Aupositeur-Admin':token,'Content-Type':'application/json'};
    const prep=await fetch(base+'/admin/audio-files/upload-url',{method:'POST',headers,body:JSON.stringify({name:file.name,type:file.type||'application/octet-stream',size:file.size})});
    const p=await prep.json(); if(!prep.ok) throw new Error(p.error||'Préparation impossible');
    const put=await fetch(p.uploadUrl,{method:'PUT',headers:{'Content-Type':p.contentType},body:file}); if(!put.ok) throw new Error('Envoi R2 impossible (HTTP '+put.status+')');
    const confirm=await fetch(base+'/admin/audio-files/confirm',{method:'POST',headers,body:JSON.stringify({key:p.key,name:file.name,type:file.type,size:file.size})});
    const done=await confirm.json(); if(!confirm.ok) throw new Error(done.error||'Confirmation impossible');
    return done;
  }

  function decapGithubToken() {
    for (const storage of [localStorage,sessionStorage]) {
      for (let i=0;i<storage.length;i++) {
        const key=storage.key(i); if(!key) continue;
        try {
          const raw=storage.getItem(key); if(!raw) continue;
          const value=JSON.parse(raw);
          const token=value?.token||value?.access_token||value?.user?.token||value?.user?.access_token;
          if(typeof token==='string'&&token.length>20) return token;
        } catch {}
      }
    }
    return '';
  }

  const safeMediaName=(name)=>String(name||'media').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').toLowerCase();

  async function fileToBase64(file) {
    const bytes=new Uint8Array(await file.arrayBuffer());
    let binary='', step=0x8000;
    for(let i=0;i<bytes.length;i+=step) binary+=String.fromCharCode(...bytes.subarray(i,i+step));
    return btoa(binary);
  }

  async function uploadRepositoryMedia(file,type) {
    if (!['www.aupositeur.be', 'aupositeur.be'].includes(window.location.hostname)) throw new Error('Les écritures de la médiathèque sont réservées au site de production.');
    if(file.size>40*1024*1024) throw new Error('Photo/vidéo limitée à 40 Mo pour un envoi GitHub fiable.');
    const token=decapGithubToken();
    if(!token) throw new Error('Session GitHub Decap introuvable. Recharge le Studio puis reconnecte-toi si nécessaire.');
    const folder=type==='image'?'public/images':'public/videos/citations';
    const filename=safeMediaName(file.name);
    const path=folder+'/'+filename;
    const api='https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2/contents/'+path.split('/').map(encodeURIComponent).join('/');
    const exists=await fetch(api+'?ref=main',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
    if(exists.ok) throw new Error('Un fichier nommé '+filename+' existe déjà.');
    if(exists.status!==404) throw new Error('GitHub refuse la vérification du fichier (HTTP '+exists.status+').');
    const content=await fileToBase64(file);
    const response=await fetch(api,{method:'PUT',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({message:'Upload media: '+filename,content,branch:'main'})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.message||('Upload GitHub impossible (HTTP '+response.status+')'));
    return {path,url:'/'+path.replace(/^public\//,'')};
  }

  function chooseRepositoryMedia(type) {
    mediaUploadDialog?.close();
    mediaUploadInput.dataset.type=type;
    mediaUploadInput.accept=type==='image'?'.jpg,.jpeg,.png,.webp,.gif,.avif,image/*':'.mp4,.webm,video/mp4,video/webm';
    mediaUploadInput.click();
  }

  mediaUpload?.addEventListener('click',()=>mediaUploadDialog?.showModal());
  document.querySelectorAll('[data-upload-type]').forEach((button)=>button.addEventListener('click',()=>{
    const type=button.dataset.uploadType;
    if(type==='audio'){
      mediaUploadDialog?.close();
      mediaUploadInput.accept='.mp3,.wav,.flac,.m4a,audio/mpeg,audio/wav,audio/flac,audio/mp4';
      mediaUploadInput.dataset.type='audio';
      mediaUploadInput.click();
    } else chooseRepositoryMedia(type);
  }));
  mediaUploadInput?.addEventListener('change',async()=>{
    const file=mediaUploadInput.files?.[0]; if(!file) return;
    try {
      mediaStatus.textContent='Téléversement de '+file.name+'…';
      const type=mediaUploadInput.dataset.type||'audio';
      if(type==='audio') {
        await uploadAudioFile(file);
        mediaLoaded=false;
        mediaUploadInput.value='';
        await loadMediaPage();
        showStudioNotice('Média ajouté',file.name+' est disponible dans la médiathèque.');
      } else {
        await uploadRepositoryMedia(file,type);
        mediaUploadInput.value='';
        mediaStatus.textContent='Fichier envoyé · publication Cloudflare en cours';
        showStudioNotice('Média ajouté',file.name+' a été envoyé. Il apparaîtra ici dès la fin du build Cloudflare.');
      }
    } catch(error) {
      mediaStatus.textContent='Échec du téléversement';
      showStudioNotice('Téléversement impossible',error?.message||'Erreur inconnue');
    }
  });

  async function deleteRepositoryMedia(item) {
    if (!['www.aupositeur.be', 'aupositeur.be'].includes(window.location.hostname)) throw new Error('Les écritures de la médiathèque sont réservées au site de production.');
    const token=decapGithubToken(); if(!token) throw new Error('Session GitHub Decap introuvable.');
    const path=item.path||('public'+item.url);
    const api='https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2/contents/'+path.split('/').map(encodeURIComponent).join('/');
    const current=await fetch(api+'?ref=main',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
    const data=await current.json().catch(()=>({}));
    if(!current.ok) throw new Error(data?.message||('Lecture GitHub impossible (HTTP '+current.status+')'));
    const response=await fetch(api,{method:'DELETE',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify({message:'Delete media: '+item.name,sha:data.sha,branch:'main'})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result?.message||('Suppression GitHub impossible (HTTP '+response.status+')'));
  }

  async function deleteAudioMedia(item) {
    if (!['www.aupositeur.be', 'aupositeur.be'].includes(window.location.hostname)) throw new Error('Les écritures de la médiathèque sont réservées au site de production.');
    const token=mediaAdminToken(); if(!token) throw new Error('Token administrateur requis.');
    const response=await fetch('https://aupositeur-media-api.nicolas-rugolo.workers.dev/admin/audio-files',{method:'DELETE',headers:{'X-Aupositeur-Admin':token,'Content-Type':'application/json'},body:JSON.stringify({key:item.key})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error||('Suppression R2 impossible (HTTP '+response.status+')'));
  }

  mediaDelete?.addEventListener('click',async()=>{
    const items=mediaItems.filter(item=>selectedMedia.has(mediaId(item)));
    if(!items.length)return;
    const names=items.slice(0,6).map(x=>'• '+x.name).join('\n')+(items.length>6?'\n• …':'');
    if(!window.confirm('SUPPRESSION DÉFINITIVE\n\n'+names+'\n\nCette action est irréversible. Confirmer ?')) return;
    mediaDelete.disabled=true;
    mediaStatus.textContent='Suppression de '+items.length+' média'+(items.length>1?'s':'')+'…';
    try {
      for(const item of items) {
        if(item.type==='audio') await deleteAudioMedia(item);
        else await deleteRepositoryMedia(item);
        selectedMedia.delete(mediaId(item));
      }
      mediaLoaded=false;
      await loadMediaPage();
      showStudioNotice('Suppression terminée',items.length+' média'+(items.length>1?'s ont':' a')+' été supprimé'+(items.length>1?'s':'')+'.');
    } catch(error) {
      mediaLoaded=false; await loadMediaPage();
      showStudioNotice('Suppression incomplète',error?.message||'Erreur inconnue');
    }
    updateMediaSelection();
  });

  mediaLink?.addEventListener('click',(event)=>{event.preventDefault();showMediaPage();});
  mediaNative?.addEventListener('click',openNativeMedia);
  mediaSearch?.addEventListener('input',renderMedia);
  mediaSort?.addEventListener('change',renderMedia);
  document.getElementById('aup-media-reset')?.addEventListener('click', () => {
    if (mediaSearch) mediaSearch.value = '';
    if (mediaSort) mediaSort.value = 'name';
    mediaFilter = 'all';
    mediaButtons.forEach(button => {
      const selected = button.dataset.mediaFilter === 'all';
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    renderMedia();
    mediaSearch?.focus();
  });
  mediaButtons.forEach(btn=>btn.addEventListener('click',()=>{mediaFilter=btn.dataset.mediaFilter;mediaButtons.forEach(x=>x.classList.toggle('is-active',x===btn));renderMedia();}));

  const adminLink = document.querySelector('[data-nav="admin"]');
  adminLink?.addEventListener('click', (event) => {
    event.preventDefault();
    dashboardRequested = true;
    history.replaceState(null, '', '/admin/#/');
    syncNavigation();
  });

  libraryFilters.forEach((button)=>button.addEventListener('click',()=>{
    libraryFilter=button.dataset.filter;
    libraryFilters.forEach((item)=>{
      item.classList.toggle('is-active',item===button);
      item.setAttribute('aria-pressed',String(item===button));
    });
    const collection=library?.dataset.collection;
    const meta=libraryMetas[collection];
    if(collection&&libraryCache.has(collection))renderLibrary(libraryCache.get(collection),collection,meta);
  }));
  document.getElementById('aup-reflection-refresh')?.addEventListener('click',()=>loadLibrary(library.dataset.collection));
  document.querySelector('[data-reflection-feature]')?.addEventListener('click',()=>{
    libraryFilters.find(button => button.dataset.filter === 'published')?.click();
    librarySearch.focus();
  });
  function refreshLibraryFilters() {
    const collection=library?.dataset.collection;
    const meta=libraryMetas[collection];
    if(collection&&libraryCache.has(collection))renderLibrary(libraryCache.get(collection),collection,meta);
  }
  // Dismiss the quick-create menu on selection, outside click or Escape.
  const createMenu = document.getElementById('aup-create-menu');
  createMenu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { createMenu.open = false; }));
  document.addEventListener('pointerdown', event => {
    if (createMenu?.open && !createMenu.contains(event.target)) createMenu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && createMenu?.open) {
      createMenu.open = false;
      createMenu.querySelector('summary')?.focus();
    }
  });

  // Keyboard-first library search, without stealing focus from an editor.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
      closeMenu();
      menuButton.focus();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return;
    if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')) return;
    if (!library || library.hidden || !librarySearch) return;
    event.preventDefault();
    librarySearch.focus();
    librarySearch.select();
  });

  librarySearch.addEventListener('input', refreshLibraryFilters);
  libraryCategory.addEventListener('change', refreshLibraryFilters);
  librarySort?.addEventListener('change', refreshLibraryFilters);
  document.getElementById('aup-library-reset')?.addEventListener('click', () => {
    librarySearch.value = '';
    libraryCategory.value = '';
    if (librarySort) librarySort.value = 'newest';
    libraryFilter = 'all';
    libraryFilters.forEach(button => {
      const selected = button.dataset.filter === 'all';
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    refreshLibraryFilters();
    librarySearch.focus();
  });

  menuButton.addEventListener('click', () => sidebar.classList.contains('is-open') ? closeMenu() : openMenu());
  overlay.addEventListener('click', closeMenu);
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#studio-media') {
      showMediaPage({updateUrl:false});
      return;
    }
    dashboardRequested = !window.location.hash || window.location.hash === '#/' || window.location.hash === '#';
    syncNavigation();
  });
  window.addEventListener('popstate', () => {
    if (window.location.hash === '#studio-media') {
      showMediaPage({updateUrl:false});
    } else {
      syncNavigation();
    }
  });
  function updateEditorialQuality(collection) {
    if (!libraryMetas[collection]) {
      qualityPanel.hidden = true;
      return;
    }
    const fields = new Map([...cmsRoot.querySelectorAll('label[for]')].map(label => [
      label.textContent.trim().toLocaleLowerCase('fr').replace(/\s*\((optional|facultatif)\).*$/, ''),
      document.getElementById(label.htmlFor)
    ]));
    const primary = fields.get(collection === 'citations' ? 'texte' : 'titre');
    if (!primary || typeof primary.value !== 'string') {
      qualityPanel.hidden = true;
      return;
    }
    const titleLength = [...primary.value.trim()].length;
    const descriptionLabel = {
      ecrits:'description', reflexions:'description et aperçu social',
      musiques:'description courte', livres:'description'
    }[collection];
    const description = fields.get(descriptionLabel);
    const checks = [];
    if (!titleLength) checks.push(collection === 'citations' ? 'Renseigne le texte de la citation.' : 'Renseigne le titre.');
    if (collection !== 'citations' && titleLength > 65) checks.push('Titre long (' + titleLength + ' caractères). Vérifie sa lisibilité dans les résultats de recherche.');
    if (description) {
      const length = [...description.value.trim()].length;
      if (!length) checks.push('Une description spécifique aide à présenter le contenu dans les résultats et les partages.');
      if (length > 160) checks.push('Description longue (' + length + ' caractères). Place les informations essentielles au début.');
    }
    const imageLabel = {reflexions:'image de partage', ecrits:'image', livres:'couverture'}[collection];
    const image = fields.get(imageLabel);
    if (image && !String(image.value || '').trim()) checks.push('Une image améliore la présentation et le partage de cette œuvre.');
    const linksInText = [...cmsRoot.querySelectorAll('input[type="url"]')].filter(el => el.value.trim());
    linksInText.forEach(el => {
      try {
        const url = new URL(el.value.trim());
        if (!['https:', 'http:'].includes(url.protocol)) checks.push('Vérifie le protocole du lien externe.');
      } catch { checks.push('Un lien externe semble incomplet ou incorrect.'); }
    });
    const slug = fields.get('slug')?.value;
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) checks.push('Vérifie le slug : minuscules, chiffres et tirets.');
    if (qualityCount) qualityCount.textContent = checks.length ? '(' + checks.length + ')' : '✓';
    if (!checks.length) checks.push('Les champs contrôlés sont prêts pour la relecture.');
    const markup = checks.map(check => '<li>' + escapeHtml(check) + '</li>').join('');
    if (qualityList.innerHTML !== markup) qualityList.innerHTML = markup;
    qualityPanel.hidden = false;
  }

  const refreshEditorialQuality = () => {
    const collection = window.location.hash.match(/^#\/collections\/([^/]+)\/(?:new|entries\/)/)?.[1];
    updateEditorialQuality(collection);
  };
  cmsRoot.addEventListener('input', refreshEditorialQuality);
  cmsRoot.addEventListener('change', refreshEditorialQuality);

  function markDecapRegions() {
    const root = document.getElementById('nc-root');
    if (!root) return;

    // Detect Decap's native top navigation by its visible labels rather than
    // generated class names. Hide it only on desktop, where the Shell replaces it.
    const candidates = [...root.querySelectorAll('a,button,[role="button"]')];

    // Editor treatment for Citations, Écrits and Musiques. We identify Decap
    // controls semantically so the Studio remains independent of generated CSS.
    const editorMatch = window.location.hash.match(/^#\/collections\/(categories|reflexions|citations|ecrits|musiques|livres)\/(?:new|entries\/)/);
    const homeEditor = /^#\/edit\/pages\/home/.test(window.location.hash);
    const isStudioEditor = Boolean(editorMatch) || homeEditor;
    root.classList.toggle('aup-editor-mode', isStudioEditor);
    root.classList.toggle('aup-home-editor', homeEditor);
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

      // Keep editor layout ownership with Decap. Earlier geometry-based pane
      // detection could mark the wrong containers after Decap DOM changes,
      // producing a blank half-screen and a cramped form. Live preview content
      // remains styled by studio-previews.js without forcing Decap's columns.
      root.querySelectorAll('[data-aup-form-pane],[data-aup-preview-pane]').forEach((el) => {
        delete el.dataset.aupFormPane;
        delete el.dataset.aupPreviewPane;
      });
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
        if (t.startsWith('mise en avant') || t.startsWith('livre présenté sur l’accueil') || t.startsWith('masquer du site')) {
          let box = label;
          while (box.parentElement && box.parentElement !== root) {
            if (box.querySelector('input[type="checkbox"]')) break;
            box = box.parentElement;
          }
          box.dataset.aupPublicationCard = (t.startsWith('mise en avant') || t.startsWith('livre présenté sur l’accueil')) ? 'featured' : 'draft';
        }
      });

      // A shared editorial hierarchy for all five content collections.
      // Decap still owns every input, its value and its save/publish actions.
      const editorialSections = {
        citations: [['texte','TEXTE & IDENTITÉ'], ['source','SOURCE & MÉDIAS'], ['mise en avant','VISIBILITÉ'], ['masquer du site','VISIBILITÉ']],
        ecrits: [['titre','IDENTITÉ DE L’ÉCRIT'], ['texte','TEXTE & CONTENU'], ['corps','TEXTE & CONTENU'], ['image','ILLUSTRATION'], ['mise en avant','VISIBILITÉ'], ['masquer du site','VISIBILITÉ']],
        reflexions: [['titre','IDENTITÉ DE LA RÉFLEXION'], ['article','ARTICLE'], ['image de partage','ILLUSTRATION & PARTAGE'], ['mise en avant','VISIBILITÉ'], ['masquer du site','VISIBILITÉ']],
        musiques: [['titre','IDENTITÉ DU MORCEAU'], ['fichier audio','DIFFUSION & PLATEFORMES'], ['paroles','PAROLES & CRÉDITS'], ['ordre d’affichage','PUBLICATION']],
        livres: [['titre','IDENTITÉ DU LIVRE'], ['couverture','ÉDITION & COUVERTURE'], ['prix','COMMERCIALISATION'], ['accroche','PRÉSENTATION'], ['livre présenté sur l’accueil','PUBLICATION'], ['mise en avant','PUBLICATION']]
      };
      const sectionStarts = editorialSections[collection] || [];
      [...root.querySelectorAll('label')].forEach(label => {
        const key = label.textContent.trim().toLocaleLowerCase('fr').replace(/\s*\((optional|facultatif)\).*$/, '');
        const match = sectionStarts.find(([name]) => key === name);
        if (!match) return;
        let field = label;
        while (field.parentElement && field.parentElement !== root) {
          const parent = field.parentElement;
          if (parent.children.length > 1 || parent.querySelector('input,textarea,select,button')) { field = parent; break; }
          field = parent;
        }
        field.dataset.aupSectionStart = match[1];
      });

    }

    updateEditorialQuality(editorMatch?.[1]);
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

    const headings = [...root.querySelectorAll('h1,h2,h3,h4')];
    const collectionsHeading = headings.find((el) => el.textContent.trim() === 'Collections');
    root.classList.toggle('aup-decap-collections-ready', Boolean(collectionsHeading || nativeAccount));

    if (window.innerWidth < 900) return;
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

  // Decap can emit dozens of DOM mutations in a single render. Coalesce
  // them into one inspection per animation frame to keep the editor responsive.
  let decapInspectionQueued = false;
  const decapObserver = new MutationObserver(() => {
    if (decapInspectionQueued) return;
    decapInspectionQueued = true;
    window.requestAnimationFrame(() => {
      decapInspectionQueued = false;
      markDecapRegions();
    });
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
