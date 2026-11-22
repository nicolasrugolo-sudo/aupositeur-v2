(()=>{"use strict";
const view=document.getElementById("view"),notice=document.getElementById("notice");
let tab="comments";
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);return x;};
const btn=(label,action)=>{const b=el("button",label);b.addEventListener("click",action);return b;};
const request=async(path,options={})=>{
 // JSON content-type is only needed for requests with a body.
 const headers={...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})};
 let r;
 try{r=await window.aupositeurCommunityRequest(path,{...options,headers},window.parent===window);}
 catch(error){throw Error("La passerelle Communauté est inaccessible. Le navigateur n'a pas pu joindre l'API du Studio. Vérifiez la connexion et réessayez.");}
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
  const section=el("section");view.append(section);window.aupositeurModeration(section,request);
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