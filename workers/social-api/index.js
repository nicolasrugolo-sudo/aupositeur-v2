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
 try{
  const parts=token.split(".");if(parts.length!==3)return reject("malformed_token");
  const header=decodePart(parts[0]),claims=decodePart(parts[1]);
  const domain=env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
  if(header.alg!=="RS256"||!header.kid)return reject("invalid_header");
  if(claims.iss!=="https://"+domain)return reject("issuer_mismatch");
  if(!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD))return reject("audience_mismatch");
  if(typeof claims.exp!=="number"||claims.exp*1000<=Date.now()||typeof claims.nbf==="number"&&claims.nbf*1000>Date.now()||typeof claims.iat==="number"&&claims.iat*1000>Date.now()+60000)return reject("invalid_token_time");
  if(typeof claims.email!=="string"||claims.email.toLowerCase()!==env.ADMIN_EMAIL.toLowerCase())return reject("email_mismatch");
  const certs=await fetch("https://"+domain+"/cdn-cgi/access/certs",{redirect:"error"});
  if(!certs.ok)return reject("jwks_unavailable");
  const keys=await certs.json();const jwk=keys.keys?.find(k=>k.kid===header.kid);
  if(!jwk||jwk.kty!=="RSA")return reject("signing_key_not_found");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const signature=Uint8Array.from(atob(parts[2].replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(parts[2].length/4)*4,"=")),c=>c.charCodeAt(0));
  if(!await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,signature,new TextEncoder().encode(parts[0]+"."+parts[1])))return reject("invalid_signature");
  return true;
 }catch{return reject("validation_exception");}
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith("/api/admin/social/"))return respond({error:"Not found"},404);
  if(!(await authorized(request,env)))return respond({error:"Forbidden"},403);
  if(request.method!=="GET")return respond({error:"Method not allowed; publishing disabled"},405);
  if(!env.DB)return respond({error:"Database binding unavailable"},503);
  try{
   if(url.pathname==="/api/admin/social/health")return respond({ok:true,service:"aupositeur-social-api",publishing_enabled:false});
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
