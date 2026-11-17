(() => {
  const h = window.React?.createElement || window.h;
  if (!window.CMS || !h) return;
  const value = (entry, key, fallback = '') => {
    const v = entry.getIn(['data', key]);
    return v === undefined || v === null ? fallback : String(v);
  };
  const assetUrl = (getAsset, path) => String(getAsset(path));
  const frame = (kind, children) => h('article', {className:`aup-preview aup-preview--${kind}`}, [
    h('header', {className:'aup-preview-brand', key:'brand'}, [
      h('strong', {key:'name'}, 'AUPOSITEUR.'),
      h('span', {key:'kind'}, kind === 'citation' ? 'CITATION' : kind === 'ecrit' ? 'ÉCRIT' : kind === 'livre' ? 'LIVRE' : 'MUSIQUE')
    ]),
    h('div', {className:'aup-preview-body', key:'body'}, children)
  ]);
  const CitationPreview = ({entry}) => {
    const text = value(entry, 'text'), author = value(entry, 'author', 'AUPOSITEUR');
    return frame('citation', [
      h('span', {className:'aup-preview-number', key:'n'}, '01 / MOTS'),
      h('blockquote', {key:'q'}, text || 'Ta citation apparaîtra ici.'),
      h('p', {className:'aup-preview-signature', key:'a'}, `— ${author || 'AUPOSITEUR'}`)
    ]);
  };
  const EcritPreview = ({entry, widgetFor}) => {
    const title=value(entry,'title','Titre de l’écrit'), description=value(entry,'description'), body=value(entry,'body'), year=value(entry,'year');
    return frame('ecrit', [
      h('div',{className:'aup-preview-meta',key:'meta'},`ÉCRIT${year?' / '+year:''}`),
      h('h1',{key:'title'},title),
      description?h('p',{className:'aup-preview-lead',key:'lead'},description):null,
      h('div',{className:'aup-preview-poem',key:'poem'},widgetFor('body')),
      body?null:h('p',{className:'aup-preview-placeholder',key:'empty'},'Le texte apparaîtra ici au fil de l’écriture.')
    ]);
  };
  const MusicPreview = ({entry, getAsset}) => {
    const title=value(entry,'title','Titre du morceau'), kind=value(entry,'kind','composition'), cover=value(entry,'cover'), short=value(entry,'descriptionCourte'), lyrics=value(entry,'lyrics'), lyricsBy=value(entry,'lyricsBy'), musicBy=value(entry,'musicBy');
    return frame('musique', [
      h('div',{className:'aup-preview-music-hero',key:'hero'},[
        cover?h('img',{src:assetUrl(getAsset, cover),alt:'',key:'cover'}):h('div',{className:'aup-preview-cover',key:'cover'},'A'),
        h('div',{key:'copy'},[
          h('span',{className:'aup-preview-meta',key:'meta'},kind==='reprise'?'REPRISE':'COMPOSITION ORIGINALE'),
          h('h1',{key:'title'},title),
          short?h('p',{className:'aup-preview-lead',key:'short'},short):null
        ])
      ]),
      lyrics?h('section',{className:'aup-preview-lyrics',key:'lyrics'},[
        h('span',{key:'label'},'PAROLES'),
        h('p', {key:'text', style:{whiteSpace:'pre-wrap'}}, lyrics)
      ]):null,
      (lyricsBy||musicBy)?h('footer',{className:'aup-preview-credits',key:'credits'},[
        lyricsBy?h('span',{key:'l'},`PAROLES · ${lyricsBy}`):null,
        musicBy?h('span',{key:'m'},`MUSIQUE · ${musicBy}`):null
      ]):null
    ]);
  };
  const BookPreview = ({entry, getAsset, widgetFor}) => {
    const title=value(entry,'title','Titre du livre'), subtitle=value(entry,'subtitle'), cover=value(entry,'cover'), author=value(entry,'author','AUPOSITEUR'), publisher=value(entry,'publisher'), lead=value(entry,'lead'), description=value(entry,'description'), price=value(entry,'price'), currency=value(entry,'currency','EUR'), body=value(entry,'body');
    let displayPrice=price;
    if(price){
      const amount=Number(String(price).replace(',','.'));
      if(!Number.isNaN(amount)){
        try { displayPrice=new Intl.NumberFormat('fr-BE',{style:'currency',currency:currency||'EUR'}).format(amount); } catch {}
      }
    }
    return frame('livre', [
      h('div',{className:'aup-preview-book-hero',key:'hero'},[
        cover?h('img',{src:assetUrl(getAsset, cover),alt:'',className:'aup-preview-book-cover',key:'cover'}):h('div',{className:'aup-preview-book-cover is-empty',key:'cover'},'A'),
        h('div',{className:'aup-preview-book-copy',key:'copy'},[
          h('span',{className:'aup-preview-meta',key:'meta'},[author,publisher].filter(Boolean).join(' · ')),
          h('h1',{key:'title'},title),
          subtitle?h('p',{className:'aup-preview-book-subtitle',key:'subtitle'},subtitle):null,
          lead?h('p',{className:'aup-preview-lead',key:'lead'},lead):null,
          displayPrice?h('strong',{className:'aup-preview-book-price',key:'price'},displayPrice):null
        ])
      ]),
      description?h('p',{className:'aup-preview-book-description',key:'description'},description):null,
      body?h('section',{className:'aup-preview-book-excerpt',key:'body'},[
        h('span',{key:'label'},'EXTRAIT'),
        widgetFor('body')
      ]):null
    ]);
  };
  const ReflectionPreview = ({entry, widgetFor, getAsset}) => {
    const title = value(entry, 'title') || 'Titre de la réflexion';
    const description = value(entry, 'description');
    const author = value(entry, 'author', 'Aupositeur');
    const date = new Date(value(entry, 'createdAt'));
    const cover = value(entry, 'socialPhoto');
    const categories = entry.getIn(['data', 'categories'])?.toArray() || [];
    return h('main', {className:'ap-edition aup-reflection-preview'},
      h('link', {rel:'stylesheet', href:'/admin-reading.css'}),
      h('article', {className:'ap-reading'},
        h('header', {className:'ap-reading__header'},
          h('p', {className:'ap-reading__meta'},
            [author, Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-BE', {
              year:'numeric', month:'long', day:'numeric',
            })].filter(Boolean).join(' · ')),
          h('h1', null, title),
          description && h('p', {className:'ap-reading__lead'}, description),
          categories.length > 0 && h('ul', {className:'ap-reading__topics', 'aria-label':'Catégories'},
            categories.map(id => h('li', {key:id}, id))),
        ),
        cover && h('img', {className:'ap-reading__cover', src:String(getAsset(cover)), alt:''}),
        h('div', {className:'ap-reading__text ap-reflexions__body'}, widgetFor('body')),
      ));
  };
  window.CMS.registerPreviewStyle('/admin/admin.css');
  window.CMS.registerPreviewTemplate('reflexions', ReflectionPreview);
  window.CMS.registerPreviewTemplate('citations', CitationPreview);
  window.CMS.registerPreviewTemplate('ecrits', EcritPreview);
  window.CMS.registerPreviewTemplate('musiques', MusicPreview);
  window.CMS.registerPreviewTemplate('livres', BookPreview);
})();