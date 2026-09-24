(() => {
  if (!window.CMS || !window.React) return;
  const h = window.React.createElement;
  const value = (entry, key, fallback = '') => {
    const v = entry.getIn(['data', key]);
    return v === undefined || v === null ? fallback : String(v);
  };
  const lines = (text) => String(text || '').split(/\n+/).filter(Boolean);
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
  const EcritPreview = ({entry}) => {
    const title=value(entry,'title','Titre de l’écrit'), description=value(entry,'description'), body=value(entry,'body'), year=value(entry,'year');
    return frame('ecrit', [
      h('div',{className:'aup-preview-meta',key:'meta'},`ÉCRIT${year?' / '+year:''}`),
      h('h1',{key:'title'},title),
      description?h('p',{className:'aup-preview-lead',key:'lead'},description):null,
      h('div',{className:'aup-preview-poem',key:'poem'},lines(body).slice(0,18).map((line,i)=>h('p',{key:i},line))),
      body?null:h('p',{className:'aup-preview-placeholder',key:'empty'},'Le texte apparaîtra ici au fil de l’écriture.')
    ]);
  };
  const MusicPreview = ({entry}) => {
    const title=value(entry,'title','Titre du morceau'), kind=value(entry,'kind','composition'), cover=value(entry,'cover'), short=value(entry,'descriptionCourte'), lyrics=value(entry,'lyrics'), lyricsBy=value(entry,'lyricsBy'), musicBy=value(entry,'musicBy');
    return frame('musique', [
      h('div',{className:'aup-preview-music-hero',key:'hero'},[
        cover?h('img',{src:cover,alt:'',key:'cover'}):h('div',{className:'aup-preview-cover',key:'cover'},'A'),
        h('div',{key:'copy'},[
          h('span',{className:'aup-preview-meta',key:'meta'},kind==='reprise'?'REPRISE':'COMPOSITION ORIGINALE'),
          h('h1',{key:'title'},title),
          short?h('p',{className:'aup-preview-lead',key:'short'},short):null
        ])
      ]),
      lyrics?h('section',{className:'aup-preview-lyrics',key:'lyrics'},[
        h('span',{key:'label'},'PAROLES'),
        ...lines(lyrics).slice(0,12).map((line,i)=>h('p',{key:i},line))
      ]):null,
      (lyricsBy||musicBy)?h('footer',{className:'aup-preview-credits',key:'credits'},[
        lyricsBy?h('span',{key:'l'},`PAROLES · ${lyricsBy}`):null,
        musicBy?h('span',{key:'m'},`MUSIQUE · ${musicBy}`):null
      ]):null
    ]);
  };
  const BookPreview = ({entry}) => {
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
        cover?h('img',{src:cover,alt:'',className:'aup-preview-book-cover',key:'cover'}):h('div',{className:'aup-preview-book-cover is-empty',key:'cover'},'A'),
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
        ...lines(body).slice(0,10).map((line,i)=>h('p',{key:i},line))
      ]):null
    ]);
  };
  window.CMS.registerPreviewTemplate('citations', CitationPreview);
  window.CMS.registerPreviewTemplate('ecrits', EcritPreview);
  window.CMS.registerPreviewTemplate('musiques', MusicPreview);
  window.CMS.registerPreviewTemplate('livres', BookPreview);
})();