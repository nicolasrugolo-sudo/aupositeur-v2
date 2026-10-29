(()=>{
"use strict";
const RULES_VERSION="2.0.0";
const el=id=>document.getElementById(id);
const format=new Set([0xad,0x34f,0x61c,0x180e,0x200b,0x2060,0x2061,0x2062,0x2063,0x2064,0xfeff]);
const spaces=new Set([0xa0,0x1680,0x2000,0x2001,0x2002,0x2003,0x2004,0x2005,0x2006,0x2007,0x2008,0x2009,0x200a,0x202f,0x205f,0x3000]);
const entities=/&(?:#x[0-9a-f]+|#[0-9]+|nbsp|zwnj|zwj|lrm|rlm);/gi;
let original=null,report=null;
const hex=cp=>"U+"+cp.toString(16).toUpperCase().padStart(4,"0");
function category(cp){
 if(spaces.has(cp))return "typographic_space";
 if(cp===0x200c||cp===0x200d||cp===0x200e||cp===0x200f)return "contextual_format";
 if(cp>=0xe0000&&cp<=0xe007f)return "unicode_tag";
 if(cp>=0x202a&&cp<=0x202e||cp>=0x2066&&cp<=0x2069)return "bidi_control";
 if(format.has(cp))return "invisible_format";
 if(cp<32&&![9,10,13].includes(cp)||cp===127)return "control";
 return null;
}
function inspect(text){
 const findings=[];let count=0,cpIndex=0,utf16=0;
 for(const ch of text){const cp=ch.codePointAt(0),kind=category(cp);if(kind){count++;if(findings.length<250)findings.push({codePointPosition:cpIndex+1,utf16Offset:utf16,codepoint:hex(cp),kind});}cpIndex++;utf16+=ch.length;}
 const foundEntities=[...text.matchAll(entities)];
 const words=text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[];
 return {counts:{words:words.length,codePoints:cpIndex,utf16Units:text.length,paragraphs:text.trim()?text.trim().split(/\n\s*\n/).length:0,unicodeFindings:count,htmlEntities:foundEntities.length},findings,entities:foundEntities.slice(0,250).map(m=>({utf16Offset:m.index,value:m[0]})),truncated:count>250||foundEntities.length>250};
}
function decodeEntity(entity){
 const named={nbsp:" ",zwnj:"\u200c",zwj:"\u200d",lrm:"\u200e",rlm:"\u200f"};
 const name=entity.slice(1,-1).toLowerCase();
 if(Object.hasOwn(named,name))return named[name];
 if(!name.startsWith("#"))return entity;
 const cp=name.startsWith("#x")?parseInt(name.slice(2),16):parseInt(name.slice(1),10);
 return Number.isInteger(cp)&&cp>=0&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff)?String.fromCodePoint(cp):entity;
}
function normalize(text){
 const changes=[];
 const expanded=text.replace(entities,(match,offset)=>{
  const replacement=decodeEntity(match);
  if(replacement!==match)changes.push({kind:"html_entity",utf16Offset:offset,from:match,to:replacement});
  return replacement;
 });
 let result="",index=0;
 for(const ch of expanded){const cp=ch.codePointAt(0),kind=category(cp);let next=ch;
  if(kind==="typographic_space")next=" ";
  else if(kind==="invisible_format"||kind==="control")next="";
  // Contextual format, bidi controls and Unicode tag sequences are preserved by default.
  if(next!==ch)changes.push({kind:kind||"other",normalizedUtf16Offset:index,from:hex(cp),to:next});
  result+=next;index+=ch.length;
 }
 return {text:result,changes};
}
async function digest(text){
 if(!globalThis.crypto?.subtle)return null;
 const bytes=new TextEncoder().encode(text),hash=await crypto.subtle.digest("SHA-256",bytes);
 return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function build(originalText,currentText,changes=[]){
 const [originalSha256,currentSha256]=await Promise.all([digest(originalText),digest(currentText)]);
 return {schemaVersion:"2.0",rulesVersion:RULES_VERSION,createdAt:new Date().toISOString(),source:{sha256:originalSha256,inspection:inspect(originalText)},current:{sha256:currentSha256,inspection:inspect(currentText)},changes,watermarks:{textGrain:{status:"unavailable"},KGW:{status:"unavailable"},SynthID:{status:"unavailable"},Gumbel:{status:"unavailable"}},aiAuthorship:{status:"indeterminate",percentage:null},limitations:["Unicode formatting is not proof of AI authorship.","No statistical watermark is detected or removed.","A negative Unicode inspection does not exclude AI generation."],privacy:"Text remains in this browser; report contains only metrics and findings, not full text."};
}
function render(r){const root=el("results");root.replaceChildren();const h=document.createElement("h2");h.textContent="Rapport technique";root.append(h);
 for(const [title,part] of [["Texte original",r.source],["Texte actuel",r.current]]){const head=document.createElement("h3");head.textContent=title;root.append(head);const hash=document.createElement("p");hash.textContent="SHA-256 : "+(part.sha256||"indisponible");root.append(hash);const table=document.createElement("table");for(const [k,v] of Object.entries(part.inspection.counts)){const tr=document.createElement("tr");for(const value of [k,String(v)]){const td=document.createElement("td");td.textContent=value;tr.append(td);}table.append(tr);}root.append(table);}
 const details=document.createElement("details"),summary=document.createElement("summary"),pre=document.createElement("pre");summary.textContent="Voir les anomalies et transformations";pre.textContent=JSON.stringify({original:r.source.inspection.findings,entities:r.source.inspection.entities,changes:r.changes},null,2);details.append(summary,pre);root.append(details);
 const note=document.createElement("p");note.textContent="Aucun indice Unicode ne prouve une origine IA. Ce module ne détecte ni ne supprime les filigranes statistiques, notamment textGrain.";root.append(note);
}
async function run(){const current=el("source").value;if(original===null)original=current;report=await build(original,current,report?.changes||[]);render(report);el("status").textContent="Analyse locale terminée.";}
el("analyze").onclick=()=>{run().catch(e=>el("status").textContent="Erreur : "+e.message);};
el("clean").onclick=async()=>{try{if(original===null)original=el("source").value;const n=normalize(el("source").value);el("source").value=n.text;report=await build(original,n.text,[...(report?.changes||[]),...n.changes]);render(report);el("status").textContent="Normalisation réversible via Restaurer. Espaces typographiques convertis en espaces ordinaires ; ZWJ/ZWNJ et séquences contextuelles préservés.";}catch(e){el("status").textContent=e.message;}};
const restore=document.createElement("button");restore.type="button";restore.textContent="Restaurer l’original";restore.id="restore";el("clean").after(restore);
restore.onclick=async()=>{if(original===null)return;el("source").value=original;report=await build(original,original,report?.changes||[]);render(report);el("status").textContent="Original restauré."};
el("source").addEventListener("input",()=>{if(original!==null&&el("source").value!==original){el("status").textContent="Texte modifié : une nouvelle analyse sera nécessaire pour actualiser le rapport.";}});
el("export").onclick=async()=>{try{const current=el("source").value;if(original===null)original=current;report=await build(original,current,report?.changes||[]);const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="aupositeur-provenance.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){el("status").textContent=e.message;}};
el("test").onclick=()=>{const cases=[
 ["français préservé",normalize("dit\u00a0: « bonjour\u00a0! » M.\u00a0Dupont, 10\u202f000 €").text==="dit : « bonjour ! » M. Dupont, 10 000 €"],
 ["entité invisible",normalize("a&#8203;b").text==="ab"],
 ["entité hexadécimale",normalize("a&#x200B;b").text==="ab"],
 ["entité ZWNJ préservée",normalize("a&zwnj;b").text==="a\u200cb"],
 ["emoji ZWJ préservé",normalize("👩‍💻").text==="👩‍💻"],
 ["persan préservé",normalize("می\u200cروم").text==="می\u200cروم"],
 ["accents ordinaires",inspect("Votre élève était là").counts.unicodeFindings===0],
 ["positions codepoints",inspect("😀a\u200bb").findings[0].codePointPosition===3],
 ["drapeau à balises préservé",normalize("🏴\u{E0067}\u{E0062}\u{E007F}").text==="🏴\u{E0067}\u{E0062}\u{E007F}"]
 ];el("status").textContent=cases.map(([name,ok])=>(ok?"OK":"ÉCHEC")+" "+name).join(" · ");};
})();