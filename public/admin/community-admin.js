import { renderNewsletter } from "./newsletter-renderer.mjs";

function newsletterDocument(root) {
 const aliases={div:"p",b:"strong",i:"em",h1:"h2"};
 const tags=new Set(["p","h2","h3","strong","em","ul","ol","li","a","img","br"]);
 function read(node){
  if(node.nodeType===Node.TEXT_NODE)return [node.textContent];
  if(node.nodeType!==Node.ELEMENT_NODE)return [];
  const name=node.localName,tag=aliases[name]||name;
  if(["script","style","iframe","object","svg","math"].includes(name))return [];
  if(tag==="img")return [{tag,src:node.getAttribute("src"),alt:node.getAttribute("alt")}];
  if(tag==="br")return [{tag}];
  const children=Array.from(node.childNodes).flatMap(read);
  if(!tags.has(tag))return children;
  return [{tag,children,...(tag==="a"?{href:node.getAttribute("href")}: {})}];
 }
 return Array.from(root.childNodes).flatMap(read);
}

(()=>{"use strict";
const api=window.location.origin; // Same-origin API gateway; no cross-origin cookies or CORS.
const view=document.getElementById("view"),notice=document.getElementById("notice");
let tab=new URLSearchParams(location.search).get("onglet")==="newsletters"?"campaigns":"comments",status="pending",subscriberQuery="",subscriberStatus="",subscriberPage=1;
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
  for(const s of ["pending","approved","rejected","hidden"]){const o=el("option",({pending:"En attente",approved:"Approuvés",rejected:"Refusés",hidden:"Masqués"})[s]);o.value=s;select.append(o)}
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
  const commentsTab=document.querySelector('[data-tab="comments"]');
  if(Number.isInteger(data.pending))commentsTab.textContent=data.pending ? "Commentaires ("+data.pending+" en attente)" : "Commentaires";
  if(!data.comments.length)section.append(el("p","Aucun commentaire."));
  for(const c of data.comments){
   const item=el("article");item.append(el("strong",c.author_name),el("p",c.body),el("small",c.content_type+" / "+c.content_id+" — "+c.created_at));
   const actions=el("div");actions.className="actions";
   for(const s of ["approved","rejected","hidden"]){if(c.status===s||(s==="hidden"&&c.status!=="approved"))continue;actions.append(btn(({approved:"Approuver",rejected:"Refuser",hidden:"Masquer"})[s],()=>run(async()=>{await request("/api/admin/comments",{method:"PATCH",body:JSON.stringify({id:c.id,status:s})});await render()})))}
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
  const search=el("input"),filter=el("select"),searchLabel=el("label","Rechercher par adresse"),filterLabel=el("label","Statut de l’abonnement"),results=el("div");
  search.type="search";search.maxLength=254;search.value=subscriberQuery;searchLabel.append(search);filterLabel.append(filter);
  const labels={pending:"En attente de confirmation",active:"Confirmé",unsubscribed:"Désinscrit"};
  filter.append(new Option("Tous les statuts",""),...Object.entries(labels).map(([value,label])=>new Option(label,value)));
  filter.value=subscriberStatus;
  section.append(searchLabel,filterLabel,results);
  let revision=0,timer;
  async function refresh(){
   const current=++revision;
   const params=new URLSearchParams({q:subscriberQuery,status:subscriberStatus,page:String(subscriberPage)});
   const data=await request("/api/admin/subscribers?"+params);
   if(current!==revision||!results.isConnected)return;
   if(!data.subscribers.length&&subscriberPage>1){subscriberPage--;return refresh()}
   const pages=Math.max(1,Math.ceil(data.total/data.pageSize));
   const previous=btn("Page précédente",()=>{subscriberPage--;run(refresh)});
   const next=btn("Page suivante",()=>{subscriberPage++;run(refresh)});
   previous.disabled=subscriberPage<=1;next.disabled=subscriberPage>=pages;
   const summary=el("p",data.total+" résultat(s) · Page "+subscriberPage+" sur "+pages);
   summary.setAttribute("role","status");
   results.replaceChildren(summary,previous,next);
   for(const s of data.subscribers){
    const item=el("article");
    item.append(el("strong",s.email),el("p",labels[s.status]||s.status),el("small","Consentement : "+(s.consent_at||"—")+" ("+(s.consent_version||"—")+") · Confirmation : "+(s.confirmed_at||"—")+" · Désinscription : "+(s.unsubscribed_at||"—")));
    if(s.status!=="unsubscribed")item.append(btn("Désinscrire",()=>{
      if(!confirm("Désinscrire cette adresse en conservant la trace de son opposition ?"))return;
      run(async()=>{
        await request("/api/admin/subscribers",{method:"PATCH",body:JSON.stringify({id:s.id,status:"unsubscribed"})});
        await refresh();
        message("Désinscription enregistrée.");
      });
    }));
    item.append(btn("Supprimer l'abonné",()=>{if(!confirm("Supprimer définitivement cet abonné et ses données ?"))return;run(async()=>{await request("/api/admin/subscribers",{method:"DELETE",body:JSON.stringify({id:s.id})});await refresh()})}));
    results.append(item);
   }
  }
  search.addEventListener("input",()=>{subscriberQuery=search.value;subscriberPage=1;revision++;clearTimeout(timer);timer=setTimeout(()=>run(refresh),250)});
  filter.addEventListener("change",()=>{subscriberStatus=filter.value;subscriberPage=1;clearTimeout(timer);run(refresh)});
  await refresh();
 }else{
  const section=el("section");section.append(el("h2","Préparer une annonce"));
  const form=el("form"),subject=el("input"),body=el("div");
  body.contentEditable="true";body.setAttribute("role","textbox");body.setAttribute("aria-label","Message");body.setAttribute("aria-multiline","true");
  body.className="newsletter-editor";
  body.addEventListener("paste",event=>{
   event.preventDefault();
   document.execCommand("insertText",false,event.clipboardData.getData("text/plain"));
  });
  body.addEventListener("drop",event=>event.preventDefault());
  const publication=el("select"),pubLabel=el("label","Insérer un lien vers une œuvre (facultatif)");
  publication.append(new Option("Choisir une publication…",""));
  let selectedType="",selectedId="",editingId="";
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
   if(!subject.value)subject.value="Nouveau sur AUPOSITEUR : "+option.dataset.title;
   const link="https://www.aupositeur.be/"+path+"/"+encodeURIComponent(selectedId)+"/";
   body.focus();
   const range=document.createRange();range.selectNodeContents(body);range.collapse(false);
   const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
   document.execCommand("insertHTML",false,renderNewsletter([{tag:"p",children:[{tag:"a",href:link,children:[option.dataset.title]}]}]).html);
  });
  pubLabel.append(publication);form.append(pubLabel);
  subject.required=true;subject.minLength=3;subject.maxLength=180;
  const l1=el("label","Objet");l1.append(subject);
  const toolbar=el("div");toolbar.className="newsletter-toolbar";toolbar.setAttribute("aria-label","Mise en forme");
  const command=(label,name,value)=>btn(label,()=>{
   body.focus();
   document.execCommand(name,false,value);
   updatePreview();
  });
  toolbar.append(command("Paragraphe","formatBlock","p"),command("Titre","formatBlock","h2"),command("Sous-titre","formatBlock","h3"),
   command("Gras","bold"),command("Italique","italic"),command("Liste à puces","insertUnorderedList"),command("Liste numérotée","insertOrderedList"));
  toolbar.append(btn("Lien",()=>{
   const href=prompt("Adresse HTTPS du lien");if(!href)return;
   const label=window.getSelection()?.toString()||prompt("Texte du lien");if(!label)return;
   run(async()=>{const html=renderNewsletter([{tag:"a",href,children:[label]}]).html;body.focus();document.execCommand("insertHTML",false,html);updatePreview()});
  }),btn("Image",()=>{
   const src=prompt("URL HTTPS de l’image publiée sur AUPOSITEUR");if(!src)return;
   const alt=prompt("Description de l’image");if(!alt)return;
   run(async()=>{const html=renderNewsletter([{tag:"img",src,alt}]).html;body.focus();document.execCommand("insertHTML",false,html);updatePreview()});
  }));
  toolbar.addEventListener("mousedown",event=>{if(event.target.closest("button"))event.preventDefault()});
  const preview=el("div"),saveDraft=el("button","Enregistrer le brouillon");preview.className="newsletter-preview";preview.hidden=true;
  const updatePreview=()=>{
   const footer=el("p","Vous recevez ce message car vous êtes abonné aux nouveautés AUPOSITEUR. ");
   footer.append(el("u","Se désinscrire"));
   const rendered=el("div");
   try {rendered.innerHTML=renderNewsletter(newsletterDocument(body)).html||"<p>Saisis un message pour le prévisualiser.</p>";}
   catch(error){rendered.textContent=error.message;}
   preview.replaceChildren(el("strong",subject.value.trim()||"Sans objet"),rendered,el("hr"),footer);
  };
  const showPreview=mobile=>{preview.hidden=false;preview.toggleAttribute("data-mobile",mobile);updatePreview();};
  subject.addEventListener("input",updatePreview);body.addEventListener("input",updatePreview);
  const cancelEdit=btn("Annuler la modification",()=>{
    editingId="";selectedType="";selectedId="";form.reset();body.replaceChildren();preview.hidden=true;cancelEdit.hidden=true;
    saveDraft.textContent="Enregistrer le brouillon";subject.focus();
  });
  cancelEdit.hidden=true;
  form.append(l1,toolbar,body,btn("Aperçu ordinateur",()=>showPreview(false)),btn("Aperçu mobile",()=>showPreview(true)),preview,saveDraft,cancelEdit);
  form.addEventListener("submit",e=>{
   e.preventDefault();
   if(saveDraft.disabled)return;
   saveDraft.disabled=true;
   run(async()=>{
    try{
     await request("/api/admin/campaigns",{method:editingId?"PATCH":"POST",body:JSON.stringify({id:editingId,subject:subject.value,document:newsletterDocument(body),content_type:selectedType,content_id:selectedId})});
     await render();message("Brouillon enregistré.");
    }finally{saveDraft.disabled=false}
   });
  });section.append(form);view.append(section);
  const data=await request("/api/admin/campaigns");
  if(!section.isConnected)return;
  const history=el("section"),campaignLabels={draft:"Brouillon",queued:"En file d’envoi",sending:"En cours",sent:"Traitement terminé",failed:"Erreur d’envoi",cancelled:"Annulée"};
  history.append(el("h2","Historique des newsletters"));
  if(!data.campaigns.length)history.append(el("p","Aucune campagne."));
  view.append(history);
  for(const c of data.campaigns){const item=el("article");item.append(el("strong",c.subject),el("p",campaignLabels[c.status]||c.status),el("small","Créée : "+(c.created_at||"—")+" · Envoi : "+(c.sent_at||"—")));
   if(c.status!=="draft"&&Number.isInteger(c.recipients))item.append(el("p",c.recipients+" destinataire(s) · Acceptés par le prestataire : "+c.accepted+" · Échecs : "+c.failed+" · Exclus : "+c.skipped+" · En traitement ou à vérifier : "+c.sending));
   if(c.status==="draft")item.append(btn("Modifier le brouillon",()=>{
    editingId=c.id;subject.value=c.subject;body.textContent=c.body_text||"";
    if(c.body_html){
      const stored=new DOMParser().parseFromString(c.body_html,"text/html");
      try{body.innerHTML=renderNewsletter(newsletterDocument(stored.body)).html;}
      catch{message("Mise en forme ancienne indisponible. Le texte du brouillon est conservé.")}
    }selectedType=c.content_type||"";selectedId=c.content_id||"";
    publication.value=selectedType+"|"+selectedId;cancelEdit.hidden=false;saveDraft.textContent="Réenregistrer le brouillon";updatePreview();subject.focus();
   }));
   if(c.status==="draft")item.append(btn("Envoyer un e-mail de test",()=>{const email=prompt("Adresse e-mail pour le test :");if(!email)return;run(async()=>{await request("/api/admin/campaigns/test",{method:"POST",body:JSON.stringify({id:c.id,email})});message("E-mail de test envoyé.")})}));
   if(c.status==="draft"){
    const picker=el("details"),summary=el("summary","Choisir les destinataires"),filters=el("form"),search=el("input"),list=el("div"),selectionStatus=el("p");
    const label=el("label","Rechercher un abonné admissible");search.type="search";label.append(search);
    const chosen=new Set();let page=1,revision=0;
    const refresh=async()=>{
     const current=++revision;
     const data=await request("/api/admin/subscribers?"+new URLSearchParams({eligible:"1",q:search.value,page:String(page)}));
     if(current!==revision||!picker.isConnected)return;
     const previous=btn("Précédents",()=>{page--;run(refresh)}),next=btn("Suivants",()=>{page++;run(refresh)});
     previous.disabled=page===1;next.disabled=page*data.pageSize>=data.total;
     list.replaceChildren(el("p",data.total+" abonné(s) admissible(s)"),previous,next);
     for(const subscriber of data.subscribers){
      const checkbox=el("input"),row=el("label");checkbox.type="checkbox";checkbox.checked=chosen.has(subscriber.id);
      checkbox.addEventListener("change",()=>{
       if(checkbox.checked&&chosen.size>=500){checkbox.checked=false;message("La sélection est limitée à 500 destinataires.");return}
       if(checkbox.checked)chosen.add(subscriber.id);else chosen.delete(subscriber.id);
       selectionStatus.textContent=chosen.size+" sélectionné(s)";
      });
      row.append(checkbox,document.createTextNode(subscriber.email));list.append(row);
     }
    };
    const submit=el("button","Rechercher");filters.append(label,submit);
    filters.addEventListener("submit",event=>{event.preventDefault();page=1;run(refresh)});
    picker.addEventListener("toggle",()=>{if(picker.open)run(refresh)});
    const queue=btn("Mettre la sélection en file d’envoi",()=>{
     if(queue.disabled)return;
     if(!chosen.size){message("Sélectionne au moins un abonné admissible.");return}
     if(!confirm("Mettre en file d’envoi les "+chosen.size+" abonnés sélectionnés encore admissibles ?"))return;
     queue.disabled=true;
     run(async()=>{try{
      const result=await request("/api/admin/campaigns/queue",{method:"POST",body:JSON.stringify({id:c.id,subscriber_ids:[...chosen]})});
      await render();message(result.recipients+" destinataire(s) mis en file d’envoi.");
     }finally{queue.disabled=false}});
    });
    selectionStatus.textContent="0 sélectionné";selectionStatus.setAttribute("role","status");
    picker.append(summary,filters,list,selectionStatus,queue);item.append(picker);
   }
   history.append(item)}
 }
}
document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.tab;document.querySelectorAll("[data-tab]").forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-pressed",String(x===b))});run(render)}));
if(tab==="campaigns")document.querySelector('[data-tab="campaigns"]').click();
else run(render);
})();