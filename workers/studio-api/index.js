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

async function processDueAgnesImageJob(env){
  const now=new Date().toISOString();
  const job=await env.STUDIO_DB.prepare("SELECT * FROM agnes_jobs WHERE kind='image' AND status IN ('queued','retry') AND attempts<max_attempts AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY COALESCE(next_attempt_at,created_at),created_at LIMIT 1").bind(now).first();
  if(!job)return {ok:true,processed:false};
  const lock=await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status='running',updated_at=? WHERE id=? AND status IN ('queued','retry')").bind(now,job.id).run();
  if(!lock.meta?.changes)return {ok:true,processed:false,locked:false};
  try{
    const payload=JSON.parse(job.payload||"{}"),requested=Math.max(1,Math.min(4,Number(payload.requested||4))),size=String(payload.size||"1024x1024");
    const ref=await env.STUDIO_DB.prepare("SELECT vr.*,p.title AS project_title FROM visual_references vr JOIN projects p ON p.id=vr.project_id WHERE vr.id=? AND p.deleted_at IS NULL").bind(job.target_id).first();
    if(!ref)throw new Error("visual reference not found");
    const countRow=await env.STUDIO_DB.prepare("SELECT COUNT(*) AS n FROM visual_reference_variants WHERE reference_id=?").bind(ref.id).first(),existing=Number(countRow?.n||0);
    if(existing>=requested){await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status='completed',result=?,last_error=NULL,next_attempt_at=NULL,updated_at=?,completed_at=? WHERE id=?").bind(JSON.stringify({total:existing,requested,missing:0}),now,now,job.id).run();return {ok:true,processed:true,completed:true};}
    const bible=await env.STUDIO_DB.prepare("SELECT content FROM creative_bibles WHERE (project_id=? OR project_id IS NULL) ORDER BY CASE WHEN project_id=? THEN 0 ELSE 1 END,version DESC LIMIT 2").bind(ref.project_id,ref.project_id).all();
    const prompt=["AUPOSITEUR visual reference. Create a believable cinematic still, not advertising art.","Project: "+ref.project_title+". Reference role: "+ref.role+". Subject: "+ref.title+".",ref.director_brief||"",(bible.results||[]).length?"Creative bible: "+(bible.results||[]).map(x=>x.content).join("\n"):"","Natural human imperfections, emotionally restrained, motivated practical lighting, slightly off-center composition, negative space, tactile lived-in surfaces, subtle film texture. Avoid generic AI aesthetics, glossy commercial beauty, gratuitous neon, melodrama, text, captions, logos and watermarks."].filter(Boolean).join("\n");
    let model="agnes-image-2.5-flash",result=await agnesImageRequest(env,{model,prompt,n:1,size},{maxAttempts:1}),up=result.response,data=result.data,raw=result.raw;
    if(!up.ok&&[400,404,422].includes(up.status)&&/model|2\.5|not found|invalid|unsupported/i.test(String(data?.message||data?.error||raw||""))){model="agnes-image-2.1-flash";result=await agnesImageRequest(env,{model,prompt,n:1,size},{maxAttempts:1});up=result.response;data=result.data;raw=result.raw;}
    const attempts=Number(job.attempts||0)+1;
    if(up.status===429){const sec=Number(up.headers.get("Retry-After")||0)||Math.min(900,60*Math.max(1,attempts)),next=new Date(Date.now()+sec*1000).toISOString();await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status=?,attempts=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?").bind(attempts>=Number(job.max_attempts||6)?"failed":"retry",attempts,next,"Agnes rate limit / 429",now,job.id).run();return {ok:true,processed:true,retry:true,retry_after:sec};}
    if(!up.ok)throw new Error("Agnes Image "+up.status+": "+String(data?.message||data?.error||raw||"unknown error").slice(0,500));
    const output=Array.isArray(data.data)?data.data[0]:null;if(!output?.url)throw new Error("Agnes returned no image URL");
    const media=await fetch(output.url);if(!media.ok)throw new Error("Generated image download failed: "+media.status);
    const mime=media.headers.get("content-type")||"image/png",ext=mime.includes("jpeg")?"jpg":mime.includes("webp")?"webp":"png",assetId=crypto.randomUUID(),variantId=crypto.randomUUID(),key=`studio/${ref.project_id}/references/${ref.code.toLowerCase()}-${variantId}.${ext}`,name=`${ref.code.toLowerCase()}-${existing+1}.${ext}`,buf=await media.arrayBuffer(),stamp=new Date().toISOString();
    await env.STUDIO_ASSETS.put(key,buf,{httpMetadata:{contentType:mime},customMetadata:{projectId:ref.project_id,referenceId:ref.id,provider:"agnes",model}});
    await env.STUDIO_DB.prepare("INSERT INTO assets(id,project_id,r2_key,name,mime,bytes,kind,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(assetId,ref.project_id,key,name,mime,buf.byteLength,"IMAGE",stamp).run();
    await env.STUDIO_DB.prepare("INSERT INTO visual_reference_variants(id,reference_id,asset_id,provider,model,prompt,status,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(variantId,ref.id,assetId,"agnes",model,prompt,"candidate",stamp).run();
    const total=existing+1,complete=total>=requested,next=complete?null:new Date(Date.now()+60000).toISOString();
    await env.STUDIO_DB.prepare("UPDATE visual_references SET generation_prompt=?,status='generated',updated_at=? WHERE id=?").bind(prompt,stamp,ref.id).run();
    await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status=?,attempts=?,result=?,last_error=NULL,next_attempt_at=?,updated_at=?,completed_at=? WHERE id=?").bind(complete?"completed":"retry",attempts,JSON.stringify({total,requested,missing:Math.max(0,requested-total)}),next,stamp,complete?stamp:null,job.id).run();
    await log(env,ref.project_id,"IMAGE",`Reprise Agnes : ${ref.title} (${total}/${requested})`);
    return {ok:true,processed:true,completed:complete,total,requested};
  }catch(e){
    const attempts=Number(job.attempts||0)+1,max=Number(job.max_attempts||6),stamp=new Date().toISOString(),next=new Date(Date.now()+Math.min(900,60*Math.max(1,attempts))*1000).toISOString();
    await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status=?,attempts=?,next_attempt_at=?,last_error=?,updated_at=?,completed_at=? WHERE id=?").bind(attempts>=max?"failed":"retry",attempts,attempts>=max?null:next,String(e?.message||e).slice(0,700),stamp,attempts>=max?stamp:null,job.id).run();
    return {ok:false,processed:true,error:String(e?.message||e)};
  }
}

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
    if(!env.AGNES_API_KEY)return json({error:"AGNES_API_KEY missing"},503,origin);
    const b=await req.json(),projectId=String(b.project_id||"");
    const project=await env.STUDIO_DB.prepare("SELECT id,title,type FROM projects WHERE id=? AND deleted_at IS NULL").bind(projectId).first();
    if(!project)return json({error:"active project not found"},404,origin);
    const doc=await env.STUDIO_DB.prepare("SELECT content FROM documents WHERE project_id=?").bind(projectId).first();
    const {results:assets}=await env.STUDIO_DB.prepare("SELECT id,name,mime,bytes,kind FROM assets WHERE project_id=? ORDER BY created_at ASC").bind(projectId).all();
    const inventory=(assets||[]).map(a=>({name:a.name,mime:a.mime,kind:a.kind,bytes:a.bytes}));
    const userIntent=String(b.intent||"").trim();
    const jobId=crypto.randomUUID(),jobNow=new Date().toISOString();
    try{await env.STUDIO_DB.prepare("INSERT INTO agnes_jobs(id,project_id,kind,target_id,payload,status,attempts,max_attempts,created_at,updated_at) VALUES(?,?,?,?,?,'running',0,4,?,?)").bind(jobId,projectId,"director",projectId,JSON.stringify({intent:userIntent||null}),jobNow,jobNow).run()}catch{}
    const system=`Tu es le réalisateur et directeur artistique du Studio AUPOSITEUR. Analyse une œuvre comme un film à concevoir, pas comme une suite d'illustrations littérales. Tu dois préserver l'intention de l'auteur, proposer sans décider à sa place, rechercher une cohérence de personnages, décors, palette, lumière, caméra et motifs. Réponds UNIQUEMENT en JSON valide, sans markdown, selon ce schéma: {"reading":{"core":"","themes":[],"emotional_arc":"","visual_motifs":[],"avoid":[]},"direction":{"concept":"","palette":"","camera":"","lighting":"","continuity_rules":[]},"visual_references":[{"role":"CHARACTER","code":"CHARACTER_01","title":"","importance":"essential","brief":""}],"storyboard":[{"index":1,"source":"","purpose":"","visual":"","camera":"","continuity":"","prompt_seed":""}],"missing_context":[]}. Propose aussi visual_references: uniquement les références réellement utiles à la cohérence du film. role doit être CHARACTER, LOCATION, STYLE ou OBJECT; code stable en MAJUSCULES (ex. CHARACTER_01); importance essential, normal ou optional; brief concret pour une future génération d’image. Le storyboard doit comporter 6 à 12 plans préparatoires, chacun étant une intention de plan unique exploitable ensuite par un moteur vidéo.`;
    const userPrompt=JSON.stringify({title:project.title,type:project.type,author_intent:userIntent||null,lyrics_or_text:String(doc?.content||""),assets:inventory});
    const directorPayload={model:"agnes-3.0-flash",messages:[{role:"system",content:system},{role:"user",content:userPrompt}],temperature:0.4,max_tokens:12000,stream:false};
    let upstream=null,raw="",data={},directorAttempts=0;
    for(let attempt=1;attempt<=4;attempt++){
      directorAttempts=attempt;
      try{await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET attempts=?,status='running',updated_at=? WHERE id=?").bind(attempt,new Date().toISOString(),jobId).run()}catch{}
      upstream=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${env.AGNES_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(directorPayload)});
      raw=await upstream.text();data={};try{data=JSON.parse(raw)}catch{}
      const detail=String(data?.message||data?.error||raw||"");
      const temporary=upstream.status===429||upstream.status>=500||/error code:\s*1015|rate.?limit|too many requests|temporar/i.test(detail);
      if(upstream.ok||!temporary||attempt===4)break;
      const retryHeader=Number(upstream.headers.get("Retry-After")||0);
      const waitMs=retryHeader>0?Math.min(retryHeader*1000,45000):Math.min(8000*Math.pow(2,attempt-1),40000);
      await sleep(waitMs);
    }
    if(!upstream?.ok){
      const detail=String(data?.message||data?.error||raw.slice(0,500)||"Unknown Agnes error");
      const limited=upstream?.status===429||/error code:\s*1015|rate.?limit|too many requests/i.test(detail);
      const retryable=limited||Boolean(upstream&&upstream.status>=500),nextAttempt=retryable?new Date(Date.now()+60000).toISOString():null;
      try{await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status=?,attempts=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?").bind(retryable?"retry":"failed",directorAttempts,nextAttempt,detail,new Date().toISOString(),jobId).run()}catch{}
      return json({error:limited?"Agnes Director temporarily limited":"Agnes Director failed",status:upstream?.status||502,detail,attempts:directorAttempts,retryable},limited?429:502,origin);
    }
    let content=String(data?.choices?.[0]?.message?.content||"").trim().replace(/^\`\`\`json\s*/i,"").replace(/\`\`\`$/,"").trim(),analysis;
    try{analysis=JSON.parse(content)}catch{
      const finish=String(data?.choices?.[0]?.finish_reason||"");
      if(finish==="length"||(!content.endsWith("}")&&content.startsWith("{"))){
        const repairPayload={model:"agnes-3.0-flash",messages:[{role:"system",content:"Return only valid compact JSON. Repair and complete the truncated JSON below. Preserve the supplied content and schema, but shorten verbose prose if necessary. No markdown."},{role:"user",content:content}],temperature:0,max_tokens:12000,stream:false};
        const repair=await fetch("https://apihub.agnes-ai.com/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${env.AGNES_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(repairPayload)});
        if(repair.ok){const rd=await repair.json().catch(()=>({}));content=String(rd?.choices?.[0]?.message?.content||"").trim().replace(/^\`\`\`json\s*/i,"").replace(/\`\`\`$/,"").trim();try{analysis=JSON.parse(content)}catch{}}
      }
      if(!analysis)return json({error:"Agnes Director returned invalid JSON",detail:content.slice(0,1000),finish_reason:finish||null},502,origin);
    }
    const refs=Array.isArray(analysis.visual_references)?analysis.visual_references:[];
    const allowedRoles=new Set(["CHARACTER","LOCATION","STYLE","OBJECT"]);
    const allowedImportance=new Set(["essential","normal","optional"]);
    for(const ref of refs){
      const role=String(ref?.role||"").toUpperCase(),code=String(ref?.code||"").toUpperCase().replace(/[^A-Z0-9_]/g,"_").slice(0,80),title=String(ref?.title||"").trim().slice(0,160);
      if(!allowedRoles.has(role)||!code||!title)continue;
      const importance=allowedImportance.has(String(ref?.importance||""))?String(ref.importance):"normal",brief=String(ref?.brief||"").trim();
      const existing=await env.STUDIO_DB.prepare("SELECT id,status,locked FROM visual_references WHERE project_id=? AND code=?").bind(projectId,code).first();
      if(existing){
        if(!existing.locked&&existing.status!=="validated")await env.STUDIO_DB.prepare("UPDATE visual_references SET role=?,title=?,director_brief=?,importance=?,updated_at=? WHERE id=?").bind(role,title,brief,importance,new Date().toISOString(),existing.id).run();
      }else{
        await env.STUDIO_DB.prepare("INSERT INTO visual_references (id,project_id,role,code,title,description,director_brief,generation_prompt,status,importance,canonical_asset_id,locked,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),projectId,role,code,title,"",brief,"","proposed",importance,null,0,"director",new Date().toISOString(),new Date().toISOString()).run();
      }
    }
    await log(env,projectId,"VIDEO","Analyse IA de l’œuvre par Agnes 3.0 Flash");
    try{await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status='completed',attempts=?,result=?,last_error=NULL,next_attempt_at=NULL,updated_at=?,completed_at=? WHERE id=?").bind(directorAttempts,JSON.stringify({model:"agnes-3.0-flash",references:refs.length}),new Date().toISOString(),new Date().toISOString(),jobId).run()}catch{}
    return json({ok:true,model:"agnes-3.0-flash",analysis,context:{title:project.title,text_chars:String(doc?.content||"").length,assets:inventory.length}},200,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/video/references"){
    const projectId=String(url.searchParams.get("project")||"");
    if(!projectId)return json({error:"project required"},400,origin);
    const {results}=await env.STUDIO_DB.prepare("SELECT vr.*,a.r2_key AS canonical_r2_key,a.name AS canonical_asset_name,a.mime AS canonical_asset_mime FROM visual_references vr LEFT JOIN assets a ON a.id=vr.canonical_asset_id WHERE vr.project_id=? ORDER BY CASE vr.role WHEN 'CHARACTER' THEN 1 WHEN 'LOCATION' THEN 2 WHEN 'STYLE' THEN 3 WHEN 'OBJECT' THEN 4 WHEN 'KEYFRAME' THEN 5 ELSE 9 END,vr.code").bind(projectId).all();
    return json({ok:true,references:results||[]},200,origin);
  }
  const refGenerate=url.pathname.match(/^\/api\/video\/references\/([^/]+)\/generate$/);
  if(refGenerate&&req.method==="POST"){
    if(!env.AGNES_API_KEY)return json({error:"AGNES_API_KEY missing"},503,origin);
    const ref=await env.STUDIO_DB.prepare("SELECT vr.*,p.title AS project_title FROM visual_references vr JOIN projects p ON p.id=vr.project_id WHERE vr.id=? AND p.deleted_at IS NULL").bind(refGenerate[1]).first();
    if(!ref)return json({error:"visual reference not found"},404,origin);
    const b=await req.json().catch(()=>({})),requested=Math.max(1,Math.min(4,Number(b.n||4))),existingCount=Math.max(0,Number(b.existing_count||0)),count=Math.max(0,requested-existingCount),size=String(b.size||"1024x1024");
    const queueJobId=crypto.randomUUID(),queueNow=new Date().toISOString();
    try{
      await env.STUDIO_DB.prepare("INSERT INTO agnes_jobs(id,project_id,kind,target_id,payload,status,attempts,max_attempts,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,'running',1,6,NULL,?,?)").bind(queueJobId,ref.project_id,"image",ref.id,JSON.stringify({requested,existing_count:existingCount,size}),queueNow,queueNow).run();
    }catch(e){
      return json({error:"Agnes queue insert failed",detail:String(e?.message||e),stage:"queue_insert"},500,origin);
    }
    const bible=await env.STUDIO_DB.prepare("SELECT content FROM creative_bibles WHERE (project_id=? OR project_id IS NULL) ORDER BY CASE WHEN project_id=? THEN 0 ELSE 1 END,version DESC LIMIT 2").bind(ref.project_id,ref.project_id).all();
    const bibleText=(bible.results||[]).map(x=>x.content).join("\n");
    const prompt=[
      "AUPOSITEUR visual reference. Create a believable cinematic still, not advertising art.",
      "Project: "+ref.project_title+". Reference role: "+ref.role+". Subject: "+ref.title+".",
      ref.director_brief||"",
      bibleText?"Creative bible: "+bibleText:"",
      "Natural human imperfections, emotionally restrained, motivated practical lighting, slightly off-center composition, negative space, tactile lived-in surfaces, subtle film texture. Avoid generic AI aesthetics, glossy commercial beauty, gratuitous neon, melodrama, text, captions, logos and watermarks."
    ].filter(Boolean).join("\n");
    const imagePayload=(model)=>({model,prompt,n:1,size});
    let imageModel="agnes-image-2.5-flash",variants=[],now=new Date().toISOString(),rateLimited=false,retryAfter=null;
    for(let requestIndex=0;requestIndex<count;requestIndex++){
      if(requestIndex>0)await sleep(5000);
      let result=await agnesImageRequest(env,imagePayload(imageModel),{maxAttempts:1});
      let upstream=result.response,raw=result.raw,data=result.data;
      if(!upstream.ok&&[400,404,422].includes(upstream.status)){
        const firstDetail=String(data?.message||data?.error||raw||"");
        if(/model|2\.5|not found|invalid|unsupported/i.test(firstDetail)){
          imageModel="agnes-image-2.1-flash";
          result=await agnesImageRequest(env,imagePayload(imageModel),{maxAttempts:1});upstream=result.response;raw=result.raw;data=result.data;
        }
      }
      if(upstream.status===429){
        rateLimited=true;retryAfter=Number(upstream.headers.get("Retry-After")||0)||60;
        const nextAt=new Date(Date.now()+retryAfter*1000).toISOString();
        await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status='retry',attempts=attempts+1,next_attempt_at=?,last_error=?,result=?,updated_at=? WHERE id=?").bind(nextAt,"Agnes rate limit / 429",JSON.stringify({generated:variants.length,requested,missing:Math.max(0,requested-existingCount-variants.length)}),new Date().toISOString(),queueJobId).run();
        break;
      }
      if(!upstream.ok){const detail=String(data?.message||data?.error||raw.slice(0,800)||"Unknown Agnes error");await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status='failed',last_error=?,updated_at=?,completed_at=? WHERE id=?").bind(detail,new Date().toISOString(),new Date().toISOString(),queueJobId).run();return json({error:"Agnes Image failed",upstream_status:upstream.status,detail},502,origin);}
      const output=Array.isArray(data.data)?data.data[0]:null;
      if(!output?.url)continue;
      const media=await fetch(output.url);if(!media.ok)continue;
      const mime=media.headers.get("content-type")||"image/png",ext=mime.includes("jpeg")?"jpg":mime.includes("webp")?"webp":"png",assetId=crypto.randomUUID(),variantId=crypto.randomUUID(),key=`studio/${ref.project_id}/references/${ref.code.toLowerCase()}-${variantId}.${ext}`,name=`${ref.code.toLowerCase()}-${existingCount+variants.length+1}.${ext}`;
      const buf=await media.arrayBuffer();
      await env.STUDIO_ASSETS.put(key,buf,{httpMetadata:{contentType:mime},customMetadata:{projectId:ref.project_id,referenceId:ref.id,provider:"agnes",model:imageModel}});
      await env.STUDIO_DB.prepare("INSERT INTO assets(id,project_id,r2_key,name,mime,bytes,kind,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(assetId,ref.project_id,key,name,mime,buf.byteLength,"IMAGE",now).run();
      await env.STUDIO_DB.prepare("INSERT INTO visual_reference_variants(id,reference_id,asset_id,provider,model,prompt,status,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(variantId,ref.id,assetId,"agnes",imageModel,prompt,"candidate",now).run();
      variants.push({id:variantId,asset_id:assetId,name,mime});
    }

    await env.STUDIO_DB.prepare("UPDATE visual_references SET generation_prompt=?,status=?,updated_at=? WHERE id=?").bind(prompt,variants.length?"generated":"proposed",now,ref.id).run();
    await log(env,ref.project_id,"IMAGE",`Référence visuelle générée : ${ref.title} (${variants.length} variante(s))`);
    const complete=existingCount+variants.length>=requested;
    if(!rateLimited)await env.STUDIO_DB.prepare("UPDATE agnes_jobs SET status=?,result=?,last_error=NULL,next_attempt_at=NULL,updated_at=?,completed_at=? WHERE id=?").bind(complete?"completed":"retry",JSON.stringify({generated:variants.length,total:existingCount+variants.length,requested,missing:Math.max(0,requested-existingCount-variants.length)}),new Date().toISOString(),complete?new Date().toISOString():null,queueJobId).run();
    return json({ok:true,job_id:queueJobId,model:imageModel,variants,requested,existing_count:existingCount,total:existingCount+variants.length,missing:Math.max(0,requested-existingCount-variants.length),rate_limited:rateLimited,retry_after:retryAfter,complete},rateLimited?202:201,origin);
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