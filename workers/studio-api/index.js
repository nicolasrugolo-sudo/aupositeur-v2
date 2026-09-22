const allowedOrigin = (origin) => {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && (
      u.hostname === "aupositeur.be" ||
      u.hostname === "www.aupositeur.be" ||
      u.hostname === "aupositeur-site.pages.dev" ||
      u.hostname.endsWith(".aupositeur-site.pages.dev")
    );
  } catch { return false; }
};
const cors=(origin)=>allowedOrigin(origin)?{"access-control-allow-origin":origin,"access-control-allow-credentials":"true","access-control-allow-methods":"GET,POST,PUT,DELETE,OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"86400","vary":"Origin"}:{};
const json=(data,status=200,origin="")=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...cors(origin)}});
const slug=(s)=>String(s||"project").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"project";
const kind=(mime="")=>mime.startsWith("image/")?"IMAGE":mime.startsWith("audio/")?"AUDIO":mime.startsWith("video/")?"VIDEO":"FILE";
const arrayBufferToBase64=(buffer)=>{const bytes=new Uint8Array(buffer);let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)};
async function assetDataUrl(env,assetId){
  const row=await env.STUDIO_DB.prepare("SELECT r2_key,mime FROM assets WHERE id=?").bind(assetId).first();if(!row)return null;
  const obj=await env.STUDIO_ASSETS.get(row.r2_key);if(!obj)return null;const buf=await obj.arrayBuffer();
  if(buf.byteLength>12*1024*1024)throw new Error("reference asset too large");
  return `data:${row.mime||"application/octet-stream"};base64,${arrayBufferToBase64(buf)}`;
}
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function agnesImageRequest(env,payload,{maxAttempts=3}={}){
  let last=null;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    const response=await fetch("https://apihub.agnes-ai.com/v1/images/generations",{method:"POST",headers:{Authorization:`Bearer ${env.AGNES_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const raw=await response.text();let data={};try{data=JSON.parse(raw)}catch{}
    last={response,raw,data,attempt};
    if(response.status!==429)return last;
    if(attempt<maxAttempts){
      const header=Number(response.headers.get("Retry-After")||0);
      const waitMs=header>0?Math.min(header*1000,45000):attempt*12000;
      await sleep(waitMs);
    }
  }
  return last;
}
const user=(req)=>req.headers.get("Cf-Access-Authenticated-User-Email")||"";
const requireAccess=(req,env,origin)=>{
  if(env.ALLOW_UNPROTECTED_PREVIEW==="true") return null;
  if(!user(req)) return json({error:"Studio Access required"},401,origin);
  return null;
};
async function log(env,projectId,kind,message){await env.STUDIO_DB.prepare("INSERT INTO activity(project_id,kind,message,created_at) VALUES(?,?,?,?)").bind(projectId||null,kind,message,new Date().toISOString()).run()}
const AI_DAILY_BUDGET=9000;
const aiDay=()=>new Date().toISOString().slice(0,10);
async function ensureAiBudget(env){await env.STUDIO_DB.prepare("CREATE TABLE IF NOT EXISTS ai_daily_budget(day TEXT PRIMARY KEY, neurons_reserved INTEGER NOT NULL DEFAULT 0, director_calls INTEGER NOT NULL DEFAULT 0, image_calls INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)").run()}
async function aiBudget(env){await ensureAiBudget(env);const day=aiDay(),row=await env.STUDIO_DB.prepare("SELECT * FROM ai_daily_budget WHERE day=?").bind(day).first();return {day,limit:AI_DAILY_BUDGET,reserved:Number(row?.neurons_reserved||0),remaining:Math.max(0,AI_DAILY_BUDGET-Number(row?.neurons_reserved||0)),director_calls:Number(row?.director_calls||0),image_calls:Number(row?.image_calls||0)}}
async function reserveAi(env,neurons,kind){
  await ensureAiBudget(env);const day=aiDay(),now=new Date().toISOString(),n=Math.max(1,Math.ceil(Number(neurons)||0));
  await env.STUDIO_DB.prepare("INSERT OR IGNORE INTO ai_daily_budget(day,neurons_reserved,director_calls,image_calls,updated_at) VALUES(?,0,0,0,?)").bind(day,now).run();
  const col=kind==="image"?"image_calls":"director_calls";
  const q=`UPDATE ai_daily_budget SET neurons_reserved=neurons_reserved+?, ${col}=${col}+1, updated_at=? WHERE day=? AND neurons_reserved+?<=?`;
  const res=await env.STUDIO_DB.prepare(q).bind(n,now,day,n,AI_DAILY_BUDGET).run();
  return {ok:Boolean(res.meta?.changes),...(await aiBudget(env)),reserved_now:n};
}

async function processDueAgnesImageJob(env){return {ok:true,processed:false,disabled:true,reason:"Cloudflare Workers AI handles images; Agnes image retry disabled"};}

export default {async fetch(req,env){
  const url=new URL(req.url), origin=req.headers.get("Origin")||"";
  if(req.method==="OPTIONS") return allowedOrigin(origin)?new Response(null,{status:204,headers:cors(origin)}):new Response(null,{status:403});
  if(url.pathname==="/health") return json({service:"aupositeur-studio-api",status:"ok",d1:Boolean(env.STUDIO_DB),r2:Boolean(env.STUDIO_ASSETS),authenticated:Boolean(user(req))},200,origin);
  const denied=requireAccess(req,env,origin); if(denied) return denied;
  if(!env.STUDIO_DB||!env.STUDIO_ASSETS) return json({error:"D1/R2 bindings missing"},503,origin);

  if(req.method==="GET"&&url.pathname==="/api/projects"){
    const {results}=await env.STUDIO_DB.prepare("SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC").all(); return json({ok:true,projects:results},200,origin);
  }
  if(req.method==="POST"&&url.pathname==="/api/projects"){
    const b=await req.json(); if(!String(b.title||"").trim()) return json({error:"title required"},400,origin);
    const now=new Date().toISOString(), id=slug(b.title)+"-"+crypto.randomUUID().slice(0,8);
    await env.STUDIO_DB.prepare("INSERT INTO projects(id,title,type,status,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(id,String(b.title).trim(),b.type||"Projet","brouillon",now,now).run();
    await log(env,id,"PROJECT","Projet créé"); return json({ok:true,project:{id,title:String(b.title).trim(),type:b.type||"Projet",status:"brouillon",created_at:now,updated_at:now}},201,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/projects/trash"){
    const {results}=await env.STUDIO_DB.prepare("SELECT * FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all();
    return json({ok:true,projects:results},200,origin);
  }
  const projectRestore=url.pathname.match(/^\/api\/projects\/([^/]+)\/restore$/);
  if(projectRestore&&req.method==="POST"){
    const project=await env.STUDIO_DB.prepare("SELECT id,title FROM projects WHERE id=? AND deleted_at IS NOT NULL").bind(projectRestore[1]).first();
    if(!project)return json({error:"trashed project not found"},404,origin);
    const now=new Date().toISOString();
    await env.STUDIO_DB.prepare("UPDATE projects SET deleted_at=NULL,updated_at=? WHERE id=?").bind(now,project.id).run();
    await log(env,project.id,"PROJECT",`Projet restauré : ${project.title}`);
    return json({ok:true,restored:{id:project.id,title:project.title}},200,origin);
  }
  const projectPurge=url.pathname.match(/^\/api\/projects\/([^/]+)\/purge$/);
  if(projectPurge&&req.method==="DELETE"){
    const project=await env.STUDIO_DB.prepare("SELECT id,title FROM projects WHERE id=? AND deleted_at IS NOT NULL").bind(projectPurge[1]).first();
    if(!project)return json({error:"trashed project not found"},404,origin);
    const {results:assets}=await env.STUDIO_DB.prepare("SELECT r2_key FROM assets WHERE project_id=?").bind(project.id).all();
    for(const asset of assets||[]) await env.STUDIO_ASSETS.delete(asset.r2_key);
    await env.STUDIO_DB.prepare("DELETE FROM assets WHERE project_id=?").bind(project.id).run();
    await env.STUDIO_DB.prepare("DELETE FROM documents WHERE project_id=?").bind(project.id).run();
    await env.STUDIO_DB.prepare("DELETE FROM activity WHERE project_id=?").bind(project.id).run();
    await env.STUDIO_DB.prepare("DELETE FROM projects WHERE id=?").bind(project.id).run();
    await log(env,null,"PROJECT",`Projet supprimé définitivement : ${project.title}`);
    return json({ok:true,purged:{id:project.id,title:project.title,assets:(assets||[]).length}},200,origin);
  }
  const projectDelete=url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if(projectDelete&&req.method==="DELETE"){
    const project=await env.STUDIO_DB.prepare("SELECT id,title FROM projects WHERE id=? AND deleted_at IS NULL").bind(projectDelete[1]).first();
    if(!project)return json({error:"project not found"},404,origin);
    const now=new Date().toISOString();
    await env.STUDIO_DB.prepare("UPDATE projects SET deleted_at=?,updated_at=? WHERE id=?").bind(now,now,project.id).run();
    await log(env,project.id,"PROJECT",`Projet placé dans la corbeille : ${project.title}`);
    return json({ok:true,trashed:{id:project.id,title:project.title}},200,origin);
  }
  const doc=url.pathname.match(/^\/api\/projects\/([^/]+)\/document$/);
  if(doc&&req.method==="GET"){
    const row=await env.STUDIO_DB.prepare("SELECT content,updated_at FROM documents WHERE project_id=?").bind(doc[1]).first(); return json({ok:true,document:row||{content:"",updated_at:null}},200,origin);
  }
  if(doc&&req.method==="PUT"){
    const b=await req.json(), now=new Date().toISOString();
    await env.STUDIO_DB.prepare("INSERT INTO documents(project_id,content,updated_at) VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at").bind(doc[1],String(b.content||""),now).run();
    await env.STUDIO_DB.prepare("UPDATE projects SET updated_at=? WHERE id=?").bind(now,doc[1]).run(); await log(env,doc[1],"TEXT","Texte sauvegardé"); return json({ok:true,updated_at:now},200,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/assets"){
    const project=url.searchParams.get("project"); const q=project?"SELECT * FROM assets WHERE project_id=? ORDER BY created_at DESC":"SELECT * FROM assets ORDER BY created_at DESC";
    const st=env.STUDIO_DB.prepare(q); const {results}=project?await st.bind(project).all():await st.all(); return json({ok:true,assets:results},200,origin);
  }
  if(req.method==="POST"&&url.pathname==="/api/assets"){
    const form=await req.formData(), file=form.get("file"); if(!(file instanceof File)) return json({error:"file required"},400,origin);
    if(file.size>250*1024*1024) return json({error:"file too large (250 MB max)"},413,origin);
    const projectId=String(form.get("project_id")||"")||null, id=crypto.randomUUID(), key=`studio/${projectId||"unassigned"}/${id}-${slug(file.name)}`;
    await env.STUDIO_ASSETS.put(key,file.stream(),{httpMetadata:{contentType:file.type||"application/octet-stream"},customMetadata:{originalName:file.name,projectId:projectId||""}});
    const now=new Date().toISOString(); await env.STUDIO_DB.prepare("INSERT INTO assets(id,project_id,r2_key,name,mime,bytes,kind,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,projectId,key,file.name,file.type||null,file.size,kind(file.type),now).run();
    await log(env,projectId,"ASSET",`Asset ajouté : ${file.name}`); return json({ok:true,asset:{id,project_id:projectId,r2_key:key,name:file.name,mime:file.type,bytes:file.size,kind:kind(file.type),created_at:now}},201,origin);
  }
  const assetDelete=url.pathname.match(/^\/api\/assets\/([^/]+)$/);
  if(assetDelete&&req.method==="DELETE"){
    const row=await env.STUDIO_DB.prepare("SELECT id,project_id,r2_key,name FROM assets WHERE id=?").bind(assetDelete[1]).first();
    if(!row)return json({error:"asset not found"},404,origin);
    await env.STUDIO_ASSETS.delete(row.r2_key);
    await env.STUDIO_DB.prepare("DELETE FROM assets WHERE id=?").bind(row.id).run();
    await log(env,row.project_id,"ASSET",`Asset supprimé : ${row.name}`);
    return json({ok:true,deleted:{id:row.id,name:row.name}},200,origin);
  }
  const asset=url.pathname.match(/^\/api\/assets\/([^/]+)\/content$/);
  if(asset&&req.method==="GET"){
    const row=await env.STUDIO_DB.prepare("SELECT r2_key,mime,name FROM assets WHERE id=?").bind(asset[1]).first(); if(!row)return new Response("Not found",{status:404,headers:cors(origin)});
    const obj=await env.STUDIO_ASSETS.get(row.r2_key); if(!obj)return new Response("Not found",{status:404,headers:cors(origin)});
    const h=new Headers({"content-type":row.mime||"application/octet-stream","content-disposition":`inline; filename="${String(row.name).replace(/"/g,"")}"`,"cache-control":"private, max-age=60",...cors(origin)}); return new Response(obj.body,{headers:h});
  }
  if(req.method==="GET"&&url.pathname==="/api/video/config"){
    return json({ok:true,providers:{agnes:{configured:Boolean(env.AGNES_API_KEY),director_model:"agnes-3.0-flash",video_model:"agnes-video-2.5-flash",video_hq_model:"agnes-video-2.5",protocol:"2.5",seconds:5,size:"720P",aspect_ratios:["16:9","9:16","1:1","4:3","3:4","21:9"]}}},200,origin);
  }
  if(req.method==="POST"&&url.pathname==="/api/video/analyse"){
    if(!env.AI)return json({error:"Cloudflare Workers AI binding missing"},503,origin);
    const b=await req.json(),projectId=String(b.project_id||"");
    const project=await env.STUDIO_DB.prepare("SELECT id,title,type FROM projects WHERE id=? AND deleted_at IS NULL").bind(projectId).first();
    if(!project)return json({error:"active project not found"},404,origin);
    const doc=await env.STUDIO_DB.prepare("SELECT content FROM documents WHERE project_id=?").bind(projectId).first();
    const {results:assets}=await env.STUDIO_DB.prepare("SELECT id,name,mime,bytes,kind FROM assets WHERE project_id=? ORDER BY created_at ASC").bind(projectId).all();
    const inventory=(assets||[]).map(a=>({name:a.name,mime:a.mime,kind:a.kind,bytes:a.bytes}));
    const userIntent=String(b.intent||"").trim();
    const jobId=crypto.randomUUID(),jobNow=new Date().toISOString();
    try{await env.STUDIO_DB.prepare("INSERT INTO agnes_jobs(id,project_id,kind,target_id,payload,status,attempts,max_attempts,created_at,updated_at) VALUES(?,?,?,?,?,'running',0,4,?,?)").bind(jobId,projectId,"director",projectId,JSON.stringify({intent:userIntent||null}),jobNow,jobNow).run()}catch{}
    const audioAsset=(assets||[]).find(a=>String(a.mime||"").startsWith("audio/"));
    const durationSeconds=Number(b.duration_seconds||0)||null;
    const system=`Tu es le réalisateur et directeur artistique principal du Studio AUPOSITEUR. Tu conçois un véritable film musical, jamais une succession d'illustrations de paroles.

GRAMMAIRE AUPOSITEUR — impérative :
- Le réel d'abord. L'étrange ensuite. L'émotion sans la montrer de force.
- Monde contemporain crédible, lieux habités et imparfaits, objets ordinaires qui portent une tension.
- Personnages humains crédibles et imparfaits : jamais mannequin publicitaire, jamais pose de modèle.
- Cadrages légèrement décentrés, espace négatif, cadres dans le cadre, hors-champ utile.
- Lumière motivée, naturelle ou pratique, imparfaite. Texture tactile, grain discret, jamais plastique/HDR.
- L'émotion passe par une situation, un geste, une attente, un objet, une distance, une contradiction ou une absence; jamais par des figurants génériques "qui souffrent".
- Ne jamais illustrer littéralement chaque phrase des paroles.
- Éviter : clip musical générique, pluie automatique, larmes forcées, coucher de soleil silhouette, néons cyberpunk gratuits, fumée décorative, surjeu, dégâts matériels symboliques, texte généré, logos, esthétique parfum/publicité.
- La palette noir/ivoire/rouille appartient à l'identité graphique AUPOSITEUR mais ne doit pas être imposée artificiellement à chaque décor.
- Chaque plan doit avoir une action observable et une raison narrative. Varier échelles, axes, mouvement et respiration. La continuité spatiale, vestimentaire, lumineuse et émotionnelle est prioritaire.
- Les références visuelles définissent l'identité des personnages/lieux/objets; elles ne signifient pas qu'il faut animer la même image à chaque plan.
- Choisir pour chaque plan un mode vidéo recommandé: "text" pour liberté de mise en scène, "reference" pour continuité personnage/lieu, "keyframe" seulement lorsqu'un cadrage exact est réellement nécessaire.

DÉCOUPAGE :
Si duration_seconds est fourni, couvrir EXACTEMENT de 0.0 à duration_seconds sans trou ni chevauchement. Chaque plan dure 4 à 12 secondes. Le end d'un plan est le start du suivant. Le dernier end vaut exactement duration_seconds. Construire autant de plans que nécessaire; ne jamais limiter arbitrairement à 6 ou 12 plans.
Si la durée audio n'est pas disponible, produire un découpage provisoire de 18 à 24 plans et marquer timeline_status="provisional"; il sera recalé lorsque le master sera importé.
Le storyboard doit penser montage: plans d'installation, actions, inserts, respirations, variations de distance, transitions et motifs récurrents. Ne répète pas mécaniquement "visage / ville / visage / ville".

Réponds UNIQUEMENT en JSON valide sans markdown:
{"reading":{"core":"","themes":[],"emotional_arc":"","visual_motifs":[],"avoid":[]},"direction":{"concept":"","palette":"","camera":"","lighting":"","continuity_rules":[]},"timeline_status":"exact|provisional","total_duration_seconds":null,"visual_references":[{"role":"CHARACTER|LOCATION|STYLE|OBJECT","code":"CHARACTER_01","title":"","importance":"essential|normal|optional","brief":""}],"storyboard":[{"index":1,"start":0,"end":6,"duration":6,"source":"","purpose":"","action":"","visual":"","shot_size":"","camera":"","lighting":"","mode":"text|reference|keyframe","reference_codes":[],"keyframe_required":false,"continuity":"","transition":"","prompt_seed":""}],"missing_context":[]}.
Les prompts de plans doivent décrire une scène filmable et un mouvement crédible, pas des concepts abstraits.`;
    const userPrompt=JSON.stringify({title:project.title,type:project.type,author_intent:userIntent||null,duration_seconds:durationSeconds,audio_master_present:Boolean(audioAsset),lyrics_or_text:String(doc?.content||""),assets:inventory});
    const directorPayload={messages:[{role:"system",content:system},{role:"user",content:userPrompt}],temperature:0.45,max_tokens:6000};
    let data={},content="",analysis;
    try{
      const budget=await reserveAi(env,1500,"director");if(!budget.ok)return json({error:"Budget IA Studio atteint",provider:"cloudflare",budget,paid_fallback:false},429,origin);
      data=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",directorPayload);
      const raw=data?.response??data?.result?.response??data?.result??data;
      if(raw&&typeof raw==="object"&&!Array.isArray(raw))analysis=raw;
      else{content=String(raw||"").trim().replace(/^\`\`\`json\s*/i,"").replace(/\`\`\`$/,"").trim();analysis=JSON.parse(content)}
    }catch(err){
      const detail=typeof err?.message==="string"?err.message:(()=>{try{return JSON.stringify(err)}catch{return String(err||"Cloudflare Director failed")}})();
      const quota=/3036|quota|neuron|rate.?limit|429/i.test(detail);
      try{await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status='failed',attempts=1,last_error=?,updated_at=? WHERE id=?").bind(detail,new Date().toISOString(),jobId).run()}catch{}
      return json({error:quota?"Quota IA gratuit atteint":"Cloudflare Director failed",detail,provider:"cloudflare",paid_fallback:false},quota?429:502,origin);
    }

    const refs=Array.isArray(analysis?.visual_references)?analysis.visual_references:[];
    const allowedRoles=new Set(["CHARACTER","LOCATION","STYLE","OBJECT"]),allowedImportance=new Set(["essential","normal","optional"]);
    for(const ref of refs){
      const role=String(ref?.role||"").toUpperCase(),code=String(ref?.code||"").toUpperCase().replace(/[^A-Z0-9_]/g,"_").slice(0,80),title=String(ref?.title||"").trim().slice(0,160);
      if(!allowedRoles.has(role)||!code||!title)continue;
      const importance=allowedImportance.has(String(ref?.importance||""))?String(ref.importance):"normal",brief=String(ref?.brief||"").trim(),stamp=new Date().toISOString();
      const existing=await env.STUDIO_DB.prepare("SELECT id,status,locked FROM visual_references WHERE project_id=? AND code=?").bind(projectId,code).first();
      if(existing){if(!existing.locked&&existing.status!=="validated")await env.STUDIO_DB.prepare("UPDATE visual_references SET role=?,title=?,director_brief=?,importance=?,updated_at=? WHERE id=?").bind(role,title,brief,importance,stamp,existing.id).run()}
      else await env.STUDIO_DB.prepare("INSERT INTO visual_references (id,project_id,role,code,title,description,director_brief,generation_prompt,status,importance,canonical_asset_id,locked,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),projectId,role,code,title,"",brief,"","proposed",importance,null,0,"cloudflare-director",stamp,stamp).run();
    }
    await log(env,projectId,"VIDEO","Analyse IA de l’œuvre par Cloudflare Workers AI");
    try{await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status='completed',attempts=1,result=?,last_error=NULL,next_attempt_at=NULL,updated_at=?,completed_at=? WHERE id=?").bind(JSON.stringify({model:"@cf/meta/llama-3.3-70b-instruct-fp8-fast",references:refs.length}),new Date().toISOString(),new Date().toISOString(),jobId).run()}catch{}
    return json({ok:true,model:"cloudflare-workers-ai",analysis,context:{title:project.title,text_chars:String(doc?.content||"").length,assets:inventory.length}},200,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/video/references"){
    const projectId=String(url.searchParams.get("project")||"");
    if(!projectId)return json({error:"project required"},400,origin);
    const {results}=await env.STUDIO_DB.prepare("SELECT vr.*,a.r2_key AS canonical_r2_key,a.name AS canonical_asset_name,a.mime AS canonical_asset_mime FROM visual_references vr LEFT JOIN assets a ON a.id=vr.canonical_asset_id WHERE vr.project_id=? ORDER BY CASE vr.role WHEN 'CHARACTER' THEN 1 WHEN 'LOCATION' THEN 2 WHEN 'STYLE' THEN 3 WHEN 'OBJECT' THEN 4 WHEN 'KEYFRAME' THEN 5 ELSE 9 END,vr.code").bind(projectId).all();
    return json({ok:true,references:results||[]},200,origin);
  }
  const refGenerate=url.pathname.match(/^\/api\/video\/references\/([^/]+)\/generate$/);
  if(refGenerate&&req.method==="POST"){
    if(!env.AI)return json({error:"Cloudflare Workers AI binding missing"},503,origin);
    const ref=await env.STUDIO_DB.prepare("SELECT vr.*,p.title AS project_title FROM visual_references vr JOIN projects p ON p.id=vr.project_id WHERE vr.id=? AND p.deleted_at IS NULL").bind(refGenerate[1]).first();
    if(!ref)return json({error:"visual reference not found"},404,origin);
    const b=await req.json().catch(()=>({})),requested=Math.max(1,Math.min(4,Number(b.n||4))),size=String(b.size||"1024x1024");
    const countRow=await env.STUDIO_DB.prepare("SELECT COUNT(*) AS n FROM visual_reference_variants WHERE reference_id=?").bind(ref.id).first(),existingCount=Number(countRow?.n||0),count=Math.max(0,requested-existingCount);
    if(!count)return json({ok:true,provider:"cloudflare",variants:[],requested,existing_count:existingCount,total:existingCount,missing:0,complete:true},200,origin);
    const bible=await env.STUDIO_DB.prepare("SELECT content FROM creative_bibles WHERE (project_id=? OR project_id IS NULL) ORDER BY CASE WHEN project_id=? THEN 0 ELSE 1 END,version DESC LIMIT 2").bind(ref.project_id,ref.project_id).all();
    const prompt=["AUPOSITEUR visual reference. Create a believable cinematic still, not advertising art.","Project: "+ref.project_title+". Reference role: "+ref.role+". Subject: "+ref.title+".",ref.director_brief||"",(bible.results||[]).map(x=>x.content).join("\n"),"Natural human imperfections, emotionally restrained, motivated practical lighting, slightly off-center composition, negative space, tactile lived-in surfaces, subtle film texture. Avoid generic AI aesthetics, glossy commercial beauty, gratuitous neon, melodrama, text, captions, logos and watermarks."].filter(Boolean).join("\n");
    const model="@cf/black-forest-labs/flux-1-schnell",variants=[],now=new Date().toISOString();
    for(let i=0;i<count;i++){
      try{
        const budget=await reserveAi(env,70,"image");if(!budget.ok)return json({ok:false,error:"Budget IA Studio atteint",provider:"cloudflare",budget,paid_fallback:false,variants,requested,existing_count:existingCount,total:existingCount+variants.length,missing:Math.max(0,requested-existingCount-variants.length),complete:false},429,origin);
        const out=await env.AI.run(model,{prompt,num_steps:4});
        let buf,mime="image/png";
        if(out instanceof ReadableStream)buf=await new Response(out).arrayBuffer();
        else if(out?.image)buf=Uint8Array.from(atob(out.image),x=>x.charCodeAt(0)).buffer;
        else if(out?.result?.image)buf=Uint8Array.from(atob(out.result.image),x=>x.charCodeAt(0)).buffer;
        else throw new Error("Cloudflare Image returned no image");
        const assetId=crypto.randomUUID(),variantId=crypto.randomUUID(),key=`studio/${ref.project_id}/references/${ref.code.toLowerCase()}-${variantId}.png`,name=`${ref.code.toLowerCase()}-${existingCount+variants.length+1}.png`,stamp=new Date().toISOString();
        await env.STUDIO_ASSETS.put(key,buf,{httpMetadata:{contentType:mime},customMetadata:{projectId:ref.project_id,referenceId:ref.id,provider:"cloudflare",model}});
        await env.STUDIO_DB.prepare("INSERT INTO assets(id,project_id,r2_key,name,mime,bytes,kind,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(assetId,ref.project_id,key,name,mime,buf.byteLength,"IMAGE",stamp).run();
        await env.STUDIO_DB.prepare("INSERT INTO visual_reference_variants(id,reference_id,asset_id,provider,model,prompt,status,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(variantId,ref.id,assetId,"cloudflare",model,prompt,"candidate",stamp).run();
        variants.push({id:variantId,asset_id:assetId,name,mime});
      }catch(err){
        const detail=String(err?.message||err),quota=/3036|quota|neuron|rate.?limit|429/i.test(detail);
        await env.STUDIO_DB.prepare("UPDATE visual_references SET generation_prompt=?,status=?,updated_at=? WHERE id=?").bind(prompt,variants.length?"generated":"proposed",new Date().toISOString(),ref.id).run();
        return json({ok:false,error:quota?"Quota IA gratuit atteint":"Cloudflare Image failed",detail,provider:"cloudflare",paid_fallback:false,variants,requested,existing_count:existingCount,total:existingCount+variants.length,missing:Math.max(0,requested-existingCount-variants.length),complete:false},quota?429:502,origin);
      }
    }
    await env.STUDIO_DB.prepare("UPDATE visual_references SET generation_prompt=?,status='generated',updated_at=? WHERE id=?").bind(prompt,new Date().toISOString(),ref.id).run();
    await log(env,ref.project_id,"IMAGE",`Référence visuelle Cloudflare : ${ref.title} (${variants.length} variante(s))`);
    return json({ok:true,provider:"cloudflare",model,variants,requested,existing_count:existingCount,total:existingCount+variants.length,missing:Math.max(0,requested-existingCount-variants.length),complete:existingCount+variants.length>=requested},201,origin);
  }

  const refVariants=url.pathname.match(/^\/api\/video\/references\/([^/]+)\/variants$/);
  if(refVariants&&req.method==="GET"){
    const {results}=await env.STUDIO_DB.prepare("SELECT v.*,a.name,a.mime,a.bytes FROM visual_reference_variants v JOIN assets a ON a.id=v.asset_id WHERE v.reference_id=? ORDER BY v.created_at DESC").bind(refVariants[1]).all();
    return json({ok:true,variants:results||[]},200,origin);
  }
  const refCanon=url.pathname.match(/^\/api\/video\/references\/([^/]+)\/canon$/);
  if(refCanon&&req.method==="POST"){
    const b=await req.json(),variant=await env.STUDIO_DB.prepare("SELECT v.asset_id,vr.project_id,vr.title FROM visual_reference_variants v JOIN visual_references vr ON vr.id=v.reference_id WHERE v.id=? AND v.reference_id=?").bind(String(b.variant_id||""),refCanon[1]).first();
    if(!variant)return json({error:"variant not found"},404,origin);
    const now=new Date().toISOString();
    await env.STUDIO_DB.prepare("UPDATE visual_reference_variants SET status=CASE WHEN id=? THEN 'canonical' ELSE 'candidate' END WHERE reference_id=?").bind(String(b.variant_id),refCanon[1]).run();
    await env.STUDIO_DB.prepare("UPDATE visual_references SET canonical_asset_id=?,status='validated',updated_at=? WHERE id=?").bind(variant.asset_id,now,refCanon[1]).run();
    await log(env,variant.project_id,"IMAGE",`Référence canon validée : ${variant.title}`);
    return json({ok:true,canonical_asset_id:variant.asset_id},200,origin);
  }
  const refLock=url.pathname.match(/^\/api\/video\/references\/([^/]+)\/lock$/);
  if(refLock&&req.method==="POST"){
    const b=await req.json(),locked=b.locked===false?0:1,now=new Date().toISOString();
    const ref=await env.STUDIO_DB.prepare("SELECT project_id,title,canonical_asset_id FROM visual_references WHERE id=?").bind(refLock[1]).first();
    if(!ref)return json({error:"visual reference not found"},404,origin);
    if(locked&&!ref.canonical_asset_id)return json({error:"validate a canonical variant before locking"},409,origin);
    await env.STUDIO_DB.prepare("UPDATE visual_references SET locked=?,updated_at=? WHERE id=?").bind(locked,now,refLock[1]).run();
    await log(env,ref.project_id,"IMAGE",`${locked?"Référence verrouillée":"Référence déverrouillée"} : ${ref.title}`);
    return json({ok:true,locked:Boolean(locked)},200,origin);
  }
  if(req.method==="POST"&&url.pathname==="/api/agnes/jobs"){
    const b=await req.json(),projectId=String(b.project_id||""),kind=String(b.kind||"").trim(),targetId=b.target_id?String(b.target_id):null,payload=JSON.stringify(b.payload||{});
    if(!projectId||!kind)return json({error:"project_id and kind required"},400,origin);
    const project=await env.STUDIO_DB.prepare("SELECT id FROM projects WHERE id=? AND deleted_at IS NULL").bind(projectId).first();
    if(!project)return json({error:"active project not found"},404,origin);
    const id=crypto.randomUUID(),now=new Date().toISOString();
    await env.STUDIO_DB.prepare("INSERT INTO agnes_jobs(id,project_id,kind,target_id,payload,status,attempts,max_attempts,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,'queued',0,6,?,?,?)").bind(id,projectId,kind,targetId,payload,now,now,now).run();
    return json({ok:true,job:{id,project_id:projectId,kind,target_id:targetId,status:"queued",attempts:0,max_attempts:6,next_attempt_at:now,created_at:now,updated_at:now}},202,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/ai/quota"){
    const budget=await aiBudget(env);
    return json({ok:true,source:"studio-safety-budget",period:"UTC day",budget,cloudflare_free_limit:10000,safety_margin:1000,note:"Studio blocks new Cloudflare AI calls at 9000 estimated/reserved Neurons. This is a conservative local safety budget, not Cloudflare account billing telemetry."},200,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/agnes/quota"){
    const dayStart=new Date();dayStart.setUTCHours(0,0,0,0);
    const {results}=await env.STUDIO_DB.prepare("SELECT kind,status,COUNT(*) AS jobs,COALESCE(SUM(attempts),0) AS attempts FROM agnes_jobs WHERE created_at>=? GROUP BY kind,status").bind(dayStart.toISOString()).all();
    const imageAssets=await env.STUDIO_DB.prepare("SELECT COUNT(*) AS n FROM visual_reference_variants WHERE provider='agnes' AND created_at>=?").bind(dayStart.toISOString()).first();
    const videoSeconds=await env.STUDIO_DB.prepare("SELECT COALESCE(SUM(CAST(json_extract(payload,'$.seconds') AS INTEGER)),0) AS n FROM agnes_jobs WHERE kind='video' AND status='completed' AND created_at>=?").bind(dayStart.toISOString()).first().catch(()=>({n:0}));
    return json({ok:true,source:"studio-observed",period:"UTC day",observed:{jobs:results||[],images:Number(imageAssets?.n||0),video_seconds:Number(videoSeconds?.n||0)},reference_limits:{free:{text_rpm:20,image_1k_rpm:20,video_rpm:1},token_plan:{text_rpm:1000,image_1k_rpm:100,video_rpm:5,image_daily:4000,video_seconds_daily:500}},note:"Agnes does not expose a verified remaining-quota endpoint in the public API reference used by Studio; observed usage is counted locally."},200,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/agnes/jobs"){
    const project=String(url.searchParams.get("project")||"");
    try{
      const q=project?"SELECT * FROM agnes_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 30":"SELECT * FROM agnes_jobs ORDER BY created_at DESC LIMIT 30";
      const st=env.STUDIO_DB.prepare(q),{results}=project?await st.bind(project).all():await st.all();
      return json({ok:true,available:true,jobs:results||[]},200,origin);
    }catch(e){return json({ok:true,available:false,jobs:[],migration_required:true,detail:String(e?.message||e)},200,origin)}
  }
  if(req.method==="POST"&&url.pathname==="/api/agnes/queue/recover"){
    try{
      const now=new Date().toISOString(),stale=new Date(Date.now()-3*60*1000).toISOString();
      await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status='queued',next_attempt_at=?,last_error=COALESCE(last_error,'Reprise après interruption'),updated_at=? WHERE status='running' AND updated_at<?").bind(now,now,stale).run();
      const {results}=await env.STUDIO_DB.prepare("SELECT * FROM agnes_jobs WHERE status IN ('queued','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY created_at ASC LIMIT 10").bind(now).all();
      return json({ok:true,available:true,recovered:true,ready:results||[]},200,origin);
    }catch(e){return json({ok:true,available:false,migration_required:true,detail:String(e?.message||e)},200,origin)}
  }
  if(req.method==="GET"&&url.pathname==="/api/video/generations"){
    const project=url.searchParams.get("project");
    const q=project?"SELECT * FROM video_generations WHERE project_id=? ORDER BY created_at DESC LIMIT 50":"SELECT * FROM video_generations ORDER BY created_at DESC LIMIT 50";
    const st=env.STUDIO_DB.prepare(q);const {results}=project?await st.bind(project).all():await st.all();
    return json({ok:true,generations:results},200,origin);
  }
  if(req.method==="POST"&&url.pathname==="/api/video/generations"){
    if(!env.AGNES_API_KEY)return json({error:"AGNES_API_KEY missing"},503,origin);
    const b=await req.json(),projectId=String(b.project_id||""),prompt=String(b.prompt||"").trim(),referenceIds=Array.isArray(b.reference_ids)?b.reference_ids.map(String).slice(0,5):[];const keyframeReferenceId=String(b.keyframe_reference_id||"");
    if(!projectId||!prompt)return json({error:"project_id and prompt required"},400,origin);
    const project=await env.STUDIO_DB.prepare("SELECT id FROM projects WHERE id=? AND deleted_at IS NULL").bind(projectId).first();
    if(!project)return json({error:"active project not found"},404,origin);
    const now=new Date().toISOString(),id=crypto.randomUUID(),model="agnes-video-2.5-flash",aspect=String(b.aspect_ratio||"9:16"),width=aspect==="9:16"?720:1280,height=aspect==="9:16"?1280:720,numFrames=121,frameRate=24,generateAudio=Boolean(b.generate_audio),audioStyle=String(b.audio_style||"").trim();
    const canonRefs=referenceIds.length?await env.STUDIO_DB.prepare("SELECT id,code,title,canonical_asset_id FROM visual_references WHERE project_id=? AND canonical_asset_id IS NOT NULL AND id IN ("+referenceIds.map(()=>"?").join(",")+")").bind(projectId,...referenceIds).all():{results:[]};
    const referenceMeta=(canonRefs.results||[]).map(r=>({id:r.id,code:r.code,title:r.title,asset_id:r.canonical_asset_id}));
    let keyframe=null;
    if(keyframeReferenceId){const k=await env.STUDIO_DB.prepare("SELECT id,code,title,canonical_asset_id FROM visual_references WHERE id=? AND project_id=? AND role='KEYFRAME' AND canonical_asset_id IS NOT NULL").bind(keyframeReferenceId,projectId).first();if(k)keyframe={id:k.id,code:k.code,title:k.title,asset_id:k.canonical_asset_id}}
    const storedAudioStyle=JSON.stringify({audio_style:audioStyle||null,references:referenceMeta,keyframe});
    await env.STUDIO_DB.prepare("INSERT INTO video_generations(id,project_id,provider,provider_job_id,model,prompt,width,height,num_frames,frame_rate,generate_audio,audio_style,status,progress,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,projectId,"agnes",null,model,prompt,width,height,numFrames,frameRate,generateAudio?1:0,storedAudioStyle,"queued",0,now,now).run();
    await log(env,projectId,"VIDEO","Vidéo ajoutée à la file Agnes");
    return json({ok:true,generation:{id,project_id:projectId,provider:"agnes",model,prompt,status:"queued",progress:0,created_at:now}},202,origin);
  }
  if(req.method==="POST"&&url.pathname==="/api/video/queue/process"){
    if(!env.AGNES_API_KEY)return json({error:"AGNES_API_KEY missing"},503,origin);
    const active=await env.STUDIO_DB.prepare("SELECT id,status FROM video_generations WHERE provider='agnes' AND (status='dispatching' OR (provider_job_id IS NOT NULL AND status NOT IN ('completed','failed'))) ORDER BY created_at ASC LIMIT 1").first();
    if(active)return json({ok:true,action:"busy",active},200,origin);
    const next=await env.STUDIO_DB.prepare("SELECT * FROM video_generations WHERE provider='agnes' AND status='queued' AND provider_job_id IS NULL ORDER BY created_at ASC LIMIT 1").first();
    if(!next)return json({ok:true,action:"idle"},200,origin);
    const lock=await env.STUDIO_DB.prepare("UPDATE video_generations SET status='dispatching',updated_at=? WHERE id=? AND status='queued' AND provider_job_id IS NULL").bind(new Date().toISOString(),next.id).run();
    if(!lock.meta?.changes)return json({ok:true,action:"race_lost"},200,origin);
    const aspect=next.width<next.height?"9:16":"16:9";
    let meta={};try{meta=JSON.parse(next.audio_style||"{}")}catch{}
    const refImages=[];
    for(const ref of (Array.isArray(meta.references)?meta.references:[]).slice(0,5)){const dataUrl=await assetDataUrl(env,ref.asset_id);if(dataUrl)refImages.push(dataUrl)}
    const keyframeImage=meta.keyframe?.asset_id?await assetDataUrl(env,meta.keyframe.asset_id):null;
    const payload={model:next.model,prompt:next.prompt,mode:keyframeImage?"keyframe":refImages.length?"reference":"text",seconds:"5",size:"720P",aspect_ratio:aspect,n:1};
    if(keyframeImage){payload.first_frame=keyframeImage}
    else if(refImages.length){payload.model="agnes-video-2.5";payload.images=refImages}
    let upstream;
    try{upstream=await fetch("https://apihub.agnes-ai.com/v1/videos",{method:"POST",headers:{Authorization:`Bearer ${env.AGNES_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(payload)})}
    catch(e){await env.STUDIO_DB.prepare("UPDATE video_generations SET status='queued',error=?,updated_at=? WHERE id=?").bind("Réseau Agnes : "+String(e?.message||e),new Date().toISOString(),next.id).run();return json({ok:true,action:"retry",reason:"network"},200,origin)}
    const raw=await upstream.text();let data={};try{data=JSON.parse(raw)}catch{}
    if(!upstream.ok){
      const retryable=upstream.status===429||upstream.status>=500,retryAfter=Number(upstream.headers.get("Retry-After")||0)||null;
      await env.STUDIO_DB.prepare("UPDATE video_generations SET status=?,error=?,updated_at=? WHERE id=?").bind(retryable?"queued":"failed",String(data?.message||data?.error||raw.slice(0,500)||("HTTP "+upstream.status)),new Date().toISOString(),next.id).run();
      return json({ok:true,action:retryable?"retry":"failed",status:upstream.status,retry_after:retryAfter},200,origin);
    }
    const providerJobId=data.video_id||data.id||data.task_id;
    if(!providerJobId){await env.STUDIO_DB.prepare("UPDATE video_generations SET status='queued',error='Agnes response missing video id',updated_at=? WHERE id=?").bind(new Date().toISOString(),next.id).run();return json({ok:true,action:"retry",reason:"missing_id"},200,origin)}
    const now=new Date().toISOString();
    await env.STUDIO_DB.prepare("UPDATE video_generations SET provider_job_id=?,status='submitted',progress=0,error=NULL,updated_at=? WHERE id=?").bind(String(providerJobId),now,next.id).run();
    await log(env,next.project_id,"VIDEO","Génération Agnes envoyée");
    return json({ok:true,action:"submitted",id:next.id,provider_job_id:String(providerJobId)},200,origin);
  }
  const videoStatus=url.pathname.match(/^\/api\/video\/generations\/([^/]+)\/refresh$/);
  if(videoStatus&&req.method==="POST"){
    if(!env.AGNES_API_KEY)return json({error:"AGNES_API_KEY missing"},503,origin);
    const row=await env.STUDIO_DB.prepare("SELECT * FROM video_generations WHERE id=?").bind(videoStatus[1]).first();
    if(!row)return json({error:"generation not found"},404,origin);
    if(row.status==="completed"&&row.asset_id)return json({ok:true,generation:row},200,origin);
    if(row.status==="queued"||row.status==="dispatching"||!row.provider_job_id)return json({ok:true,generation:row},200,origin);
    const pollUrl="https://apihub.agnes-ai.com/agnesapi?video_id="+encodeURIComponent(row.provider_job_id)+"&model_name="+encodeURIComponent(row.model);
    const upstream=await fetch(pollUrl,{headers:{Authorization:`Bearer ${env.AGNES_API_KEY}`}});
    const raw=await upstream.text();let d={};try{d=JSON.parse(raw)}catch{}
    if(!upstream.ok)return json({error:"Agnes poll failed",status:upstream.status,detail:d?.message||d?.error||raw.slice(0,500)},502,origin);
    const providerStatus=String(d.status||"unknown").toLowerCase(),progress=Number(d.progress??0)||0,now=new Date().toISOString();
    if(providerStatus==="failed"||providerStatus==="error"){
      const err=String(d.error||d.message||"La génération a échoué.");
      await env.STUDIO_DB.prepare("UPDATE video_generations SET status='failed',progress=?,error=?,updated_at=? WHERE id=?").bind(progress,err,now,row.id).run();
      await log(env,row.project_id,"VIDEO","Génération Agnes échouée");
      return json({ok:true,generation:{...row,status:"failed",progress,error:err,updated_at:now}},200,origin);
    }
    if(providerStatus==="completed"||providerStatus==="succeeded"){
      const remoteUrl=d.metadata?.url||d.url||d.output?.url;
      if(!remoteUrl)return json({error:"Agnes completed without video URL"},502,origin);
      const media=await fetch(remoteUrl);if(!media.ok)return json({error:"Unable to archive Agnes video",status:media.status},502,origin);
      const assetId=crypto.randomUUID(),key=`studio/${row.project_id}/video/${row.id}.mp4`,name=`agnes-${row.id.slice(0,8)}.mp4`;
      await env.STUDIO_ASSETS.put(key,media.body,{httpMetadata:{contentType:media.headers.get("content-type")||"video/mp4"},customMetadata:{projectId:row.project_id,generationId:row.id,provider:"agnes"}});
      const size=Number(media.headers.get("content-length")||0);
      await env.STUDIO_DB.prepare("INSERT INTO assets(id,project_id,r2_key,name,mime,bytes,kind,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(assetId,row.project_id,key,name,media.headers.get("content-type")||"video/mp4",size,"VIDEO",now).run();
      await env.STUDIO_DB.prepare("UPDATE video_generations SET status='completed',progress=100,remote_url=?,asset_id=?,error=NULL,updated_at=? WHERE id=?").bind(remoteUrl,assetId,now,row.id).run();
      await log(env,row.project_id,"VIDEO","Vidéo Agnes terminée et archivée dans R2");
      return json({ok:true,generation:{...row,status:"completed",progress:100,remote_url:remoteUrl,asset_id:assetId,updated_at:now}},200,origin);
    }
    const normalized=["completed","succeeded","success"].includes(providerStatus)?"completed":["failed","error","cancelled"].includes(providerStatus)?"failed":["queued","pending","waiting","submitted"].includes(providerStatus)?"submitted":["processing","running","generating","in_progress"].includes(providerStatus)?"generating":"generating";
    await env.STUDIO_DB.prepare("UPDATE video_generations SET status=?,progress=?,updated_at=? WHERE id=?").bind(normalized,progress,now,row.id).run();
    return json({ok:true,generation:{...row,status:normalized,progress,updated_at:now}},200,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/activity"){
    const {results}=await env.STUDIO_DB.prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT 50").all(); return json({ok:true,activity:results},200,origin);
  }
  return json({error:"not found"},404,origin);
},
  async scheduled(controller,env,ctx){ctx.waitUntil(processDueAgnesImageJob(env));}
};