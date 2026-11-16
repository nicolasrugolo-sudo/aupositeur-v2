(()=>{"use strict";
const api=window.location.origin; // Same-origin API gateway; no cross-origin cookies or CORS.
const view=document.getElementById("view"),notice=document.getElementById("notice");
let tab="comments",status="pending";
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);return x;};
const btn=(label,action)=>{const b=el("button",label);b.type="button";b.addEventListener("click",action);return b;};
// Decap CMS persists the signed-in user in a dedicated key. Never pick an
// arbitrary token from unrelated applications sharing this origin.
const decapGithubToken=()=>{
 const keys=["decap-cms-user","netlify-cms-user"];
 for(const storage of [localStorage,sessionStorage]){
  for(const key of keys){
   try{
    const value=JSON.parse(storage.getItem(key)||"null");
    const token=value?.token?.access_token||value?.token?.token||value?.token||value?.access_token||value?.user?.token?.access_token||value?.user?.token;
    if(typeof token==="string"&&/^[A-Za-z0-9_]{20,255}$/i.test(token))return token;
   }catch{}
  }
 }
 return "";
};
const request=async(path,options={})=>{
 if(!["https://www.aupositeur.be","https://aupositeur.be"].includes(api)&&!["localhost","127.0.0.1"].includes(location.hostname))throw Error("L’API de production est désactivée sur cet aperçu.");
 // JSON content-type is only needed for requests with a body.
 const token=decapGithubToken();
 if(!token)throw Error("Session GitHub du Studio introuvable. Reconnecte-toi au Studio puis réessaie.");
 const headers={authorization:"Bearer "+token,...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})};
 let r;
 try{r=await fetch(api+path,{credentials:"include",...options,headers});}
 catch(error){throw Error("La passerelle Communauté est inaccessible. Le navigateur n'a pas pu joindre l'API du Studio. Vérifier le routage et le déploiement du Worker, sans réactiver Cloudflare Access.");}
 if(r.redirected && r.url.includes("/cdn-cgi/access/"))throw Error("La route Communauté est encore interceptée par Cloudflare Access : corriger sa configuration, sans contourner la sécurité.");
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
  select.setAttribute("aria-label","Statut des commentaires");
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
   if(c.status==="approved"){
     const reply=el("form"),label=el("label","Réponse d’AUPOSITEUR"),field=el("textarea"),submit=el("button","Publier la réponse");
     reply.hidden=true;field.required=true;field.minLength=2;field.maxLength=3000;label.append(field);reply.append(label,submit);
     actions.append(btn("Répondre",()=>{reply.hidden=!reply.hidden;if(!reply.hidden)field.focus()}));
     reply.addEventListener("submit",event=>{event.preventDefault();run(async()=>{await request("/api/admin/comments/reply",{method:"POST",body:JSON.stringify({parent_id:c.id,body:field.value.trim()})});await render();message("Réponse publiée.")})});
     item.append(reply);
   }
   actions.append(btn("Supprimer",()=>{if(!confirm("Supprimer définitivement ce commentaire ?"))return;run(async()=>{await request("/api/admin/comments",{method:"DELETE",body:JSON.stringify({id:c.id})});await render()})}));
   item.append(actions);section.append(item);
  }
 }else if(tab==="subscribers"){
  const section=el("section");section.append(el("h2","Abonnés"));view.append(section);
  const data=await request("/api/admin/subscribers");
  const active=data.subscribers.filter(s=>s.status==="active").length;section.append(el("p",active+" abonnés confirmés sur "+data.subscribers.length+" enregistrements affichés."));
  const search=el("input"),filter=el("select"),searchLabel=el("label","Rechercher par adresse"),filterLabel=el("label","Statut de l’abonnement"),results=el("div");
  search.type="search";searchLabel.append(search);filterLabel.append(filter);
  const labels={pending:"En attente de confirmation",active:"Confirmé",unsubscribed:"Désinscrit"};
  filter.append(new Option("Tous les statuts",""),...Object.entries(labels).map(([value,label])=>new Option(label,value)));
  section.append(searchLabel,filterLabel,results);
  const renderResults=()=>{
   results.replaceChildren();
   const matching=data.subscribers.filter(s=>(!filter.value||s.status===filter.value)&&s.email.toLowerCase().includes(search.value.trim().toLowerCase()));
   if(!matching.length)results.append(el("p","Aucun résultat."));
   for(const s of matching){const item=el("article");item.append(el("strong",s.email),el("p",labels[s.status]||s.status),el("small","Consentement : "+(s.consent_at||"—")+" · Confirmation : "+(s.confirmed_at||"—")+" · Désinscription : "+(s.unsubscribed_at||"—")));item.append(btn("Supprimer l'abonné",()=>{if(!confirm("Supprimer définitivement cet abonné et ses données ?"))return;run(async()=>{await request("/api/admin/subscribers",{method:"DELETE",body:JSON.stringify({id:s.id})});await render()})}));results.append(item)}
  };search.addEventListener("input",renderResults);filter.addEventListener("change",renderResults);renderResults();
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
  const l1=el("label","Objet"),l2=el("label","Message");l1.append(subject);l2.append(body);body.maxLength=15000;
  const preview=el("div"),saveDraft=el("button","Enregistrer le brouillon");preview.className="newsletter-preview";preview.hidden=true;
  const updatePreview=()=>{preview.replaceChildren(el("strong",subject.value||"Sans objet"),el("p",body.value||"Saisis un message pour le prévisualiser."));};
  const showPreview=mobile=>{preview.hidden=false;preview.toggleAttribute("data-mobile",mobile);updatePreview();};
  subject.addEventListener("input",updatePreview);body.addEventListener("input",updatePreview);
  form.append(l1,l2,btn("Aperçu ordinateur",()=>showPreview(false)),btn("Aperçu mobile",()=>showPreview(true)),preview,saveDraft);
  form.addEventListener("submit",e=>{e.preventDefault();run(async()=>{await request("/api/admin/campaigns",{method:"POST",body:JSON.stringify({subject:subject.value,body_text:body.value,content_type:selectedType,content_id:selectedId})});message("Brouillon enregistré.");await render()})});section.append(form);view.append(section);
  const data=await request("/api/admin/campaigns");
  const history=el("section"),campaignLabels={draft:"Brouillon",queued:"En file d’envoi",sending:"En cours",sent:"Envoyée",failed:"Erreur d’envoi",cancelled:"Annulée"};
  history.append(el("h2","Historique des newsletters"));
  if(!data.campaigns.length)history.append(el("p","Aucune campagne."));
  view.append(history);
  for(const c of data.campaigns){const item=el("article");item.append(el("strong",c.subject),el("p",campaignLabels[c.status]||c.status),el("small","Créée : "+(c.created_at||"—")+" · Envoi : "+(c.sent_at||"—")));
   if(c.status==="draft")item.append(btn("Envoyer un e-mail de test",()=>{const email=prompt("Adresse e-mail pour le test :");if(!email)return;run(async()=>{await request("/api/admin/campaigns/test",{method:"POST",body:JSON.stringify({id:c.id,email})});message("E-mail de test envoyé.")})}));
   if(c.status==="draft")item.append(btn("Mettre en file d’envoi",()=>{if(!confirm("Envoyer cette campagne aux abonnés actifs ?"))return;run(async()=>{await request("/api/admin/campaigns/queue",{method:"POST",body:JSON.stringify({id:c.id})});message("Campagne mise en file d’envoi.");await render()})}));
   history.append(item)}
 }
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.tab;document.querySelectorAll("[data-tab]").forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-pressed",String(x===b))});run(render)}));
run(render);
})();