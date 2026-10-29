(()=>{
"use strict";
const el=id=>document.getElementById(id);
const invisible=new Set([0xad,0x34f,0x61c,0x180e,0x200b,0x200c,0x200d,0x200e,0x200f,0x2060,0x2061,0x2062,0x2063,0x2064,0xfeff]);
const spaces=new Set([0xa0,0x1680,0x2000,0x2001,0x2002,0x2003,0x2004,0x2005,0x2006,0x2007,0x2008,0x2009,0x200a,0x202f,0x205f,0x3000]);
const entities=/&(?:#x[0-9a-f]+|#[0-9]+|nbsp|zwnj|zwj|lrm|rlm);/gi;
let report=null;
function targeted(cp){return invisible.has(cp)||spaces.has(cp)||(cp>=0x202a&&cp<=0x202e)||(cp>=0x2066&&cp<=0x2069)||(cp>=0xe0000&&cp<=0xe007f)||(cp<32&&![9,10,13].includes(cp))||cp===127;}
function inspect(text){
 const findings=[];let pos=0,count=0;
 for(const ch of text){const cp=ch.codePointAt(0);if(targeted(cp)){count++;if(findings.length<200)findings.push({position:pos+1,codepoint:"U+"+cp.toString(16).toUpperCase().padStart(4,"0"),type:spaces.has(cp)?"espace spécial":"contrôle / format"});}pos+=ch.length;}
 const matches=[...text.matchAll(entities)].map(m=>({position:m.index+1,value:m[0]}));
 const words=text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[];
 return {version:"1.0",timestamp:new Date().toISOString(),metrics:{words:words.length,characters:[...text].length,paragraphs:text.trim()?text.trim().split(/\n\s*\n/).length:0,unicodeFindings:count,htmlEntities:matches.length},findings,entities:matches.slice(0,200),truncated:{unicode:count>200,html:matches.length>200},aiAttribution:{status:"indeterminate",percentage:null},watermarks:{textGrain:"unavailable",KGW:"unavailable",SynthID:"unavailable",Gumbel:"unavailable"}};
}
function clean(text){return [...text].filter(ch=>!targeted(ch.codePointAt(0))).join("").replace(entities,entity=>{if(/^&nbsp;$/i.test(entity))return " ";const m=entity.match(/^&#(x[0-9a-f]+|[0-9]+);$/i);if(!m)return entity;const cp=m[1].toLowerCase().startsWith("x")?parseInt(m[1].slice(1),16):parseInt(m[1],10);return cp===32?" ":entity;});}
function render(r){const box=el("results");box.replaceChildren();const h=document.createElement("h2");h.textContent="Rapport d'analyse";box.append(h);const table=document.createElement("table");for(const [k,v] of Object.entries(r.metrics)){const tr=document.createElement("tr");for(const x of [k,String(v)]){const td=document.createElement("td");td.textContent=x;tr.append(td);}table.append(tr);}box.append(table);const p=document.createElement("p");p.textContent="Origine IA : indéterminable. textGrain : non vérifiable sans détecteur compatible.";box.append(p);for(const [name,items] of [["Caractères ciblés",r.findings],["Entités HTML",r.entities]]){const h3=document.createElement("h3");h3.textContent=name+" ("+items.length+" affichés au maximum)";box.append(h3);const pre=document.createElement("pre");pre.textContent=items.length?items.map(x=>JSON.stringify(x)).join("\n"):"Aucune anomalie ciblée";box.append(pre);}}
el("analyze").onclick=()=>{report=inspect(el("source").value);render(report);el("status").textContent="Analyse locale terminée."};
el("clean").onclick=()=>{const before=el("source").value;el("source").value=clean(before);report=inspect(el("source").value);render(report);el("status").textContent="Nettoyage technique effectué. Conserve séparément l'original : certains caractères peuvent être significatifs."};
el("export").onclick=()=>{if(!report)report=inspect(el("source").value);const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="aupositeur-provenance.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
el("test").onclick=()=>{const tests=[["accent français",inspect("Élève à l'école").metrics.unicodeFindings===0],["espace invisible",inspect("a\u200bb").metrics.unicodeFindings===1],["espace insécable",inspect("a\u00a0b").metrics.unicodeFindings===1],["entité",inspect("a&#x20;b").metrics.htmlEntities===1],["nettoyage",clean("a\u200bb")==="ab"]];el("status").textContent=tests.map(([n,ok])=>(ok?"OK":"ÉCHEC")+" "+n).join(" · ");};
})();