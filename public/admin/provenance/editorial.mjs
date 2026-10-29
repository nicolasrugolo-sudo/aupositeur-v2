/* AUPOSITEUR — Editorial diagnostics, not AI attribution or detector evasion. */
export function editorialDiagnostics(text){
 const input=String(text||"");
 const sentences=(input.match(/[^.!?…\n]+(?:[.!?…]+|$)/gu)||[]).map(s=>s.trim()).filter(Boolean);
 const tokenize=s=>s.toLocaleLowerCase("fr").match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[];
 const words=tokenize(input);
 const lengths=sentences.map(s=>tokenize(s).length);
 const mean=lengths.length?lengths.reduce((a,b)=>a+b,0)/lengths.length:0;
 const deviation=lengths.length?Math.sqrt(lengths.reduce((a,b)=>a+(b-mean)**2,0)/lengths.length):0;
 const trigram=new Map();
 for(let i=0;i+2<words.length;i++){const key=words.slice(i,i+3).join(" ");trigram.set(key,(trigram.get(key)||0)+1);}
 const repeated=[...trigram].filter(([,count])=>count>=2).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"fr")).slice(0,12).map(([phrase,count])=>({phrase,count}));
 const paragraphs=input.trim()?input.trim().split(/\n\s*\n/).filter(Boolean):[];
 const tips=[];
 if(words.length<50)tips.push("Échantillon court : les statistiques de style sont peu informatives.");
 if(sentences.length>=5&&deviation<3)tips.push("Longueurs de phrases peu variées : vérifier si le rythme convient au propos.");
 if(repeated.length)tips.push("Quelques groupes de trois mots reviennent plusieurs fois : examiner s'il s'agit de répétitions utiles.");
 if(paragraphs.length===1&&words.length>180)tips.push("Texte long en un seul paragraphe : envisager des coupures au service de l'argumentation.");
 tips.push("Vérifier les faits, préciser les exemples, préserver la voix de l'auteur et citer les sources pertinentes.");
 return {version:"1.0.0",wordCount:words.length,sentenceCount:sentences.length,paragraphCount:paragraphs.length,averageSentenceWords:Number(mean.toFixed(2)),sentenceLengthDeviation:Number(deviation.toFixed(2)),repeatedTrigrams:repeated,suggestions:tips,disclaimer:"Indicateurs éditoriaux descriptifs. Ils ne mesurent ni la probabilité IA ni l'efficacité d'une dissimulation."};
}
