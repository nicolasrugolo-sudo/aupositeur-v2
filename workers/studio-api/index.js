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
    const {results}=await env.STUDIO_DB.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all(); return json({ok:true,projects:results},200,origin);
  }
  if(req.method==="POST"&&url.pathname==="/api/projects"){
    const b=await req.json(); if(!String(b.title||"").trim()) return json({error:"title required"},400,origin);
    const now=new Date().toISOString(), id=slug(b.title)+"-"+crypto.randomUUID().slice(0,8);
    await env.STUDIO_DB.prepare("INSERT INTO projects(id,title,type,status,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(id,String(b.title).trim(),b.type||"Projet","brouillon",now,now).run();
    await log(env,id,"PROJECT","Projet créé"); return json({ok:true,project:{id,title:String(b.title).trim(),type:b.type||"Projet",status:"brouillon",created_at:now,updated_at:now}},201,origin);
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
  if(req.method==="GET"&&url.pathname==="/api/activity"){
    const {results}=await env.STUDIO_DB.prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT 50").all(); return json({ok:true,activity:results},200,origin);
  }
  return json({error:"not found"},404,origin);
}};