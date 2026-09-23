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
      h('span', {key:'kind'}, kind === 'citation' ? 'CITATION' : kind === 'ecrit' ? 'ÉCRIT' : 'MUSIQUE')
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
  window.CMS.registerPreviewTemplate('citations', CitationPreview);
  window.CMS.registerPreviewTemplate('ecrits', EcritPreview);
  window.CMS.registerPreviewTemplate('musiques', MusicPreview);
})();