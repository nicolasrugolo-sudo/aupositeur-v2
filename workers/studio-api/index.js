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
const user=(req)=>req.headers.get("Cf-Access-Authenticated-User-Email")||"";
const requireAccess=(req,env,origin)=>{
  if(env.ALLOW_UNPROTECTED_PREVIEW==="true") return null;
  if(!user(req)) return json({error:"Studio Access required"},401,origin);
  return null;
};
async function log(env,projectId,kind,message){await env.STUDIO_DB.prepare("INSERT INTO activity(project_id,kind,message,created_at) VALUES(?,?,?,?)").bind(projectId||null,kind,message,new Date().toISOString()).run()}
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
    return json({ok:true,providers:{agnes:{configured:Boolean(env.AGNES_API_KEY),model:"agnes-video-v2.0",width:768,height:1024,num_frames:241,frame_rate:24}}},200,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/video/generations"){
    const project=url.searchParams.get("project");
    const q=project?"SELECT * FROM video_generations WHERE project_id=? ORDER BY created_at DESC LIMIT 50":"SELECT * FROM video_generations ORDER BY created_at DESC LIMIT 50";
    const st=env.STUDIO_DB.prepare(q);const {results}=project?await st.bind(project).all():await st.all();
    return json({ok:true,generations:results},200,origin);
  }
  if(req.method==="POST"&&url.pathname==="/api/video/generations"){
    if(!env.AGNES_API_KEY)return json({error:"AGNES_API_KEY missing"},503,origin);
    const b=await req.json(),projectId=String(b.project_id||""),prompt=String(b.prompt||"").trim();
    if(!projectId||!prompt)return json({error:"project_id and prompt required"},400,origin);
    const project=await env.STUDIO_DB.prepare("SELECT id FROM projects WHERE id=? AND deleted_at IS NULL").bind(projectId).first();
    if(!project)return json({error:"active project not found"},404,origin);
    const model="agnes-video-v2.0",width=768,height=1024,numFrames=241,frameRate=24,generateAudio=Boolean(b.generate_audio),audioStyle=String(b.audio_style||"").trim();
    const payload={model,prompt,width,height,num_frames:numFrames,frame_rate:frameRate};
    if(generateAudio){payload.generate_audio=true;if(audioStyle)payload.audio_style=audioStyle}
    const upstream=await fetch("https://apihub.agnes-ai.com/v1/videos",{method:"POST",headers:{Authorization:`Bearer ${env.AGNES_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const raw=await upstream.text();let data={};try{data=JSON.parse(raw)}catch{}
    if(!upstream.ok)return json({error:"Agnes create failed",status:upstream.status,detail:data?.message||data?.error||raw.slice(0,500)},502,origin);
    const providerJobId=data.video_id||data.id||data.task_id;
    if(!providerJobId)return json({error:"Agnes response missing video id"},502,origin);
    const now=new Date().toISOString(),id=crypto.randomUUID();
    await env.STUDIO_DB.prepare("INSERT INTO video_generations(id,project_id,provider,provider_job_id,model,prompt,width,height,num_frames,frame_rate,generate_audio,audio_style,status,progress,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,projectId,"agnes",String(providerJobId),model,prompt,width,height,numFrames,frameRate,generateAudio?1:0,audioStyle||null,"queued",0,now,now).run();
    await log(env,projectId,"VIDEO","Génération Agnes lancée");
    return json({ok:true,generation:{id,project_id:projectId,provider:"agnes",provider_job_id:String(providerJobId),model,prompt,status:"queued",progress:0,created_at:now}},201,origin);
  }
  const videoStatus=url.pathname.match(/^\/api\/video\/generations\/([^/]+)\/refresh$/);
  if(videoStatus&&req.method==="POST"){
    if(!env.AGNES_API_KEY)return json({error:"AGNES_API_KEY missing"},503,origin);
    const row=await env.STUDIO_DB.prepare("SELECT * FROM video_generations WHERE id=?").bind(videoStatus[1]).first();
    if(!row)return json({error:"generation not found"},404,origin);
    if(row.status==="completed"&&row.asset_id)return json({ok:true,generation:row},200,origin);
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
    const normalized=providerStatus==="unknown"?"generating":providerStatus;
    await env.STUDIO_DB.prepare("UPDATE video_generations SET status=?,progress=?,updated_at=? WHERE id=?").bind(normalized,progress,now,row.id).run();
    return json({ok:true,generation:{...row,status:normalized,progress,updated_at:now}},200,origin);
  }
  if(req.method==="GET"&&url.pathname==="/api/activity"){
    const {results}=await env.STUDIO_DB.prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT 50").all(); return json({ok:true,activity:results},200,origin);
  }
  return json({error:"not found"},404,origin);
}};