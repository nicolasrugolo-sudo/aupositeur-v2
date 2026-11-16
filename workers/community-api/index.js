// AUPOSITEUR community API — Cloudflare Worker, D1 and Brevo.
// Configure PUBLIC_ORIGIN, ACCESS_TEAM_DOMAIN, ACCESS_AUD, BREVO_API_KEY,
// SENDER_EMAIL and SENDER_NAME. No secret belongs in browser code.
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const allowedTypes=new Set(["ecrits","reflexions","musiques","citations"]);
const uid=()=>crypto.randomUUID();
const sha=async v=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const clean=v=>typeof v==="string"?v.trim():"";
const originOf=env=>env.PUBLIC_ORIGIN||"https://www.aupositeur.be";
const allowedOrigin=(env,origin)=>{if(!origin)return false;try{const u=new URL(origin);return u.protocol==="https:"&&(origin===originOf(env)||origin==="https://aupositeur.be"||u.hostname==="aupositeur-site.pages.dev"||u.hostname.endsWith(".aupositeur-site.pages.dev"))&&u.username===""&&u.password===""&&u.pathname==="/"&&u.search===""&&u.hash==="";}catch{return false;}};
const cors=(env,request)=>({"access-control-allow-origin":allowedOrigin(env,request.headers.get("origin"))?request.headers.get("origin"):originOf(env),"access-control-allow-credentials":"true","vary":"Origin"});
const urlToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,"0")).join("");
const bad=(message,status=400)=>json({error:message},status);
async function verifyGitHubAdmin(request){
  const auth=request.headers.get("authorization")||"";
  const match=/^Bearer (gh[opu s]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)$/i.exec(auth.replace("gh s_","ghs_"));
  if(!match)return false;
  const headers={"authorization":"Bearer "+match[1],"accept":"application/vnd.github+json","user-agent":"aupositeur-community-api","x-github-api-version":"2022-11-28"};
  try{
    const user=await fetch("https://api.github.com/user",{headers,redirect:"error"});
    if(!user.ok)return false;
    const identity=await user.json();
    if(identity.login!=="nicolasrugolo-sudo")return false;
    const repo=await fetch("https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2",{headers,redirect:"error"});
    if(!repo.ok)return false;
    const data=await repo.json();
    return data.full_name==="nicolasrugolo-sudo/aupositeur-v2" && data.permissions?.admin===true;
  }catch{return false;}
}
async function verifyAccess(request,env){
  const token=request.headers.get("cf-access-jwt-assertion");
  if(!token||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)return false;
  try{
    const parts=token.split(".");if(parts.length!==3)return false;
    const b64=x=>atob(x.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(x.length/4)*4,"="));
    const decode=x=>JSON.parse(new TextDecoder().decode(Uint8Array.from(b64(x),c=>c.charCodeAt(0))));
    const header=decode(parts[0]),claims=decode(parts[1]);
    if(header.alg!=="RS256"||!claims.aud?.includes(env.ACCESS_AUD)||claims.exp*1000<Date.now()||claims.iss!==("https://"+env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"")))return false;
    const keys=await (await fetch("https://"+env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"")+"/cdn-cgi/access/certs")).json();
    const jwk=keys.keys.find(k=>k.kid===header.kid);if(!jwk)return false;
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    const sig=Uint8Array.from(b64(parts[2]),c=>c.charCodeAt(0));
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,sig,new TextEncoder().encode(parts[0]+"."+parts[1]));
  }catch{return false}
}
async function sendMail(env,to,subject,html,text){
  if(!env.BREVO_API_KEY||!env.SENDER_EMAIL)throw Error("Service e-mail non configuré");
  const res=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":env.BREVO_API_KEY,"content-type":"application/json"},body:JSON.stringify({sender:{name:env.SENDER_NAME||"AUPOSITEUR",email:env.SENDER_EMAIL},to:[{email:to}],subject,htmlContent:html,textContent:text})});
  if(!res.ok)throw Error("Échec de l'envoi : "+res.status);
  return res.json();
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function limited(db,env,request,scope,max){
  if(!env.RATE_LIMIT_PEPPER)throw Error("RATE_LIMIT_PEPPER missing");
  const ip=request.headers.get("cf-connecting-ip")||"unknown";
  const fingerprint=await sha(env.RATE_LIMIT_PEPPER+":"+ip);
  const windowStart=new Date(Math.floor(Date.now()/3600000)*3600000).toISOString();
  await db.prepare("INSERT INTO submission_limits(scope,visitor_hash,window_start,attempts) VALUES(?,?,?,1) ON CONFLICT(scope,visitor_hash,window_start) DO UPDATE SET attempts=attempts+1").bind(scope,fingerprint,windowStart).run();
  const row=await db.prepare("SELECT attempts FROM submission_limits WHERE scope=? AND visitor_hash=? AND window_start=?").bind(scope,fingerprint,windowStart).first();
  return row.attempts>max;
}
async function turnstile(env,token,ip){
  if(!env.TURNSTILE_SECRET)return false;
  const form=new FormData();form.set("secret",env.TURNSTILE_SECRET);form.set("response",token||"");if(ip)form.set("remoteip",ip);
  const res=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
  if(!res.ok)return false;
  const result=await res.json();
  if(result.success!==true)return false;
  // A token issued for another hostname must never authorize this site.
  const hostname=clean(result.hostname).toLowerCase();
  return hostname==="aupositeur.be"||hostname==="www.aupositeur.be"||hostname==="aupositeur-site.pages.dev"||hostname.endsWith(".aupositeur-site.pages.dev");
}
async function deliverQueued(env){
  const db=env.DB;if(!db||!env.BREVO_API_KEY)return;
  const jobs=(await db.prepare("SELECT d.campaign_id,d.subscriber_id,s.email,c.subject,c.body_html,c.body_text FROM campaign_deliveries d JOIN subscribers s ON s.id=d.subscriber_id JOIN campaigns c ON c.id=d.campaign_id WHERE d.status='queued' AND c.status='queued' ORDER BY c.approved_at,d.subscriber_id LIMIT 15").all()).results;
  for(const job of jobs){
    const current=await db.prepare("SELECT status FROM subscribers WHERE id=?").bind(job.subscriber_id).first();
    if(current?.status!=="active"){
      await db.prepare("UPDATE campaign_deliveries SET status='skipped',attempted_at=datetime('now') WHERE campaign_id=? AND subscriber_id=?").bind(job.campaign_id,job.subscriber_id).run();continue;
    }
    // Claim once: ambiguous network failures are not automatically retried.
    const claimed=await db.prepare("UPDATE campaign_deliveries SET status='sending',attempted_at=datetime('now') WHERE campaign_id=? AND subscriber_id=? AND status='queued'").bind(job.campaign_id,job.subscriber_id).run();
    if(!claimed.meta?.changes)continue;
    try{
      const token=urlToken(),hash=await sha(token);
      await db.prepare("INSERT INTO subscriber_tokens(token_hash,subscriber_id,purpose,expires_at) VALUES(?,?,'unsubscribe',datetime('now','+10 years'))").bind(hash,job.subscriber_id).run();
      const link=originOf(env)+"/communaute/desinscription/?token="+token;
      const footer='<hr><p>Vous recevez ce message car vous êtes abonné aux nouveautés AUPOSITEUR. <a href="'+esc(link)+'">Se désinscrire</a></p>';
      const result=await sendMail(env,job.email,job.subject,job.body_html+footer,job.body_text+"\n\nSe désinscrire : "+link);
      await db.prepare("UPDATE campaign_deliveries SET status='sent',provider_message_id=? WHERE campaign_id=? AND subscriber_id=?").bind(result.messageId||null,job.campaign_id,job.subscriber_id).run();
    }catch(error){
      console.error("Delivery failed",job.campaign_id,job.subscriber_id,error);
      await db.prepare("UPDATE campaign_deliveries SET status='failed' WHERE campaign_id=? AND subscriber_id=?").bind(job.campaign_id,job.subscriber_id).run();
    }
  }
  await db.prepare("UPDATE campaigns SET status='failed' WHERE status='queued' AND EXISTS (SELECT 1 FROM campaign_deliveries WHERE campaign_id=campaigns.id AND status='failed') AND NOT EXISTS (SELECT 1 FROM campaign_deliveries WHERE campaign_id=campaigns.id AND status IN ('queued','sending'))").run();
  await db.prepare("UPDATE campaigns SET status='sent',sent_at=datetime('now') WHERE status='queued' AND NOT EXISTS (SELECT 1 FROM campaign_deliveries WHERE campaign_id=campaigns.id AND status IN ('queued','sending','failed'))").run();
}
export default {async scheduled(event,env,ctx){ctx.waitUntil(deliverQueued(env));},async fetch(request,env){
  const u=new URL(request.url),path=u.pathname,method=request.method,origin=request.headers.get("origin");
  const headers=cors(env,request);
  const bad=(message,status=400)=>json({error:message},status,headers);
  if(method==="OPTIONS"){if(origin&&!allowedOrigin(env,origin))return bad("Origine interdite",403);return new Response(null,{status:204,headers:{...headers,"access-control-allow-methods":"GET,POST,PATCH,PUT,DELETE,OPTIONS","access-control-allow-headers":"content-type"}});}
  if(origin&&!allowedOrigin(env,origin))return bad("Origine interdite",403);
  if(!env.DB)return bad("Base D1 non configurée",503);
  const db=env.DB;
  try{
    if(path==="/api/comments"&&method==="GET"){
      const type=clean(u.searchParams.get("type")),id=clean(u.searchParams.get("id"));
      if(!allowedTypes.has(type)||!id||id.length>160)return bad("Publication invalide");
      const r=await db.prepare("SELECT id,author_name,body,created_at,parent_id,is_author_reply FROM comments WHERE content_type=? AND content_id=? AND status='approved' ORDER BY created_at ASC LIMIT 100").bind(type,id).all();
      const setting=await db.prepare("SELECT enabled FROM comment_settings WHERE content_type=? AND content_id=?").bind(type,id).first();
      return json({comments:r.results,enabled:setting?.enabled!==0},200,headers);
    }
    if(path==="/api/comments"&&method==="POST"){
      const b=await request.json(),type=clean(b.type),id=clean(b.id),name=clean(b.name),body=clean(b.body);
      if(!allowedTypes.has(type)||!id||id.length>160||name.length<2||name.length>80||body.length<3||body.length>3000)return bad("Champs invalides");
      const setting=await db.prepare("SELECT enabled FROM comment_settings WHERE content_type=? AND content_id=?").bind(type,id).first();
      if(setting?.enabled===0)return bad("Commentaires fermés pour cette publication",403);
      if(await limited(db,env,request,"comment",8))return bad("Trop de messages, réessayez plus tard",429);
      if(!await turnstile(env,b.turnstile,request.headers.get("cf-connecting-ip")))return bad("Vérification anti-robot requise",403);
      await db.prepare("INSERT INTO comments(id,content_type,content_id,author_name,body) VALUES(?,?,?,?,?)").bind(uid(),type,id,name,body).run();
      return json({message:"Message reçu, en attente de modération."},202,headers);
    }
    if(path==="/api/subscribe"&&method==="POST"){
      const b=await request.json(),email=clean(b.email).toLowerCase();
      if(!b.consent||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return bad("Adresse ou consentement invalide");
      if(await limited(db,env,request,"subscribe",4))return bad("Trop de tentatives, réessayez plus tard",429);
      if(!await turnstile(env,b.turnstile,request.headers.get("cf-connecting-ip")))return bad("Vérification anti-robot requise",403);
      const old=await db.prepare("SELECT id,status FROM subscribers WHERE email=?").bind(email).first();
      if(old?.status==="active")return json({message:"Si l'adresse est éligible, un e-mail vous sera envoyé."},202,headers);
      const id=old?.id||uid(),token=urlToken(),hash=await sha(token);
      if(old)await db.prepare("UPDATE subscribers SET status='pending',consent_at=datetime('now'),consent_version='v1',confirmed_at=NULL,unsubscribed_at=NULL WHERE id=?").bind(id).run();
      else await db.prepare("INSERT INTO subscribers(id,email,consent_version) VALUES(?,?,'v1')").bind(id,email).run();
      await db.prepare("DELETE FROM subscriber_tokens WHERE subscriber_id=? AND purpose='confirm'").bind(id).run();
      await db.prepare("INSERT INTO subscriber_tokens(token_hash,subscriber_id,purpose,expires_at) VALUES(?,?,'confirm',datetime('now','+24 hours'))").bind(hash,id).run();
      const link=originOf(env)+"/communaute/confirmation/?token="+token;
      await sendMail(env,email,"Confirmez votre abonnement à AUPOSITEUR",'<p>Confirmez votre inscription : <a href="'+esc(link)+'">Je confirme</a></p>',"Confirmez votre inscription : "+link);
      return json({message:"Vérifiez votre boîte mail pour confirmer votre inscription."},202,headers);
    }
    if(path==="/api/confirm"&&method==="POST"){
      const token=clean((await request.json()).token);if(!/^[a-f0-9]{64}$/.test(token))return bad("Lien invalide");
      const hash=await sha(token);
      const t=await db.prepare("SELECT subscriber_id FROM subscriber_tokens WHERE token_hash=? AND purpose='confirm' AND used_at IS NULL AND expires_at>datetime('now')").bind(hash).first();
      if(!t)return bad("Lien expiré ou déjà utilisé",410);
      await db.batch([db.prepare("UPDATE subscribers SET status='active',confirmed_at=datetime('now') WHERE id=?").bind(t.subscriber_id),db.prepare("UPDATE subscriber_tokens SET used_at=datetime('now') WHERE token_hash=?").bind(hash)]);
      return json({message:"Abonnement confirmé."},200,headers);
    }
    if(path==="/api/unsubscribe"&&method==="POST"){
      const payload=await request.json(),token=clean(payload.token),confirmed=payload.confirm===true;if(!confirmed)return bad("Confirmation requise");if(!/^[a-f0-9]{64}$/.test(token))return bad("Lien invalide");
      const hash=await sha(token);
      const t=await db.prepare("SELECT subscriber_id FROM subscriber_tokens WHERE token_hash=? AND purpose='unsubscribe' AND used_at IS NULL AND expires_at>datetime('now')").bind(hash).first();
      if(!t)return bad("Lien invalide ou déjà utilisé",410);
      await db.batch([db.prepare("UPDATE subscribers SET status='unsubscribed',unsubscribed_at=datetime('now') WHERE id=?").bind(t.subscriber_id),db.prepare("UPDATE subscriber_tokens SET used_at=datetime('now') WHERE token_hash=?").bind(hash)]);
      return json({message:"Vous êtes désinscrit."},200,headers);
    }
    if(path.startsWith("/api/admin/")){
      if(!await verifyAccess(request,env)&&!await verifyGitHubAdmin(request))return bad("Accès administrateur refusé",403);
      if(path==="/api/admin/comment-settings"&&method==="PUT"){
        const b=await request.json(),type=clean(b.type),id=clean(b.id);
        if(!allowedTypes.has(type)||!id||id.length>160||typeof b.enabled!=="boolean")return bad("Paramètres invalides");
        await db.prepare("INSERT INTO comment_settings(content_type,content_id,enabled) VALUES(?,?,?) ON CONFLICT(content_type,content_id) DO UPDATE SET enabled=excluded.enabled").bind(type,id,b.enabled?1:0).run();
        return json({ok:true},200,headers);
      }
      if(path==="/api/admin/comments"&&method==="GET"){
        const status=clean(u.searchParams.get("status"))||"pending";
        if(!["pending","approved","rejected"].includes(status))return bad("Statut invalide");
        return json({comments:(await db.prepare("SELECT * FROM comments WHERE status=? ORDER BY created_at DESC LIMIT 200").bind(status).all()).results},200,headers);
      }
      if(path==="/api/admin/comments"&&method==="PATCH"){
        const b=await request.json();if(!["approved","rejected"].includes(b.status)||!clean(b.id))return bad("Action invalide");
        await db.prepare("UPDATE comments SET status=?,moderated_at=datetime('now') WHERE id=?").bind(b.status,b.id).run();return json({ok:true},200,headers);
      }
      if(path==="/api/admin/comments/reply"&&method==="POST"){
        const b=await request.json(),parent=await db.prepare("SELECT content_type,content_id,status FROM comments WHERE id=?").bind(clean(b.parent_id)).first(),body=clean(b.body);
        if(!parent||parent.status!=="approved"||body.length<2||body.length>3000)return bad("Réponse invalide");
        await db.prepare("INSERT INTO comments(id,content_type,content_id,author_name,body,status,parent_id,is_author_reply,moderated_at) VALUES(?,?,?,?,?,'approved',?,1,datetime('now'))").bind(uid(),parent.content_type,parent.content_id,"AUPOSITEUR",body,clean(b.parent_id)).run();
        return json({ok:true},201,headers);
      }
      if(path==="/api/admin/comments"&&method==="DELETE"){
        const id=clean((await request.json()).id);if(!id)return bad("Identifiant requis");
        await db.prepare("DELETE FROM comments WHERE id=?").bind(id).run();return json({ok:true},200,headers);
      }
      if(path==="/api/admin/subscribers"&&method==="DELETE"){
        const id=clean((await request.json()).id);if(!id)return bad("Identifiant requis");
        await db.prepare("DELETE FROM subscribers WHERE id=?").bind(id).run();return json({ok:true},200,headers);
      }
      if(path==="/api/admin/campaigns/test"&&method==="POST"){
        const b=await request.json(),email=clean(b.email).toLowerCase(),id=clean(b.id);
      if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return bad("Adresse de test invalide");
        const campaign=await db.prepare("SELECT subject,body_html,body_text FROM campaigns WHERE id=? AND status='draft'").bind(id).first();
        if(!campaign)return bad("Brouillon introuvable");
        await sendMail(env,email,"[TEST] "+campaign.subject,campaign.body_html, "[TEST] "+campaign.body_text);
        return json({ok:true},200,headers);
      }
      if(path==="/api/admin/subscribers"&&method==="GET")return json({subscribers:(await db.prepare("SELECT id,email,status,consent_at,confirmed_at,unsubscribed_at FROM subscribers ORDER BY created_at DESC LIMIT 500").all()).results},200,headers);
      if(path==="/api/admin/campaigns"&&method==="GET")return json({campaigns:(await db.prepare("SELECT id,subject,content_type,content_id,status,created_at,sent_at FROM campaigns ORDER BY created_at DESC LIMIT 100").all()).results},200,headers);
      if(path==="/api/admin/campaigns"&&method==="POST"){
        const b=await request.json(),subject=clean(b.subject),body=clean(b.body_text);
        if(subject.length<3||subject.length>180||body.length<5||body.length>15000)return bad("Campagne invalide");
        const id=uid();
        await db.prepare("INSERT INTO campaigns(id,content_type,content_id,subject,body_html,body_text) VALUES(?,?,?,?,?,?)").bind(id,allowedTypes.has(b.content_type)||b.content_type==="livres"?b.content_type:null,clean(b.content_id)||null,subject,"<p>"+esc(body).replace(/\n/g,"<br>")+"</p>",body).run();
        return json({id,status:"draft"},201,headers);
      }
      if(path==="/api/admin/campaigns/queue"&&method==="POST"){
        const b=await request.json(),id=clean(b.id);
        const c=await db.prepare("SELECT id,status FROM campaigns WHERE id=?").bind(id).first();
        if(!c||c.status!=="draft")return bad("Seul un brouillon peut être programmé",409);
        await db.prepare("UPDATE campaigns SET status='queued',approved_at=datetime('now') WHERE id=? AND status='draft'").bind(id).run();
        await db.prepare("INSERT OR IGNORE INTO campaign_deliveries(campaign_id,subscriber_id) SELECT ?,id FROM subscribers WHERE status='active'").bind(id).run();
        return json({ok:true,status:"queued"},200,headers);
      }
    }
    return bad("Route inconnue",404);
  }catch(e){console.error("community API",e);return bad("Erreur serveur",500)}
}};
