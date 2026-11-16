// AUPOSITEUR community API — Cloudflare Worker, D1 and Brevo.
// Configure PUBLIC_ORIGIN, ACCESS_TEAM_DOMAIN, ACCESS_AUD, BREVO_API_KEY,
// SENDER_EMAIL and SENDER_NAME. No secret belongs in browser code.
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const allowedTypes=new Set(["ecrits","reflexions","musiques","citations"]);
const uid=()=>crypto.randomUUID();
const sha=async v=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const clean=v=>typeof v==="string"?v.trim():"";
const originOf=env=>env.PUBLIC_ORIGIN||"https://www.aupositeur.be";
const cors=(env,request)=>({"access-control-allow-origin":originOf(env),"vary":"Origin"});
const urlToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,"0")).join("");
const bad=(message,status=400)=>json({error:message},status);
async function verifyAccess(request,env){
  const token=request.headers.get("cf-access-jwt-assertion");
  if(!token||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)return false;
  try{
    const parts=token.split(".");if(parts.length!==3)return false;
    const decode=x=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(x.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0))));
    const header=decode(parts[0]),claims=decode(parts[1]);
    if(header.alg!=="RS256"||!claims.aud?.includes(env.ACCESS_AUD)||claims.exp*1000<Date.now()||claims.iss!==env.ACCESS_TEAM_DOMAIN.replace(/\/$/,""))return false;
    const keys=await (await fetch(env.ACCESS_TEAM_DOMAIN.replace(/\/$/,"")+"/cdn-cgi/access/certs")).json();
    const jwk=keys.keys.find(k=>k.kid===header.kid);if(!jwk)return false;
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    const sig=Uint8Array.from(atob(parts[2].replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
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
async function turnstile(env,token,ip){
  if(!env.TURNSTILE_SECRET)return false;
  const form=new FormData();form.set("secret",env.TURNSTILE_SECRET);form.set("response",token||"");if(ip)form.set("remoteip",ip);
  const res=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});
  return res.ok&&(await res.json()).success===true;
}
export default {async fetch(request,env){
  const u=new URL(request.url),path=u.pathname,method=request.method,origin=request.headers.get("origin");
  const headers=cors(env,request);
  if(method==="OPTIONS")return new Response(null,{status:204,headers:{...headers,"access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS","access-control-allow-headers":"content-type"}});
  if(origin&&origin!==originOf(env))return bad("Origine interdite",403);
  if(!env.COMMUNITY_DB)return bad("Base D1 non configurée",503);
  const db=env.COMMUNITY_DB;
  try{
    if(path==="/api/comments"&&method==="GET"){
      const type=clean(u.searchParams.get("type")),id=clean(u.searchParams.get("id"));
      if(!allowedTypes.has(type)||!id||id.length>160)return bad("Publication invalide");
      const r=await db.prepare("SELECT id,author_name,body,created_at,parent_id,is_author_reply FROM comments WHERE content_type=? AND content_id=? AND status='approved' ORDER BY created_at ASC LIMIT 100").bind(type,id).all();
      return json({comments:r.results},200,headers);
    }
    if(path==="/api/comments"&&method==="POST"){
      const b=await request.json(),type=clean(b.type),id=clean(b.id),name=clean(b.name),body=clean(b.body);
      if(!allowedTypes.has(type)||!id||id.length>160||name.length<2||name.length>80||body.length<3||body.length>3000)return bad("Champs invalides");
      if(!await turnstile(env,b.turnstile,request.headers.get("cf-connecting-ip")))return bad("Vérification anti-robot requise",403);
      await db.prepare("INSERT INTO comments(id,content_type,content_id,author_name,body) VALUES(?,?,?,?,?)").bind(uid(),type,id,name,body).run();
      return json({message:"Message reçu, en attente de modération."},202,headers);
    }
    if(path==="/api/subscribe"&&method==="POST"){
      const b=await request.json(),email=clean(b.email).toLowerCase();
      if(!b.consent||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)return bad("Adresse ou consentement invalide");
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
      const token=clean((await request.json()).token);if(!/^[a-f0-9]{64}$/.test(token))return bad("Lien invalide");
      const hash=await sha(token);
      const t=await db.prepare("SELECT subscriber_id FROM subscriber_tokens WHERE token_hash=? AND purpose='unsubscribe' AND used_at IS NULL").bind(hash).first();
      if(!t)return bad("Lien invalide ou déjà utilisé",410);
      await db.batch([db.prepare("UPDATE subscribers SET status='unsubscribed',unsubscribed_at=datetime('now') WHERE id=?").bind(t.subscriber_id),db.prepare("UPDATE subscriber_tokens SET used_at=datetime('now') WHERE token_hash=?").bind(hash)]);
      return json({message:"Vous êtes désinscrit."},200,headers);
    }
    if(path.startsWith("/api/admin/")){
      if(!await verifyAccess(request,env))return bad("Accès administrateur refusé",403);
      if(path==="/api/admin/comments"&&method==="GET"){
        const status=clean(u.searchParams.get("status"))||"pending";
        if(!["pending","approved","rejected"].includes(status))return bad("Statut invalide");
        return json({comments:(await db.prepare("SELECT * FROM comments WHERE status=? ORDER BY created_at DESC LIMIT 200").bind(status).all()).results},200,headers);
      }
      if(path==="/api/admin/comments"&&method==="PATCH"){
        const b=await request.json();if(!["approved","rejected"].includes(b.status)||!clean(b.id))return bad("Action invalide");
        await db.prepare("UPDATE comments SET status=?,moderated_at=datetime('now') WHERE id=?").bind(b.status,b.id).run();return json({ok:true},200,headers);
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
