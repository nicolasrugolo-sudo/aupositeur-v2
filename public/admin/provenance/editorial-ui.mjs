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
 const paragraphs=text.trim()?text.trim().split(/\n\s*\n/u).filter(Boolean):[];
if(paragraphs.length){const heading=document.createElement("h3");heading.textContent="Lecture paragraphe par paragraphe";output.append(heading);const container=document.createElement("div");container.className="paragraph-review";paragraphs.forEach((paragraph,index)=>{const details=document.createElement("details");const summary=document.createElement("summary");const metrics=editorialDiagnostics(paragraph);summary.textContent="Paragraphe "+(index+1)+" — "+metrics.wordCount+" mots, "+metrics.sentenceCount+" phrase(s)";details.append(summary);const quote=document.createElement("blockquote");quote.textContent=paragraph;details.append(quote);const feedback=document.createElement("p");const remarks=[];
if(metrics.sentenceCount===1&&metrics.wordCount>=35)remarks.push("Phrase longue : vérifier si une séparation améliorerait la lecture sans rompre l’argument.");
if(metrics.sentenceCount>=2&&metrics.averageSentenceWords>=28)remarks.push("Phrases plutôt longues : examiner les articulations logiques.");
if(metrics.sentenceCount>=3&&metrics.sentenceLengthDeviation>=12)remarks.push("Rythme contrasté entre phrases courtes et longues.");
if(/\?\s*$/u.test(paragraph.trim()))remarks.push("Question finale : vérifier qu’elle fait progresser le raisonnement.");
if(metrics.repeatedTrigrams.length)remarks.push("Répétition interne : "+metrics.repeatedTrigrams.slice(0,2).map(x=>"« "+x.phrase+" »").join(", ")+".");
feedback.textContent=remarks.join(" ")||"Aucun point de vigilance automatique particulier dans ce paragraphe.";details.append(feedback);container.append(details);});output.append(container);}
const caution=document.createElement("p");caution.textContent=d.disclaimer;output.append(caution);
 });
 section.append(heading,intro,button,output);host.append(section);
}