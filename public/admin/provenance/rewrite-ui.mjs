const source=document.getElementById("source"),host=document.getElementById("rewrite-workbench");
if(host&&source){
const section=document.createElement("section");
const heading=document.createElement("h2");heading.textContent="Atelier de réécriture";
const intro=document.createElement("p");intro.textContent="Travaille une nouvelle version, compare-la à l’original et copie le résultat. Aucun modèle de réécriture automatique n’est encore connecté. Aucune garantie de classement par les détecteurs IA.";
const actions=document.createElement("div");actions.className="actions";
const load=document.createElement("button");load.textContent="Créer une version de travail";load.type="button";
const compare=document.createElement("button");compare.textContent="Comparer les versions";compare.type="button";
const copy=document.createElement("button");copy.textContent="Copier la version finale";copy.type="button";
const restore=document.createElement("button");restore.textContent="Repartir de l’original";restore.type="button";
const label=document.createElement("label");label.textContent="Version de travail (modifiable)";label.htmlFor="rewrite-draft";
const draft=document.createElement("textarea");draft.id="rewrite-draft";draft.spellcheck=true;draft.placeholder="Clique sur « Créer une version de travail », puis révise ton texte ici.";
const status=document.createElement("p");status.setAttribute("role","status");
const result=document.createElement("div");result.setAttribute("aria-live","polite");
let baseline=null;
const para=s=>s.trim()?s.trim().split(/\n\s*\n/u).map(x=>x.trim()):[];
load.onclick=()=>{baseline=source.value;draft.value=baseline;result.replaceChildren();status.textContent="Original enregistré dans cet onglet. Tu peux modifier la version de travail sans toucher à l’original.";};
restore.onclick=()=>{if(baseline===null){status.textContent="Crée d’abord une version de travail.";return;}draft.value=baseline;result.replaceChildren();status.textContent="Version de travail restaurée.";};
compare.onclick=()=>{if(baseline===null){status.textContent="Crée d’abord une version de travail.";return;}result.replaceChildren();const before=para(baseline),after=para(draft.value),count=Math.max(before.length,after.length);let changed=0;for(let i=0;i<count;i++){if((before[i]||"")===(after[i]||""))continue;changed++;const card=document.createElement("details");card.open=changed<=2;const summary=document.createElement("summary");summary.textContent="Paragraphe "+(i+1)+" — modifié";card.append(summary);for(const [name,value] of [["Avant",before[i]||"(absent)"],["Après",after[i]||"(supprimé)"]]){const h=document.createElement("strong");h.textContent=name;const p=document.createElement("p");p.textContent=value;card.append(h,p);}result.append(card);}const info=document.createElement("p");info.textContent=changed+" paragraphe(s) différent(s) sur "+count+". La comparaison est positionnelle : une insertion peut décaler les paragraphes suivants.";result.prepend(info);status.textContent="Comparaison terminée. Les modifications restent dans ton navigateur.";};
copy.onclick=async()=>{if(baseline===null){status.textContent="Crée d’abord une version de travail.";return;}try{await navigator.clipboard.writeText(draft.value);status.textContent="Version de travail copiée."; }catch{draft.focus();draft.select();status.textContent="Copie automatique indisponible : texte sélectionné, utilise Ctrl+C."; }};
actions.append(load,compare,copy,restore);section.append(heading,intro,actions,label,draft,status,result);host.append(section);
}