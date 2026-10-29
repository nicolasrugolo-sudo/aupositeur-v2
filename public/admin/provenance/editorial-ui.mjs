import {editorialDiagnostics} from "./editorial.mjs";
const host=document.getElementById("editorial-workbench");
if(host){
 const section=document.createElement("section");
 const heading=document.createElement("h2");heading.textContent="Atelier éditorial — qualité du texte";
 const intro=document.createElement("p");intro.textContent="Analyse descriptive du rythme, des répétitions et de la structure. Aucun transfert du texte, aucune promesse d’indétectabilité.";
 const button=document.createElement("button");button.type="button";button.textContent="Examiner le style du texte saisi";
 const output=document.createElement("div");output.setAttribute("aria-live","polite");
 button.addEventListener("click",()=>{const text=document.getElementById("source")?.value||"";const d=editorialDiagnostics(text);output.replaceChildren();const summary=document.createElement("p");summary.textContent=d.wordCount+" mots · "+d.sentenceCount+" phrases · "+d.paragraphCount+" paragraphes · "+d.averageSentenceWords+" mots/phrase en moyenne · écart-type "+d.sentenceLengthDeviation;output.append(summary);
 const list=document.createElement("ul");for(const tip of d.suggestions){const li=document.createElement("li");li.textContent=tip;list.append(li);}output.append(list);
 if(d.repeatedTrigrams.length){const title=document.createElement("h3");title.textContent="Expressions répétées";output.append(title);const ul=document.createElement("ul");for(const item of d.repeatedTrigrams){const li=document.createElement("li");li.textContent="« "+item.phrase+" » — "+item.count+" occurrences";ul.append(li);}output.append(ul);}
 const caution=document.createElement("p");caution.textContent=d.disclaimer;output.append(caution);
 });
 section.append(heading,intro,button,output);host.append(section);
}