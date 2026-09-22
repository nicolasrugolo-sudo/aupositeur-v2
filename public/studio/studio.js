const API="https://aupositeur-studio-api.nicolas-rugolo.workers.dev";
const KEY="aupositeur.studio.v1";
const ACTIVE_KEY="aupositeur.studio.active";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtBytes=n=>{n=Number(n||0);if(n<1024)return n+" B";if(n<1048576)return(n/1024).toFixed(1)+" KB";return(n/1048576).toFixed(2)+" MB"};
let state={projects:[],trash:[],active:localStorage.getItem(ACTIVE_KEY)||"",assets:[],activity:[]};
async function api(path,options={}){
  const r=await fetch(API+path,{...options,credentials:"include",headers:{...(options.body instanceof FormData?{}:{"content-type":"application/json"}),...(options.headers||{})}});
  if(r.status===401||r.status===403){throw new Error("AUTH_REQUIRED")}
  const type=r.headers.get("content-type")||""; const data=type.includes("application/json")?await r.json():await r.text();
  if(!r.ok){const detail=data?.detail?String(data.detail):"";const upstream=data?.upstream_status?("HTTP Agnes "+data.upstream_status):("HTTP "+r.status);throw new Error([data?.error||upstream,detail&&"— "+detail].filter(Boolean).join(" "))} return data;
}
function setText(sel,value){document.querySelectorAll(sel).forEach(x=>x.textContent=value)}
function activeProject(){return state.projects.find(p=>p.id===state.active)||null}
function renderActiveProject(){
  const p=activeProject();
  setText("[data-active-project]",p?.title||"AUCUN PROJET");
  document.querySelectorAll("[data-active-project-wrap]").forEach(x=>x.hidden=!p);
}
function renderVideoProjectGuard(){
  const form=document.querySelector("[data-video-form]");if(!form)return;
  const warning=document.querySelector("[data-video-project-warning]");
  const has=Boolean(activeProject());
  if(warning)warning.hidden=has;
  form.querySelectorAll("textarea,select,input,button").forEach(el=>{if(el.matches("[data-video-generate]"))el.dataset.projectDisabled=has?"0":"1"});
  const btn=form.querySelector("[data-video-generate]");if(btn&&!has)btn.disabled=true;
}
function apiConnected(){
  const note=document.querySelector("[data-api-message]");
  if(note)note.innerHTML="<strong>Cloud :</strong> API privée connectée · base projets + médiathèque opérationnelles.";
}
function authRequired(){
  setText("[data-api-state]","AUTH REQUISE");
  const note=document.querySelector("[data-api-message]");
  const returnTo=location.href;
  const accessUrl=API+"/health?studio_return="+encodeURIComponent(returnTo);
  if(note)note.innerHTML='Session API absente. <a href="'+accessUrl+'" data-access-login>SE CONNECTER AU STUDIO ↗</a>. Après authentification Cloudflare Access, revenez sur cette page et rechargez-la.';
}
async function health(){
  try{const h=await api("/health",{method:"GET"});setText("[data-api-state]",h.authenticated?"● CONNECTÉ":"AUTH REQUISE");setText("[data-d1-state]",h.d1?"● CONNECTÉ":"ERREUR");setText("[data-r2-state]",h.r2?"● CONNECTÉ":"ERREUR");return h.authenticated}catch(e){if(e.message==="AUTH_REQUIRED")authRequired();return false}
}
async function loadProjects(){
  const d=await api("/api/projects",{method:"GET"});state.projects=d.projects||[];
  if(!state.active||!state.projects.some(p=>p.id===state.active)){state.active=state.projects[0]?.id||"";if(state.active)localStorage.setItem(ACTIVE_KEY,state.active)}
  renderProjects();renderActiveProject();renderVideoProjectGuard();setText('[data-count="projects"]',String(state.projects.length).padStart(2,"0"));
}
function renderProjects(){
  const list=document.querySelector("[data-project-list]");if(!list)return;
  list.innerHTML=state.projects.length?state.projects.map((p,i)=>`<div class="project-row ${p.id===state.active?"selected":""}"><button class="project-select" type="button" data-project="${esc(p.id)}"><span>${String(i+1).padStart(2,"0")}</span><b>${esc(p.title)}</b><small>${esc(p.type)} · ${esc(p.status)}</small></button><button class="project-delete" type="button" data-delete-project="${esc(p.id)}" data-delete-project-name="${esc(p.title)}" title="Supprimer le projet">SUPPRIMER</button></div>`).join(""):'<div class="empty-state">Aucun projet dans la base du Studio.</div>';
  list.querySelectorAll("[data-project]").forEach(b=>b.onclick=()=>{state.active=b.dataset.project;localStorage.setItem(ACTIVE_KEY,state.active);renderProjects();renderActiveProject();location.reload()});
  list.querySelectorAll("[data-delete-project]").forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.deleteProject,name=btn.dataset.deleteProjectName||"ce projet";
    if(!confirm("Placer « "+name+" » dans la corbeille ?\n\nLe projet pourra être restauré. Ses textes et fichiers de la médiathèque sont conservés."))return;
    btn.disabled=true;btn.textContent="SUPPRESSION…";
    try{
      await api("/api/projects/"+encodeURIComponent(id),{method:"DELETE"});
      if(state.active===id){state.active="";localStorage.removeItem(ACTIVE_KEY)}
      await loadProjects();await loadTrash();await loadAssets();await loadActivity();
    }catch(e){btn.disabled=false;btn.textContent="SUPPRIMER";alert("Suppression impossible : "+e.message)}
  });
}
async function loadTrash(){
  const list=document.querySelector("[data-trash-list]");if(!list)return;
  const d=await api("/api/projects/trash",{method:"GET"});state.trash=d.projects||[];
  setText("[data-count=\"trash\"]",String(state.trash.length).padStart(2,"0"));
  list.innerHTML=state.trash.length?state.trash.map(p=>`<div class="trash-row"><div><b>${esc(p.title)}</b><small>SUPPRIMÉ LE ${new Date(p.deleted_at).toLocaleString("fr-BE")}</small></div><button type="button" data-restore-project="${esc(p.id)}">RESTAURER</button><button class="danger" type="button" data-purge-project="${esc(p.id)}" data-purge-name="${esc(p.title)}">SUPPRIMER DÉFINITIVEMENT</button></div>`).join(""):'<div class="empty-state">La corbeille est vide.</div>';
  list.querySelectorAll("[data-restore-project]").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{await api("/api/projects/"+encodeURIComponent(btn.dataset.restoreProject)+"/restore",{method:"POST"});await loadProjects();await loadTrash();await loadActivity()}catch(e){btn.disabled=false;alert("Restauration impossible : "+e.message)}});
  list.querySelectorAll("[data-purge-project]").forEach(btn=>btn.onclick=async()=>{
    const name=btn.dataset.purgeName;
    const typed=prompt("SUPPRESSION DÉFINITIVE.\nLes textes et fichiers de la médiathèque seront effacés.\n\nÉcris exactement le nom du projet :\n"+name);
    if(typed!==name){if(typed!==null)alert("Nom incorrect : suppression annulée.");return}
    btn.disabled=true;try{await api("/api/projects/"+encodeURIComponent(btn.dataset.purgeProject)+"/purge",{method:"DELETE"});await loadTrash();await loadActivity()}catch(e){btn.disabled=false;alert("Suppression impossible : "+e.message)}
  });
}
async function createProject(){
  const title=prompt("Nom du projet");if(!title?.trim())return;
  await api("/api/projects",{method:"POST",body:JSON.stringify({title:title.trim(),type:"Projet"})});await loadProjects();
}
async function loadDocument(){
  const editor=document.querySelector("[data-editor]");if(!editor)return;if(!state.active){editor.disabled=true;editor.placeholder="Crée d’abord un projet.";return}
  const d=await api("/api/projects/"+encodeURIComponent(state.active)+"/document",{method:"GET"});editor.value=d.document?.content||"";editor.disabled=false;setText("[data-save-state]","CHARGÉ");
  let timer;const persist=async()=>{setText("[data-save-state]","SAUVEGARDE…");try{await api("/api/projects/"+encodeURIComponent(state.active)+"/document",{method:"PUT",body:JSON.stringify({content:editor.value})});setText("[data-save-state]","SAUVÉ")}catch(e){setText("[data-save-state]","ERREUR")}};
  editor.oninput=()=>{setText("[data-save-state]","MODIFIÉ");clearTimeout(timer);timer=setTimeout(persist,900)};document.querySelector("[data-save-doc]")?.addEventListener("click",persist);
}
function assetUrl(a){return API+"/api/assets/"+encodeURIComponent(a.id)+"/content"}
function renderAssets(){
  const list=document.querySelector("[data-asset-list]");if(!list)return;
  list.innerHTML=state.assets.length?state.assets.map(a=>{
    const mime=String(a.mime||"");
    const isImage=mime.startsWith("image/")||String(a.kind||"").toUpperCase()==="IMAGE";
    const preview=isImage?`<a class="asset-thumb" href="${assetUrl(a)}" target="_blank" rel="noopener"><img src="${assetUrl(a)}" alt="" loading="lazy"></a>`:`<div class="asset-thumb asset-file">${esc(a.kind||"FILE")}</div>`;
    return `<article class="asset-card">${preview}<div class="asset-info"><span>${esc(a.kind)}</span><b><a href="${assetUrl(a)}" target="_blank" rel="noopener">${esc(a.name)}</a></b><small>${esc(fmtBytes(a.bytes))}</small></div><button class="asset-delete" type="button" data-delete-asset="${esc(a.id)}" data-delete-name="${esc(a.name)}">SUPPRIMER</button></article>`;
  }).join(""):'<div class="empty-state">Aucun fichier dans la médiathèque pour ce projet.</div>';
  setText('[data-count="assets"]',String(state.assets.length).padStart(2,"0"));
  list.querySelectorAll("[data-delete-asset]").forEach(btn=>btn.addEventListener("click",async()=>{
    const name=btn.dataset.deleteName||"ce fichier";
    if(!confirm("Supprimer définitivement « "+name+" » de la médiathèque et du Studio ?"))return;
    btn.disabled=true;btn.textContent="SUPPRESSION…";
    try{await api("/api/assets/"+encodeURIComponent(btn.dataset.deleteAsset),{method:"DELETE"});await loadAssets();await loadActivity();}
    catch(e){btn.disabled=false;btn.textContent="SUPPRIMER";alert("Suppression impossible : "+e.message)}
  }));
}
async function loadAssets(){
  const q=state.active?"?project="+encodeURIComponent(state.active):"";const d=await api("/api/assets"+q,{method:"GET"});state.assets=d.assets||[];renderAssets();
}
async function uploadFiles(files){
  if(!state.active){alert("Crée ou sélectionne d’abord un projet.");return}
  for(const file of files){const form=new FormData();form.append("file",file);form.append("project_id",state.active);setText("[data-upload-state]","ENVOI "+file.name+"…");await api("/api/assets",{method:"POST",body:form});}
  setText("[data-upload-state]","MÉDIATHÈQUE CONNECTÉE");await loadAssets();
}
async function loadActivity(){
  const box=document.querySelector("[data-activity-list]");if(!box)return;const d=await api("/api/activity",{method:"GET"});state.activity=d.activity||[];
  box.innerHTML=state.activity.length?state.activity.slice(0,8).map(a=>`<div class="log"><span>${new Date(a.created_at).toLocaleTimeString("fr-BE")}</span><span class="event">${esc(a.message)}</span><span class="kind">${esc(a.kind)}</span><span class="provider">D1</span></div>`).join(""):'<div class="empty-state">Aucune activité.</div>';
}
async function loadWorkContext(){
  if(!document.querySelector("[data-work-text-state]"))return;
  if(!state.active){setText("[data-work-text-state]","AUCUN PROJET");setText("[data-work-image-state]","—");setText("[data-work-audio-state]","—");return}
  const [doc,assets]=await Promise.all([api("/api/projects/"+encodeURIComponent(state.active)+"/document",{method:"GET"}),api("/api/assets?project="+encodeURIComponent(state.active),{method:"GET"})]);
  const text=String(doc.document?.content||"").trim(),rows=assets.assets||[],images=rows.filter(a=>String(a.mime||"").startsWith("image/")),audio=rows.filter(a=>String(a.mime||"").startsWith("audio/"));
  const wordCount=text?text.split(/\s+/).filter(Boolean).length:0;setText("[data-work-text-state]",wordCount?wordCount+" MOT"+(wordCount>1?"S":""):"ABSENT");setText("[data-work-text-meta]",wordCount?"TXT DISPONIBLE":"AJOUTER DANS TXT");
  setText("[data-work-image-state]",images.length?String(images.length).padStart(2,"0")+" IMAGE"+(images.length>1?"S":""):"ABSENT");setText("[data-work-image-meta]",images.length?"MÉDIATHÈQUE / RÉFÉRENCES":"IMPORTER DANS IMG");
  setText("[data-work-audio-state]",audio.length?String(audio.length).padStart(2,"0")+" AUDIO":"ABSENT");setText("[data-work-audio-meta]",audio.length?audio.map(a=>a.name).slice(0,2).join(" · "):"IMPORTER LE MASTER");
  window.__studioWork={title:activeProject()?.title||"",text,assets:rows,images,audio};
}
async function loadVisualReferences(){
  const box=document.querySelector("[data-visual-references]");if(!box||!state.active)return;
  try{
    const d=await api("/api/video/references?project="+encodeURIComponent(state.active)),refs=d.references||[];window.__studioVisualRefs=refs;
    if(!refs.length){box.innerHTML='<div class="empty-state">Le Director proposera ici les personnages, lieux, styles et objets nécessaires.</div>';return}
    const labels={CHARACTER:"PERSONNAGE",LOCATION:"LIEU",STYLE:"STYLE",OBJECT:"OBJET"};
    box.innerHTML=refs.map(r=>`<article class="visual-ref-card" data-ref="${esc(r.id)}"><div class="visual-ref-head"><span>${esc(labels[r.role]||r.role)} · ${esc(r.code)}</span><b>${esc(r.title)}</b></div><p>${esc(r.director_brief||"")}</p><div class="visual-ref-actions"><button type="button" data-ref-generate="${esc(r.id)}">${r.canonical_asset_id?"GÉNÉRER D’AUTRES VARIANTES":"GÉNÉRER 4 VARIANTES"}</button>${r.canonical_asset_id?`<button type="button" data-ref-lock="${esc(r.id)}" data-locked="${r.locked?1:0}">${r.locked?"DÉVERROUILLER":"VERROUILLER"}</button>`:""}</div><div class="visual-variants" data-ref-variants="${esc(r.id)}"></div></article>`).join("");
    for(const r of refs)await loadReferenceVariants(r.id,r.canonical_asset_id);
    box.querySelectorAll("[data-ref-generate]").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;btn.textContent="CLOUDFLARE IMAGE CRÉE…";try{const vd=await api("/api/video/references/"+encodeURIComponent(btn.dataset.refGenerate)+"/variants"),existing=Math.min(4,(vd.variants||[]).length);const queueEl=document.querySelector("[data-agnes-queue-state]");if(queueEl)queueEl.innerHTML="<strong>Cloudflare Image :</strong> GÉNÉRATION EN COURS…";const result=await api("/api/video/references/"+encodeURIComponent(btn.dataset.refGenerate)+"/generate",{method:"POST",body:JSON.stringify({n:4,existing_count:existing,size:"1024x1024"})});await loadVisualReferences();await loadAgnesQueueState();await loadAgnesQuota();if(!result.complete){const wait=Number(result.retry_after||60),waitText=wait>=60?Math.ceil(wait/60)+" min":wait+" s";alert("Génération partielle : "+result.total+" / "+result.requested+" variantes. Les images déjà créées sont conservées. Cloudflare a interrompu la génération. Les "+result.missing+" image(s) manquante(s) pourront être générées plus tard sans perdre celles déjà créées.")}else if(existing>0){alert("Génération complétée : "+result.total+" / "+result.requested+" variantes. Seules les images manquantes ont été générées.")}}catch(e){alert("Génération image impossible : "+e.message);btn.disabled=false}});
    box.querySelectorAll("[data-ref-lock]").forEach(btn=>btn.onclick=async()=>{await api("/api/video/references/"+encodeURIComponent(btn.dataset.refLock)+"/lock",{method:"POST",body:JSON.stringify({locked:btn.dataset.locked!=="1"})});await loadVisualReferences()});
    const picker=document.querySelector("[data-plan-references]");
    if(picker){const canon=refs.filter(r=>r.canonical_asset_id&&r.role!=="KEYFRAME");picker.innerHTML=canon.length?canon.map(r=>`<label class="check-line"><input type="checkbox" data-plan-ref value="${esc(r.id)}" checked/> ${esc(r.title)} <small>${esc(r.code)}</small></label>`).join(""):'<div class="empty-state">Aucun canon validé. Le plan sera généré depuis le texte uniquement.</div>'}
    const keyPicker=document.querySelector("[data-plan-keyframe]");
    if(keyPicker){const keys=refs.filter(r=>r.canonical_asset_id&&r.role==="KEYFRAME");keyPicker.innerHTML='<option value="">AUCUN · MODE TEXTE/RÉFÉRENCE</option>'+keys.map(r=>`<option value="${esc(r.id)}">${esc(r.title)} · ${esc(r.code)}</option>`).join("")}
  }catch(e){box.innerHTML='<div class="empty-state">Références indisponibles : '+esc(e.message)+'</div>'}
}
async function loadReferenceVariants(refId,canonicalAssetId){
  const box=document.querySelector('[data-ref-variants="'+CSS.escape(refId)+'"]');if(!box)return;
  try{
    const d=await api("/api/video/references/"+encodeURIComponent(refId)+"/variants"),vars=d.variants||[];
    if(!vars.length){box.innerHTML='<small>Aucune image générée.</small>';return}
    box.innerHTML=vars.map(v=>`<figure class="visual-variant ${v.asset_id===canonicalAssetId?"is-canon":""}"><img src="${API}/api/assets/${encodeURIComponent(v.asset_id)}/content" alt="" loading="lazy"/><figcaption><span>${v.asset_id===canonicalAssetId?"CANON":"VARIANTE"}</span><button type="button" data-make-canon="${esc(v.id)}" ${v.asset_id===canonicalAssetId?"disabled":""}>${v.asset_id===canonicalAssetId?"VALIDÉ":"VALIDER"}</button></figcaption></figure>`).join("");
    box.querySelectorAll("[data-make-canon]").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;await api("/api/video/references/"+encodeURIComponent(refId)+"/canon",{method:"POST",body:JSON.stringify({variant_id:btn.dataset.makeCanon})});await loadVisualReferences()});
  }catch(e){box.innerHTML='<small>Variantes indisponibles.</small>'}
}

async function analyseWorkWithAI(){
  const out=document.querySelector("[data-analysis-summary]"),board=document.querySelector("[data-storyboard]"),intent=document.querySelector("[data-director-intent]"),btn=document.querySelector("[data-analyse-work]");if(!out)return;
  if(!state.active){alert("Sélectionne d’abord un projet.");return}
  btn.disabled=true;btn.textContent="CLOUDFLARE ANALYSE L’ŒUVRE…";setText("[data-analysis-state]","CLOUDFLARE WORKERS AI · ANALYSE EN COURS");
  try{
    const d=await api("/api/video/analyse",{method:"POST",body:JSON.stringify({project_id:state.active,intent:intent?.value||""})}),a=d.analysis||{},r=a.reading||{},dir=a.direction||{},shots=Array.isArray(a.storyboard)?a.storyboard:[];
    out.innerHTML=`<div class="analysis-report"><div><span>LECTURE</span><b>${esc(r.core||"—")}</b></div><div><span>THÈMES</span><b>${esc((r.themes||[]).join(" · ")||"—")}</b></div><div><span>ARC ÉMOTIONNEL</span><b>${esc(r.emotional_arc||"—")}</b></div><div><span>CONCEPT</span><b>${esc(dir.concept||"—")}</b></div><div><span>IMAGE</span><b>${esc([dir.palette,dir.lighting].filter(Boolean).join(" · ")||"—")}</b></div><div><span>CAMÉRA</span><b>${esc(dir.camera||"—")}</b></div><p><strong>Continuité :</strong> ${esc((dir.continuity_rules||[]).join(" · ")||"—")}<br><strong>À éviter :</strong> ${esc((r.avoid||[]).join(" · ")||"—")}</p></div>`;
    if(intent&&!intent.value.trim())intent.value=dir.concept||"";
    board.innerHTML=shots.length?shots.map((s,i)=>`<article class="story-row"><span>PLAN ${String(s.index||i+1).padStart(2,"0")}</span><div><b>${esc(s.visual||s.purpose||"Plan")}</b><small>${esc([s.purpose,s.camera].filter(Boolean).join(" · "))}</small></div><button type="button" data-ai-shot="${i}">PRÉPARER</button></article>`).join(""):'<div class="empty-state">Agnes n’a proposé aucun plan.</div>';
    board.querySelectorAll("[data-ai-shot]").forEach(btn=>btn.onclick=()=>{const s=shots[Number(btn.dataset.aiShot)]||{},prompt=document.querySelector("[data-video-prompt]");prompt.value=[s.prompt_seed,s.visual&&"Visual: "+s.visual,s.camera&&"Camera: "+s.camera,s.continuity&&"Continuity: "+s.continuity,"No captions, no text overlay, coherent cinematic motion."].filter(Boolean).join("\n");document.querySelectorAll("[data-plan-ref]").forEach(x=>x.checked=true);prompt.focus();prompt.scrollIntoView({behavior:"smooth",block:"center"})});
    setText("[data-analysis-state]","CLOUDFLARE WORKERS AI · À VALIDER");await loadVisualReferences();await loadAgnesQuota();
  }catch(e){setText("[data-analysis-state]","ERREUR ANALYSE IA");alert("Analyse IA impossible : "+e.message)}
  finally{btn.disabled=false;btn.textContent="ANALYSER L’ŒUVRE AVEC L’IA"}
}
function bindWorkAnalysis(){document.querySelector("[data-analyse-work]")?.addEventListener("click",analyseWorkWithAI)}
let videoPollTimer=null;
function videoAssetUrl(id){return API+"/api/assets/"+encodeURIComponent(id)+"/content"}
async function loadAgnesQuota(){
  const el=document.querySelector("[data-agnes-quota]");if(!el)return;
  try{
    const [ai,agnes]=await Promise.all([api("/api/ai/quota"),api("/api/agnes/quota")]),b=ai.budget||{},o=agnes.observed||{},jobs=o.jobs||[],attempts=jobs.reduce((s,j)=>s+Number(j.attempts||0),0),used=Number(b.reserved||0),limit=Number(b.limit||9000),remaining=Math.max(0,Number(b.remaining||0)),pct=limit?Math.min(100,Math.round(used/limit*100)):0;
    el.innerHTML="<strong>Budget IA Cloudflare :</strong> "+used.toLocaleString("fr-BE")+" / "+limit.toLocaleString("fr-BE")+" Neurons réservés/estimés ("+pct+" %) · reste Studio "+remaining.toLocaleString("fr-BE")+" · marge sécurité 1 000 avant la limite gratuite Cloudflare. <span class=\"dim\">Director : "+Number(b.director_calls||0)+" appel(s) · Image : "+Number(b.image_calls||0)+" appel(s) · remise à zéro UTC. Blocage automatique à 9 000, aucun fallback payant.</span><br><strong>Agnes vidéo :</strong> "+Number(o.video_seconds||0)+" s observées · "+attempts+" tentative(s) enregistrée(s).";
  }catch(e){el.innerHTML="<strong>Budget IA :</strong> indisponible · "+esc(e.message)}
}
async function loadAgnesQueueState(){
  const el=document.querySelector("[data-agnes-queue-state]");if(!el||!state.active)return;
  try{
    const recovery=await api("/api/agnes/queue/recover",{method:"POST"});
    const d=await api("/api/agnes/jobs?project="+encodeURIComponent(state.active),{method:"GET"});
    if(!d.available){el.innerHTML="<strong>File Agnes :</strong> prête côté code · migration D1 requise avant activation.";return}
    const jobs=d.jobs||[],active=jobs.filter(j=>["queued","retry","running"].includes(j.status));
    if(!jobs.length){el.innerHTML="<strong>File Agnes :</strong> prête · aucun traitement en attente.";return}
    const j=active[0]||jobs[0],attempts=Number(j.attempts||0),max=Number(j.max_attempts||6);
    const next=j.next_attempt_at?new Date(j.next_attempt_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—";
    el.innerHTML="<strong>File Agnes :</strong> "+esc(String(j.kind||"JOB").toUpperCase())+" · "+esc(String(j.status||"—").toUpperCase())+" · tentative "+attempts+" / "+max+(j.last_error?" · dernière erreur : "+esc(j.last_error):"")+(j.next_attempt_at?" · reprise : "+esc(next):"")+(recovery.recovered?" · job récupéré après interruption":"")+" · reprise serveur autonome : ACTIVE (cron 1 min)";
  }catch(e){el.innerHTML="<strong>File Agnes :</strong> état indisponible · "+esc(e.message)}
}
async function loadVideoConfig(){
  const el=document.querySelector("[data-video-provider-state]");if(!el)return;
  const d=await api("/api/video/config",{method:"GET"}),cfg=d.providers?.agnes;
  setText("[data-video-provider-state]",cfg?.configured?"● PRÊT":"CLÉ MANQUANTE");
  setText("[data-video-key-state]",cfg?.configured?"● CONFIGURÉE":"MANQUANTE");
  const btn=document.querySelector("[data-video-generate]");if(btn)btn.disabled=!cfg?.configured||!activeProject();
  const note=document.querySelector("[data-video-message]");if(note)note.innerHTML=cfg?.configured?"<strong>Agnes :</strong> prêt. La clé reste côté Worker et les vidéos terminées sont archivées dans la médiathèque.":"<strong>Agnes :</strong> ajoute le secret AGNES_API_KEY dans le Worker pour activer la génération.";
}
function renderVideoHistory(rows){
  const box=document.querySelector("[data-video-history]");if(!box)return;
  setText('[data-count="videos"]',String(rows.length).padStart(2,"0"));
  box.innerHTML=rows.length?rows.map(v=>{const done=v.status==="completed",failed=v.status==="failed";return `<article class="video-job" data-video-job="${esc(v.id)}"><div class="video-job-head"><b>AGNES / ${esc(v.status.toUpperCase())}</b><span>${esc(v.progress)}%</span></div><p>${esc(v.prompt)}</p><div class="video-progress"><i style="width:${Math.max(0,Math.min(100,Number(v.progress)||0))}%"></i></div><div class="video-job-actions">${done&&v.asset_id?`<a href="${videoAssetUrl(v.asset_id)}" target="_blank" rel="noopener">OUVRIR LA VIDÉO ↗</a>`:""}${!done&&!failed?`<button type="button" data-video-refresh="${esc(v.id)}">ACTUALISER</button>`:""}${failed?`<span class="danger-text">${esc(v.error||"ÉCHEC")}</span>`:""}</div></article>`}).join(""):'<div class="empty-state">Aucune génération pour ce projet.</div>';
  box.querySelectorAll("[data-video-refresh]").forEach(b=>b.onclick=()=>refreshVideo(b.dataset.videoRefresh));
}
async function processVideoQueue(){
  try{return await api("/api/video/queue/process",{method:"POST"})}catch(e){console.warn("Agnes queue",e.message);return null}
}
async function loadVideos(){
  if(!document.querySelector("[data-video-history]"))return;
  if(!state.active){renderVideoHistory([]);return}
  await processVideoQueue();
  const d=await api("/api/video/generations?project="+encodeURIComponent(state.active),{method:"GET"});const rows=d.generations||[];renderVideoHistory(rows);
  const pending=rows.some(v=>!["completed","failed"].includes(v.status));
  clearTimeout(videoPollTimer);if(pending)videoPollTimer=setTimeout(async()=>{for(const v of rows.filter(x=>x.provider_job_id&&!["completed","failed","queued","dispatching"].includes(x.status)))await refreshVideo(v.id,true);await processVideoQueue();await loadVideos()},30000);
}
async function refreshVideo(id,silent=false){
  try{await api("/api/video/generations/"+encodeURIComponent(id)+"/refresh",{method:"POST"});if(!silent)await loadVideos()}catch(e){if(!silent)alert("Actualisation Agnes impossible : "+e.message)}
}
function bindVideoForm(){
  const form=document.querySelector("[data-video-form]");if(!form)return;
  const audio=form.querySelector("[data-video-audio]"),wrap=form.querySelector("[data-video-audio-style-wrap]");audio.onchange=()=>wrap.hidden=!audio.checked;
  form.onsubmit=async e=>{e.preventDefault();if(!state.active){alert("Sélectionne d’abord un projet.");return}
    const prompt=form.querySelector("[data-video-prompt]").value.trim();if(!prompt)return;
    const format=form.querySelector("[data-video-format]").value;
    const finalPrompt=prompt;
    const btn=form.querySelector("[data-video-generate]");btn.disabled=true;btn.textContent="ENVOI À AGNES…";
    try{await api("/api/video/generations",{method:"POST",body:JSON.stringify({project_id:state.active,prompt:finalPrompt,aspect_ratio:format,reference_ids:[...document.querySelectorAll("[data-plan-ref]:checked")].map(x=>x.value),keyframe_reference_id:document.querySelector("[data-plan-keyframe]")?.value||"",generate_audio:audio.checked,audio_style:form.querySelector("[data-video-audio-style]").value})});form.querySelector("[data-video-prompt]").value="";await processVideoQueue();await loadVideos()}
    catch(err){alert("Génération impossible : "+err.message)}
    finally{btn.disabled=false;btn.textContent="AJOUTER À LA FILE AGNES"}
  };
}
async function init(){
  document.querySelectorAll("[data-studio-date]").forEach(x=>x.textContent=new Intl.DateTimeFormat("fr-BE",{dateStyle:"medium"}).format(new Date()));
  try{
    const ok=await health();if(!ok){authRequired();return}
    apiConnected();await loadProjects();await loadTrash();
    document.querySelector("[data-new-project]")?.addEventListener("click",createProject);
    await loadVideoConfig();await loadWorkContext();loadVisualReferences();bindWorkAnalysis();loadAgnesQueueState();loadAgnesQuota();bindVideoForm();await loadVideos();
    await loadDocument();await loadAssets();await loadActivity();
    const picker=document.querySelector("[data-asset-picker]");picker?.addEventListener("change",async()=>{try{await uploadFiles([...picker.files])}catch(e){alert("Import impossible : "+e.message)}finally{picker.value=""}});
    document.querySelector("[data-reset-studio]")?.addEventListener("click",()=>{localStorage.removeItem(KEY);localStorage.removeItem(ACTIVE_KEY);location.reload()});
  }catch(e){if(e.message==="AUTH_REQUIRED")authRequired();else{setText("[data-api-state]","● ERREUR");const note=document.querySelector("[data-api-message]");if(note)note.textContent="API indisponible : "+e.message;console.error(e)}}
}
init();