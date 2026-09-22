const API="https://aupositeur-studio-api.nicolas-rugolo.workers.dev";
const KEY="aupositeur.studio.v1";
const ACTIVE_KEY="aupositeur.studio.active";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtBytes=n=>{n=Number(n||0);if(n<1024)return n+" B";if(n<1048576)return(n/1024).toFixed(1)+" KB";return(n/1048576).toFixed(2)+" MB"};
let state={projects:[],active:localStorage.getItem(ACTIVE_KEY)||"",assets:[],activity:[]};
async function api(path,options={}){
  const r=await fetch(API+path,{...options,credentials:"include",headers:{...(options.body instanceof FormData?{}:{"content-type":"application/json"}),...(options.headers||{})}});
  if(r.status===401||r.status===403){throw new Error("AUTH_REQUIRED")}
  const type=r.headers.get("content-type")||""; const data=type.includes("application/json")?await r.json():await r.text();
  if(!r.ok)throw new Error(data?.error||("HTTP "+r.status)); return data;
}
function setText(sel,value){document.querySelectorAll(sel).forEach(x=>x.textContent=value)}
function activeProject(){return state.projects.find(p=>p.id===state.active)||null}
function renderActiveProject(){
  const p=activeProject();
  setText("[data-active-project]",p?.title||"AUCUN PROJET");
  document.querySelectorAll("[data-active-project-wrap]").forEach(x=>x.hidden=!p);
}
function apiConnected(){
  const note=document.querySelector("[data-api-message]");
  if(note)note.innerHTML="<strong>Cloud :</strong> API privée connectée · D1 + R2 opérationnels.";
}
function authRequired(){
  setText("[data-api-state]","AUTH REQUISE");
  const note=document.querySelector("[data-api-message]");
  if(note)note.innerHTML='Session API absente. <a href="'+API+'/health" target="_blank" rel="noopener">Ouvrir Cloudflare Access ↗</a>, puis recharger le Studio.';
}
async function health(){
  try{const h=await api("/health",{method:"GET"});setText("[data-api-state]",h.authenticated?"● CONNECTÉ":"AUTH REQUISE");setText("[data-d1-state]",h.d1?"● CONNECTÉ":"ERREUR");setText("[data-r2-state]",h.r2?"● CONNECTÉ":"ERREUR");return h.authenticated}catch(e){if(e.message==="AUTH_REQUIRED")authRequired();return false}
}
async function loadProjects(){
  const d=await api("/api/projects",{method:"GET"});state.projects=d.projects||[];
  if(!state.active||!state.projects.some(p=>p.id===state.active)){state.active=state.projects[0]?.id||"";if(state.active)localStorage.setItem(ACTIVE_KEY,state.active)}
  renderProjects();renderActiveProject();setText('[data-count="projects"]',String(state.projects.length).padStart(2,"0"));
}
function renderProjects(){
  const list=document.querySelector("[data-project-list]");if(!list)return;
  list.innerHTML=state.projects.length?state.projects.map((p,i)=>`<button class="project-row ${p.id===state.active?"selected":""}" data-project="${esc(p.id)}"><span>${String(i+1).padStart(2,"0")}</span><b>${esc(p.title)}</b><small>${esc(p.type)} · ${esc(p.status)}</small></button>`).join(""):'<div class="empty-state">Aucun projet dans D1.</div>';
  list.querySelectorAll("[data-project]").forEach(b=>b.onclick=()=>{state.active=b.dataset.project;localStorage.setItem(ACTIVE_KEY,state.active);renderProjects();renderActiveProject();location.reload()});
}
async function createProject(){
  const title=prompt("Nom du projet");if(!title?.trim())return;
  await api("/api/projects",{method:"POST",body:JSON.stringify({title:title.trim(),type:"Projet"})});await loadProjects();
}
async function loadDocument(){
  const editor=document.querySelector("[data-editor]");if(!editor)return;if(!state.active){editor.disabled=true;editor.placeholder="Crée d’abord un projet.";return}
  const d=await api("/api/projects/"+encodeURIComponent(state.active)+"/document",{method:"GET"});editor.value=d.document?.content||"";editor.disabled=false;setText("[data-save-state]","CHARGÉ D1");
  let timer;const persist=async()=>{setText("[data-save-state]","SAUVEGARDE…");try{await api("/api/projects/"+encodeURIComponent(state.active)+"/document",{method:"PUT",body:JSON.stringify({content:editor.value})});setText("[data-save-state]","SAUVÉ D1")}catch(e){setText("[data-save-state]","ERREUR")}};
  editor.oninput=()=>{setText("[data-save-state]","MODIFIÉ");clearTimeout(timer);timer=setTimeout(persist,900)};document.querySelector("[data-save-doc]")?.addEventListener("click",persist);
}
function assetUrl(a){return API+"/api/assets/"+encodeURIComponent(a.id)+"/content"}
function renderAssets(){
  const list=document.querySelector("[data-asset-list]");if(!list)return;
  list.innerHTML=state.assets.length?state.assets.map(a=>{
    const mime=String(a.mime||"");
    const isImage=mime.startsWith("image/")||String(a.kind||"").toUpperCase()==="IMAGE";
    const preview=isImage?`<a class="asset-thumb" href="${assetUrl(a)}" target="_blank" rel="noopener"><img src="${assetUrl(a)}" alt="" loading="lazy"></a>`:`<div class="asset-thumb asset-file">${esc(a.kind||"FILE")}</div>`;
    return `<article class="asset-card">${preview}<div class="asset-info"><span>${esc(a.kind)}</span><b><a href="${assetUrl(a)}" target="_blank" rel="noopener">${esc(a.name)}</a></b><small>${esc(fmtBytes(a.bytes))}</small></div></article>`;
  }).join(""):'<div class="empty-state">Aucun asset dans R2 pour ce projet.</div>';
  setText('[data-count="assets"]',String(state.assets.length).padStart(2,"0"));
}
async function loadAssets(){
  const q=state.active?"?project="+encodeURIComponent(state.active):"";const d=await api("/api/assets"+q,{method:"GET"});state.assets=d.assets||[];renderAssets();
}
async function uploadFiles(files){
  if(!state.active){alert("Crée ou sélectionne d’abord un projet.");return}
  for(const file of files){const form=new FormData();form.append("file",file);form.append("project_id",state.active);setText("[data-upload-state]","ENVOI "+file.name+"…");await api("/api/assets",{method:"POST",body:form});}
  setText("[data-upload-state]","R2 CONNECTÉ");await loadAssets();
}
async function loadActivity(){
  const box=document.querySelector("[data-activity-list]");if(!box)return;const d=await api("/api/activity",{method:"GET"});state.activity=d.activity||[];
  box.innerHTML=state.activity.length?state.activity.slice(0,8).map(a=>`<div class="log"><span>${new Date(a.created_at).toLocaleTimeString("fr-BE")}</span><span class="event">${esc(a.message)}</span><span class="kind">${esc(a.kind)}</span><span class="provider">D1</span></div>`).join(""):'<div class="empty-state">Aucune activité.</div>';
}
async function init(){
  document.querySelectorAll("[data-studio-date]").forEach(x=>x.textContent=new Intl.DateTimeFormat("fr-BE",{dateStyle:"medium"}).format(new Date()));
  try{
    const ok=await health();if(!ok){authRequired();return}
    apiConnected();await loadProjects();
    document.querySelector("[data-new-project]")?.addEventListener("click",createProject);
    await loadDocument();await loadAssets();await loadActivity();
    const picker=document.querySelector("[data-asset-picker]");picker?.addEventListener("change",async()=>{try{await uploadFiles([...picker.files])}catch(e){alert("Import impossible : "+e.message)}finally{picker.value=""}});
    document.querySelector("[data-reset-studio]")?.addEventListener("click",()=>{localStorage.removeItem(KEY);localStorage.removeItem(ACTIVE_KEY);location.reload()});
  }catch(e){if(e.message==="AUTH_REQUIRED")authRequired();else{setText("[data-api-state]","● ERREUR");const note=document.querySelector("[data-api-message]");if(note)note.textContent="API indisponible : "+e.message;console.error(e)}}
}
init();