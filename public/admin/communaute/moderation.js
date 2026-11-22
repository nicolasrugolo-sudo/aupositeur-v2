(() => {
  const labels = { all: 'Tous', pending: 'En attente', approved: 'Approuvés', rejected: 'Indésirables' };
  const collections = { ecrits:'Écrits', citations:'Citations', reflexions:'Réflexions', musiques:'Musiques' };
  const make = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (title, handler) => {
    const node = make('button', title);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  };
  const option = (title, value) => new Option(title, value);
  const date = new Intl.DateTimeFormat('fr-BE', {dateStyle:'medium', timeStyle:'short'});
  function workUrl(comment) {
    const base = comment.content_type === 'musiques' ? 'musique' : comment.content_type;
    const parts = comment.content_id.split('/').filter(Boolean);
    if (!parts.length || parts.some(part => part === '.' || part === '..')) return '/' + base + '/';
    return '/' + base + '/' + parts.map(encodeURIComponent).join('/') + '/';
  }

  window.aupositeurModeration = (section, request) => {
    section.classList.add('comment-management');
    const header = make('header');
    header.append(make('h2','Commentaires'),make('p','Modération des contributions des lecteurs'));
    const tabs = make('div');
    tabs.className = 'comment-status-groups';
    const filters = make('form');
    filters.className = 'comment-filters';
    const selection = make('div');
    selection.className = 'comment-selection';
    const list = make('div');
    const pagination = make('nav');
    pagination.setAttribute('aria-label','Pages de commentaires');
    const notice = make('p');
    notice.setAttribute('role','status');
    const searched = new URLSearchParams();
    const chosen = new Set();
    let status = 'pending';
    let offset = 0;
    let sequence = 0;
    let timer;
    let loading = true;
    let busy = false;
    let workCatalog = {};
    let visible = [];
    let limit = 25;

    const counts = new Map(Object.entries(labels).map(([key,label]) => {
      const control = button(label, () => {
        status=key;
        offset=0;
        refresh();
      });
      tabs.append(control);
      return [key,control];
    }));

    function field(label, name, type) {
      const wrap=make('label',label);
      const control=make(type==='select'?'select':'input');
      if(type!=='select') control.type=type;
      control.name=name;
      wrap.append(control);
      filters.append(wrap);
      return control;
    }
    const query=field('Rechercher','q','search');
    query.maxLength=120;
    const collection=field('Collection','type','select');
    collection.append(option('Toutes les collections',''));
    for(const [key,label] of Object.entries(collections)) collection.append(option(label,key));
    const work=field('Œuvre','work','select');
    work.append(option('Toutes les œuvres',''));
    field('Depuis','from','date');
    field('Jusqu’au','to','date');
    const order=field('Tri','order','select');
    order.append(option('Les plus récents','newest'),option('Les plus anciens','oldest'));
    filters.addEventListener('submit', event => {event.preventDefault();applyFilters();});
    filters.addEventListener('change',event => {
      if(event.target===collection) updateWorks();
      applyFilters();
    });
    query.addEventListener('input',() => {
      clearTimeout(timer);
      timer=setTimeout(applyFilters,250);
    });
    function updateWorks(){
      const previous=work.value;
      const entries=Object.entries(workCatalog).filter(([key])=>!collection.value||key===collection.value);
      work.replaceChildren(option('Toutes les œuvres',''));
      const seen = new Set();
      for(const [key,items] of entries){
        for(const item of items){
          if(seen.has(item.slug))continue;
          seen.add(item.slug);
          work.append(option((collection.value?'':collections[key]+' · ')+item.title,item.slug));
        }
      }
      if(seen.has(previous)) work.value=previous;
    }
    function applyFilters(){
      clearTimeout(timer);
      if(!filters.reportValidity())return;
      for(const [key,value] of new FormData(filters)) {
        if(value) searched.set(key,value);
        else searched.delete(key);
      }
      offset=0;
      refresh();
    }
    const selectAll=make('input');
    selectAll.type='checkbox';
    const selectLabel=make('label');
    selectLabel.append(selectAll,' Sélectionner cette page');
    selectAll.addEventListener('change',()=>{
      for(const comment of visible) {
        if(selectAll.checked) chosen.add(comment.id);
        else chosen.delete(comment.id);
      }
      for(const checkbox of list.querySelectorAll('input[type="checkbox"]')) checkbox.checked=chosen.has(checkbox.value);
      updateSelection();
    });
    const bulk=make('select');
    bulk.setAttribute('aria-label','Action groupée');
    bulk.append(option('Actions groupées',''),option('Approuver','approved'),option('Remettre en attente','pending'),option('Mettre en indésirable','rejected'),option('Supprimer','delete'));
    const apply=button('Appliquer',()=>moderate(bulk.value,[...chosen]));
    bulk.addEventListener('change',updateSelection);
    selection.append(selectLabel,bulk,apply);
    section.append(header,tabs,filters,selection,notice,list,pagination);

    function updateSelection(){
      apply.disabled=busy||loading||!chosen.size||!bulk.value;
      selectAll.disabled=busy||loading||!visible.length;
      selectAll.checked=visible.length>0&&chosen.size===visible.length;
      selectAll.indeterminate=chosen.size>0&&!selectAll.checked;
    }
    async function moderate(action,ids){
      if(busy||!ids.length)return;
      if(action==='delete'&&!window.confirm('Supprimer définitivement '+ids.length+' commentaire(s) ?'))return;
      await mutate('/api/admin/comments/bulk',{ids,action},'Modération enregistrée.');
    }
    async function mutate(path,data,message){
      if(busy)return;
      busy=true;
      updateSelection();
      try{
        await request(path,{method:'POST',body:JSON.stringify(data)});
        if (typeof BroadcastChannel === 'function') {
          const channel=new BroadcastChannel('aupositeur-moderation');
          channel.postMessage('changed');
          channel.close();
        }
        await refresh(message);
      }catch(error){notice.textContent=error.message;}
      finally{busy=false;updateSelection();}
    }
    function draw(comment){
      const row = make('article');
      row.className='comment-row';
      const check=make('input');
      check.type='checkbox';
      check.value=comment.id;
      check.setAttribute('aria-label','Sélectionner le commentaire de '+comment.author_name);
      check.addEventListener('change',()=>{
        if(check.checked)chosen.add(comment.id);
        else chosen.delete(comment.id);
        updateSelection();
      });
      const identity=make('div');
      const stamp=new Date(comment.created_at.replace(' ','T')+'Z');
      const work=make('a',(collections[comment.content_type]||comment.content_type)+' · '+comment.content_id);
      work.href=workUrl(comment);
      work.target='_blank';
      work.rel='noopener';
      identity.append(make('strong',comment.author_name),make('small',Number.isFinite(+stamp)?date.format(stamp):comment.created_at),work);
      const content=make('div');
      const badge=make('span',comment.is_author_reply?'Réponse d’AUPOSITEUR':labels[comment.status]);
      badge.className='comment-badge';
      const text=make('p',comment.body);
      text.className='comment-text';
      content.append(badge,text);
      const actions=make('div');
      actions.className='actions';
      if(comment.status!=='approved')actions.append(button('Approuver',()=>moderate('approved',[comment.id])));
      if(comment.status!=='rejected')actions.append(button(comment.status==='pending'?'Refuser':'Indésirable',()=>moderate('rejected',[comment.id])));
      if(comment.status==='rejected')actions.append(button('Remettre en attente',()=>moderate('pending',[comment.id])));
      if(comment.status==='approved'){
        actions.append(button('Répondre',()=>{
          const existing=content.querySelector('form');
          if(existing){existing.querySelector('textarea').focus();return;}
          const form=make('form');
          const label=make('label','Réponse en tant qu’AUPOSITEUR');
          const input=make('textarea');
          input.required=true;input.minLength=2;input.maxLength=3000;input.rows=4;
          label.append(input);
          const send=make('button','Publier la réponse');
          send.type='submit';
          form.append(label,send,button('Annuler',()=>form.remove()));
          form.addEventListener('submit',async event=>{
            event.preventDefault();
            send.disabled=true;
            try{await mutate('/api/admin/comments/reply',{parent_id:comment.id,body:input.value},'Réponse publiée.');}
            finally{send.disabled=false;}
          });
          content.append(form);
          input.focus();
        }));
      }
      actions.append(button('Supprimer',()=>moderate('delete',[comment.id])));
      content.append(actions);
      row.append(check,identity,content);
      return row;
    }
    async function refresh(message=''){
      const current=++sequence;
      loading=true;
      visible=[];
      chosen.clear();
      updateSelection();
      notice.textContent='Chargement des commentaires…';
      list.replaceChildren();
      pagination.replaceChildren();
      for(const [key,control] of counts){
        control.textContent=labels[key]+' —';
        control.setAttribute('aria-pressed',String(key===status));
      }
      try {
        const args=new URLSearchParams(searched);
        args.set('status',status);
        args.set('offset',offset);
        const result=await request('/api/admin/comments/moderation?'+args);
        if(current!==sequence||!section.isConnected)return;
        limit=result.limit;
        if(offset>0&&offset>=result.total){offset=Math.max(0,Math.floor((result.total-1)/limit)*limit);return refresh(message);}
        visible=result.comments;
        for(const [key,control] of counts)control.textContent=labels[key]+' '+result.counts[key];
        notice.textContent=message||(!visible.length?'Aucun commentaire pour ces filtres.':'');
        list.replaceChildren(...visible.map(draw));
        const previous=button('Précédente',()=>{offset-=limit;refresh();});
        const next=button('Suivante',()=>{offset+=limit;refresh();});
        previous.disabled=!offset;
        next.disabled=offset+limit>=result.total;
        if(result.total>limit) pagination.append(previous,make('span',(offset+1)+'–'+Math.min(offset+limit,result.total)+' sur '+result.total),next);
      }catch(error){
        if(current===sequence) notice.textContent=error.message;
      }finally{
        if(current===sequence){loading=false;updateSelection();}
      }
    }
    fetch('/studio-content.json').then(response=>response.ok?response.json():null)
      .then(data=>{if(data?.collections){workCatalog=Object.fromEntries(Object.entries(data.collections).filter(([key])=>key in collections));updateWorks();}})
      .catch(()=>{notice.textContent='Le filtre par œuvre est indisponible.';});
    refresh();
  };
})();

