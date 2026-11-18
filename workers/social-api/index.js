// Private AUPOSITEUR Social Studio API.
// No write or publish endpoints until explicit security and integration tests pass.
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const decodePart=part=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=")),c=>c.charCodeAt(0))));
async function authorized(request,env){
 const reject=reason=>{console.warn("social_access_denied",reason);return false;};
 const assertion=request.headers.get("cf-access-jwt-assertion");
 const cookie=request.headers.get("cookie")||"";
 const sessionToken=cookie.split(";").map(part=>part.trim()).find(part=>part.startsWith("CF_Authorization="));
 const token=assertion||(sessionToken?sessionToken.slice("CF_Authorization=".length):null);
 if(!token)return reject("missing_token");
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.ADMIN_EMAIL)return reject("missing_configuration");
 let stage="decode_jwt";
 try{
  const parts=token.split(".");if(parts.length!==3)return reject("malformed_token");
  const header=decodePart(parts[0]),claims=decodePart(parts[1]);
  const domain=env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
  if(header.alg!=="RS256"||!header.kid)return reject("invalid_header");
  if(claims.iss!=="https://"+domain)return reject("issuer_mismatch");
  if(!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD))return reject("audience_mismatch");
  if(typeof claims.exp!=="number"||claims.exp*1000<=Date.now()||typeof claims.nbf==="number"&&claims.nbf*1000>Date.now()||typeof claims.iat==="number"&&claims.iat*1000>Date.now()+60000)return reject("invalid_token_time");
  if(typeof claims.email!=="string"||claims.email.toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())return reject("email_mismatch");
  stage="fetch_jwks";
  const certs=await fetch("https://"+domain+"/cdn-cgi/access/certs",{redirect:"manual"});
  if(!certs.ok)return reject("jwks_unavailable");
  stage="parse_jwks";
  const keys=await certs.json();const jwk=keys.keys?.find(k=>k.kid===header.kid);
  if(!jwk||jwk.kty!=="RSA")return reject("signing_key_not_found");
  stage="import_key";
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  stage="decode_signature";
  const signature=Uint8Array.from(atob(parts[2].replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(parts[2].length/4)*4,"=")),c=>c.charCodeAt(0));
  stage="verify_signature";
  if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,signature,new TextEncoder().encode(parts[0]+"."+parts[1])))return reject("invalid_signature");
  return true;
 }catch(error){
  // Diagnostic only: never log the token, request headers, claims, or secret values.
  const type=error instanceof Error?error.name:"unknown";
  const detail=stage==="fetch_jwks"&&error instanceof Error?String(error.message).slice(0,180).replace(/https?:\/\/[^\s]+/g,"[url]"):"";
  console.warn("social_access_validation_exception",stage,type,detail);
  return reject("validation_exception_"+stage+"_"+type);
 }
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith("/api/admin/social/"))return respond({error:"Not found"},404);
  if(!(await authorized(request,env)))return respond({error:"Forbidden"},403);
  if(request.method==="POST"&&url.pathname==="/api/admin/social/posts"){
   // Browser-origin and content-type checks mitigate cross-site form submissions.
   if(request.headers.get("origin")!==url.origin)return respond({error:"Origin not allowed"},403);
   if(!(request.headers.get("content-type")||"").toLowerCase().startsWith("application/json"))return respond({error:"JSON required"},415);
   if(!env.DB)return respond({error:"Database binding unavailable"},503);
   let body;try{body=await request.json();}catch{return respond({error:"Invalid JSON"},400);}
   if(!body||typeof body!=="object"||Array.isArray(body))return respond({error:"Invalid draft"},400);
   const types=["citation","ecrit","reflexion","musique","livre","original"];
   if(!types.includes(body.source_type)||typeof body.caption!=="string"||!body.caption.trim()||body.caption.length>5000)return respond({error:"Invalid source or caption (1–5000 characters)"},400);
   if(body.source_id!=null&&(typeof body.source_id!=="string"||body.source_id.length>300))return respond({error:"Invalid source reference"},400);
   if(body.media_reference!=null&&(typeof body.media_reference!=="string"||body.media_reference.length>1000))return respond({error:"Invalid media reference"},400);
   const id=crypto.randomUUID();
   try{
    await env.DB.prepare("INSERT INTO social_posts (id,source_type,source_id,caption,media_reference) VALUES (?,?,?,?,?)").bind(id,body.source_type,body.source_id||null,body.caption.trim(),body.media_reference||null).run();
    return respond({id,status:"draft",publishing_enabled:false},201);
   }catch{return respond({error:"Draft storage unavailable"},503);}
  }
  if(request.method!=="GET")return respond({error:"Method not allowed; publishing disabled"},405);
  if(!env.DB)return respond({error:"Database binding unavailable"},503);
  try{
   if(url.pathname==="/api/admin/social/health")return respond({ok:true,service:"aupositeur-social-api",publishing_enabled:false});
   if(url.pathname==="/api/admin/social/overview"){
    const [posts,accounts,targets]=await Promise.all([
     env.DB.prepare("SELECT COUNT(*) AS total FROM social_posts").first(),
     env.DB.prepare("SELECT connection_status,COUNT(*) AS total FROM social_accounts GROUP BY connection_status").all(),
     env.DB.prepare("SELECT status,COUNT(*) AS total FROM social_targets GROUP BY status").all()
    ]);
    return respond({posts:Number(posts?.total||0),accounts:accounts.results,targets:targets.results,publishing_enabled:false});
   }
   if(url.pathname==="/api/admin/social/accounts"){
    const {results}=await env.DB.prepare("SELECT id,platform,display_name,connection_status FROM social_accounts ORDER BY platform,display_name").all();
    return respond({accounts:results});
   }
   if(url.pathname==="/api/admin/social/posts"){
    const {results}=await env.DB.prepare("SELECT id,source_type,source_id,caption,media_reference,created_at,updated_at FROM social_posts ORDER BY created_at DESC LIMIT 100").all();
    return respond({posts:results});
   }
   if(url.pathname==="/api/admin/social/calendar"){
    const {results}=await env.DB.prepare("SELECT t.id,t.post_id,t.account_id,t.scheduled_at_utc,t.timezone,t.status,t.approved_at,t.published_at,t.remote_post_id,p.source_type,p.source_id,p.caption,a.platform,a.display_name FROM social_targets t JOIN social_posts p ON p.id=t.post_id JOIN social_accounts a ON a.id=t.account_id ORDER BY t.scheduled_at_utc DESC LIMIT 200").all();
    return respond({entries:results});
   }
   return respond({error:"Not found"},404);
  }catch{return respond({error:"Social database unavailable or migrations pending"},503);}
 }
};
