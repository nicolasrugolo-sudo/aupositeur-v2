(()=>{"use strict";
const api=window.location.origin; // Same-origin API gateway; no cross-origin cookies or CORS.
const view=document.getElementById("view"),notice=document.getElementById("notice");
let tab="comments",status="pending";
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);return x;};
const btn=(label,action)=>{const b=el("button",label);b.addEventListener("click",action);return b;};
const decapGithubToken=()=>{
 for(const storage of [localStorage,sessionStorage]){
  for(let i=0;i<storage.length;i++){
   const key=storage.key(i);if(!key||!/cms|decap|github|netlify/i.test(key))continue;
   try{
    const value=JSON.parse(storage.getItem(key)||"null");
    const token=value?.token||value?.access_token||value?.user?.token||value?.user?.access_token;
    if(typeof token==="string"&&/^(?:gh[opus]_|github_pat_)[A-Za-z0-9_]+$/i.test(token))return token;
   }catch{}
  }
 }
 return "";
};
const request=async(path,options={})=>{
 if(!api)throw Error("API non configurée. Définir AUPOSITEUR_COMMUNITY_API dans community-config.js.");
 // JSON content-type is only needed for requests with a body.
 const token=decapGithubToken();
 if(!token)throw Error("Session GitHub du Studio introuvable. Reconnecte-toi au Studio puis réessaie.");
 const headers={authorization:"Bearer "+token,...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})};
 let r;
 try{r=await fetch(api+path,{credentials:"include",...options,headers});}
 catch(error){throw Error("Connexion à l'administration impossible. Ouvre d'abord l'accès sécurisé Cloudflare, connecte-toi puis reviens ici et actualise la page. Si l'erreur persiste, les requêtes CORS sont bloquées par Cloudflare Access.");}
 if(r.redirected && r.url.includes("/cdn-cgi/access/"))throw Error("Session Cloudflare Access requise : connecte-toi à l'API puis actualise le Studio.");
 const type=r.headers.get("content-type")||"";
 if(!type.includes("application/json"))throw Error("La route administrative ne renvoie pas de JSON. Vérifier le routage Cloudflare Pages.");
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||"Erreur API "+r.status);
 return data;
};
const message=x=>notice.textContent=x;
const run=async f=>{try{message("");await f()}catch(e){message(e.message||"Erreur de connexion")}};
async function render(){
 view.replaceChildren();
 if(tab==="comments"){
  const section=el("section"),select=el("select");
  for(const s of ["pending","approved","rejected"]){const o=el("option",({pending:"En attente",approved:"Approuvés",rejected:"Refusés"})[s]);o.value=s;select.append(o)}
  select.value=status;select.addEventListener("change",()=>{status=select.value;run(render)});section.append(el("h2","Modération"),select);view.append(section);
  const settings=el("details"),summary=el("summary","Ouvrir ou fermer les commentaires d'une publication");settings.append(summary);
  const settingForm=el("form"),contentType=el("select"),contentId=el("input"),enabled=el("select");
  for(const t of ["ecrits","reflexions","musiques","citations"])contentType.append(new Option(t,t));
  for(const [label,value] of [["Commentaires autorisés","true"],["Commentaires fermés","false"]])enabled.append(new Option(label,value));
  const typeLabel=el("label","Rubrique"),idLabel=el("label","Identifiant de publication"),enabledLabel=el("label","État");
  typeLabel.append(contentType);idLabel.append(contentId);enabledLabel.append(enabled);
  const save=el("button","Enregistrer");save.type="submit";
  settingForm.append(typeLabel,idLabel,enabledLabel,save);
  settingForm.addEventListener("submit",e=>{e.preventDefault();run(async()=>{await request("/api/admin/comment-settings",{method:"PUT",body:JSON.stringify({type:contentType.value,id:contentId.value.trim(),enabled:enabled.value==="true"})});message("Paramètre enregistré.")})});
  settings.append(settingForm);section.append(settings);
  const data=await request("/api/admin/comments?status="+status);
  if(!data.comments.length)section.append(el("p","Aucun commentaire."));
  for(const c of data.comments){
   const item=el("article");item.append(el("strong",c.author_name),el("p",c.body),el("small",c.content_type+" / "+c.content_id+" — "+c.created_at));
   const actions=el("div");actions.className="actions";
   for(const s of ["approved","rejected"]){if(c.status===s)continue;actions.append(btn(s==="approved"?"Approuver":"Refuser",()=>run(async()=>{await request("/api/admin/comments",{method:"PATCH",body:JSON.stringify({id:c.id,status:s})});await render()})))}
   if(c.status==="approved")actions.append(btn("Répondre",()=>{const body=prompt("Votre réponse en tant qu'AUPOSITEUR :");if(!body)return;run(async()=>{await request("/api/admin/comments/reply",{method:"POST",body:JSON.stringify({parent_id:c.id,body})});message("Réponse publiée.");await render()})}));
   actions.append(btn("Supprimer",()=>{if(!confirm("Supprimer définitivement ce commentaire ?"))return;run(async()=>{await request("/api/admin/comments",{method:"DELETE",body:JSON.stringify({id:c.id})});await render()})}));
   item.append(actions);section.append(item);
  }
 }else if(tab==="subscribers"){
  const section=el("section");section.append(el("h2","Abonnés"));view.append(section);
  const data=await request("/api/admin/subscribers");
  const active=data.subscribers.filter(s=>s.status==="active").length;section.append(el("p",active+" abonnés confirmés sur "+data.subscribers.length+" enregistrements affichés."));
  for(const s of data.subscribers){const item=el("article");item.append(el("strong",s.email),el("p","Statut : "+s.status),el("small","Consentement : "+s.consent_at));item.append(btn("Supprimer l'abonné",()=>{if(!confirm("Supprimer définitivement cet abonné et ses données ?"))return;run(async()=>{await request("/api/admin/subscribers",{method:"DELETE",body:JSON.stringify({id:s.id})});await render()})}));section.append(item)}
 }else{
  const section=el("section");section.append(el("h2","Préparer une annonce"));
  const form=el("form"),subject=el("input"),body=el("textarea");
  const publication=el("select"),pubLabel=el("label","Préparer depuis une publication (facultatif)");
  publication.append(new Option("Choisir une publication…",""));
  let selectedType="",selectedId="";
  try{
   const catalog=await (await fetch("/studio-content.json")).json();
   for(const [type,items] of Object.entries(catalog.collections)){
    for(const item of items){if(item.draft)continue;
     const option=new Option(type+" — "+item.title.slice(0,90),type+"|"+item.slug);
     option.dataset.title=item.title;option.dataset.description=item.description||"";publication.append(option);
    }
   }
  }catch{message("Catalogue indisponible : vous pouvez créer une campagne libre.")}
  publication.addEventListener("change",()=>{
   const option=publication.selectedOptions[0];const parts=publication.value.split("|");
   selectedType=parts[0]||"";selectedId=parts[1]||"";
   if(!selectedType)return;
   const path=selectedType==="musiques"?"musique":selectedType;
   subject.value="Nouveau sur AUPOSITEUR : "+option.dataset.title;
   body.value="Bonjour,\n\nUne nouvelle publication vous attend sur AUPOSITEUR.\n\n"+option.dataset.title+"\n"+option.dataset.description+"\n\nhttps://www.aupositeur.be/"+path+"/"+selectedId+"/\n\nÀ bientôt,\nAUPOSITEUR";
  });
  pubLabel.append(publication);form.append(pubLabel);
  subject.required=true;subject.minLength=3;subject.maxLength=180;body.required=true;body.minLength=5;
  const l1=el("label","Objet"),l2=el("label","Message");l1.append(subject);l2.append(body);form.append(l1,l2,btn("Enregistrer le brouillon",()=>{}));
  form.addEventListener("submit",e=>{e.preventDefault();run(async()=>{await request("/api/admin/campaigns",{method:"POST",body:JSON.stringify({subject:subject.value,body_text:body.value,content_type:selectedType,content_id:selectedId})});message("Brouillon enregistré.");await render()})});section.append(form);view.append(section);
  const data=await request("/api/admin/campaigns");
  for(const c of data.campaigns){const item=el("article");item.append(el("strong",c.subject),el("p","État : "+c.status));
   if(c.status==="draft")item.append(btn("Envoyer un e-mail de test",()=>{const email=prompt("Adresse e-mail pour le test :");if(!email)return;run(async()=>{await request("/api/admin/campaigns/test",{method:"POST",body:JSON.stringify({id:c.id,email})});message("E-mail de test envoyé.")})}));
   if(c.status==="draft")item.append(btn("Confirmer et programmer l'envoi",()=>{if(!confirm("Envoyer cette campagne aux abonnés actifs ?"))return;run(async()=>{await request("/api/admin/campaigns/queue",{method:"POST",body:JSON.stringify({id:c.id})});message("Campagne programmée.");await render()})}));
   section.append(item)}
 }
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.tab;document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));run(render)}));
run(render);
})();