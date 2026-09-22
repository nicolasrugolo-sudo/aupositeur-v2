const KEY="aupositeur.studio.v1";
const defaults={projects:[{id:"putain-de-vie",title:"Putain de vie",type:"Chanson",status:"production",updated:new Date().toISOString()},{id:"a-cote-de-la-plaque",title:"À côté de la plaque",type:"Chanson",status:"production",updated:new Date().toISOString()}],active:"putain-de-vie",docs:{},assets:[],activity:[]};
function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return structuredClone(defaults)}}
function save(s){localStorage.setItem(KEY,JSON.stringify(s));window.dispatchEvent(new CustomEvent("studio:change",{detail:s}))}
function log(s,message,kind="SYSTEM"){s.activity.unshift({at:new Date().toISOString(),message,kind});s.activity=s.activity.slice(0,30)}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
let state=load();
document.querySelectorAll("[data-studio-date]").forEach(x=>x.textContent=new Intl.DateTimeFormat("fr-BE",{dateStyle:"medium"}).format(new Date()));
const projectList=document.querySelector("[data-project-list]");
function renderProjects(){if(!projectList)return;projectList.innerHTML=state.projects.map((p,i)=>`<button class="project-row ${p.id===state.active?"selected":""}" data-project="${esc(p.id)}"><span>${String(i+1).padStart(2,"0")}</span><b>${esc(p.title)}</b><small>${esc(p.type)} · ${esc(p.status)}</small></button>`).join("");projectList.querySelectorAll("[data-project]").forEach(b=>b.onclick=()=>{state.active=b.dataset.project;save(state);renderProjects()})}
renderProjects();
document.querySelector("[data-new-project]")?.addEventListener("click",()=>{const title=prompt("Nom du projet");if(!title?.trim())return;const id=(title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"projet")+"-"+Date.now().toString().slice(-4);state.projects.unshift({id,title:title.trim(),type:"Projet",status:"brouillon",updated:new Date().toISOString()});state.active=id;log(state,`Projet créé : ${title.trim()}`,"PROJECT");save(state);renderProjects()});
const editor=document.querySelector("[data-editor]");
const saveLabel=document.querySelector("[data-save-state]");
if(editor){const active=state.active||"scratch";editor.value=state.docs[active]??editor.value;let timer;const persist=()=>{state.docs[active]=editor.value;log(state,"Texte sauvegardé localement","TEXT");save(state);if(saveLabel)saveLabel.textContent="SAUVÉ";};editor.addEventListener("input",()=>{if(saveLabel)saveLabel.textContent="MODIFIÉ";clearTimeout(timer);timer=setTimeout(persist,700)});document.querySelector("[data-save-doc]")?.addEventListener("click",persist)}
const picker=document.querySelector("[data-asset-picker]");
const assetList=document.querySelector("[data-asset-list]");
function renderAssets(){if(!assetList)return;assetList.innerHTML=state.assets.length?state.assets.map(a=>`<div class="asset-row"><span>${esc(a.kind)}</span><b>${esc(a.name)}</b><small>${esc(a.size)}</small></div>`).join(""):'<div class="empty-state">Aucun asset enregistré dans ce navigateur.</div>'}
renderAssets();
picker?.addEventListener("change",()=>{for(const f of picker.files||[]){state.assets.unshift({name:f.name,size:(f.size/1024/1024).toFixed(2)+" MB",kind:f.type.startsWith("image/")?"IMAGE":f.type.startsWith("audio/")?"AUDIO":f.type.startsWith("video/")?"VIDEO":"FILE",added:new Date().toISOString()});log(state,`Asset référencé : ${f.name}`,"ASSET")}save(state);renderAssets();picker.value=""});
document.querySelector("[data-reset-studio]")?.addEventListener("click",()=>{if(confirm("Réinitialiser les données locales du Studio ?")){localStorage.removeItem(KEY);location.reload()}});
document.querySelectorAll("[data-count]").forEach(el=>{const k=el.dataset.count;if(k==="projects")el.textContent=String(state.projects.length).padStart(2,"0");if(k==="assets")el.textContent=String(state.assets.length).padStart(2,"0")});
