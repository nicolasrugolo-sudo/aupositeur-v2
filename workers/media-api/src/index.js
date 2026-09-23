import { AwsClient } from 'aws4fetch';

const ALLOWED_ORIGINS = new Set([
  'https://www.aupositeur.be',
  'https://aupositeur.be',
  'https://aupositeur-site.pages.dev',
]);
const MAX_AUDIO_BYTES = 95 * 1024 * 1024;
const AUDIO_PREFIX = 'audio/tracks/';
const AUDIO_EXTENSIONS = new Set(['mp3','wav','flac','m4a']);
const AUDIO_MIME_TYPES = new Set(['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/flac','audio/mp4','audio/x-m4a']);

const json=(data,status=200,origin='')=>{
  const headers={'content-type':'application/json; charset=UTF-8','cache-control':'no-store'};
  if(ALLOWED_ORIGINS.has(origin)){headers['access-control-allow-origin']=origin;headers.vary='Origin';}
  return new Response(JSON.stringify(data,null,2),{status,headers});
};
const isAdmin=(request,env)=>{
  const provided=request.headers.get('X-Aupositeur-Admin')||'';
  return Boolean(env.MEDIA_ADMIN_TOKEN)&&provided===env.MEDIA_ADMIN_TOKEN;
};
const safeStem=(name)=>String(name||'audio').replace(/\.[^.]+$/,'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'audio';
const extensionOf=(name)=>{const m=String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/);return m?m[1]:'';};
const makeAudioKeyFromName=(name)=>`${AUDIO_PREFIX}${safeStem(name)}-${crypto.randomUUID().slice(0,8)}.${extensionOf(name)||'mp3'}`;
const validAudioKey=(key)=>typeof key==='string'&&key.startsWith(AUDIO_PREFIX)&&!key.includes('..')&&AUDIO_EXTENSIONS.has(extensionOf(key));
const publicAudioUrl=(request,key)=>`${new URL(request.url).origin}/media/${key}`;

const validateAudio=(name,type,size)=>{
  const mimeAllowed=AUDIO_MIME_TYPES.has(type)||type==='application/octet-stream'||!type;
  if(!AUDIO_EXTENSIONS.has(extensionOf(name))||!mimeAllowed) return {status:415,error:'Unsupported audio format. Use MP3, WAV, FLAC or M4A.'};
  if(!Number.isFinite(size)||size<=0||size>MAX_AUDIO_BYTES) return {status:413,error:'Audio file must be between 1 byte and 95 MiB.'};
  return null;
};
const missingS3=(env)=>['R2_ACCOUNT_ID','R2_BUCKET_NAME','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'].filter((k)=>!env[k]);
const s3ObjectUrl=(env,key)=>{
  const encoded=key.split('/').map(encodeURIComponent).join('/');
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeURIComponent(env.R2_BUCKET_NAME)}/${encoded}`;
};

const handleCreateUploadUrl=async(request,env,origin)=>{
  if(!env.MEDIA_ASSETS) return json({error:'R2 binding MEDIA_ASSETS is missing'},503,origin);
  const missing=missingS3(env);
  if(missing.length) return json({error:'R2 S3 configuration is incomplete',missing},503,origin);
  let body; try{body=await request.json();}catch{return json({error:'Invalid JSON body'},400,origin);}
  const name=String(body?.name||'');
  const type=String(body?.type||'application/octet-stream');
  const size=Number(body?.size);
  const invalid=validateAudio(name,type,size);
  if(invalid) return json({error:invalid.error},invalid.status,origin);
  const requestedKey=String(body?.key||'');
  const key=requestedKey||makeAudioKeyFromName(name);
  if(!validAudioKey(key)) return json({error:'Invalid audio key'},400,origin);
  if(requestedKey&&extensionOf(requestedKey)!==extensionOf(name)) return json({error:'Replacement file extension must match the existing audio key.'},400,origin);

  const target=new URL(s3ObjectUrl(env,key));
  target.searchParams.set('X-Amz-Expires','600');
  const aws=new AwsClient({accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY,service:'s3',region:'auto'});
  const signed=await aws.sign(target,{method:'PUT',headers:{'Content-Type':type},aws:{signQuery:true}});
  return json({ok:true,key,uploadUrl:signed.url.toString(),method:'PUT',contentType:type,maxBytes:MAX_AUDIO_BYTES,expiresIn:600},200,origin);
};

const handleConfirmUpload=async(request,env,origin)=>{
  if(!env.MEDIA_ASSETS) return json({error:'R2 binding MEDIA_ASSETS is missing'},503,origin);
  let body; try{body=await request.json();}catch{return json({error:'Invalid JSON body'},400,origin);}
  const key=String(body?.key||'');
  const expectedSize=Number(body?.size);
  if(!validAudioKey(key)) return json({error:'Invalid audio key'},400,origin);
  const object=await env.MEDIA_ASSETS.head(key);
  if(!object) return json({error:'Uploaded audio object was not found in R2.'},404,origin);
  if(object.size<=0||object.size>MAX_AUDIO_BYTES){await env.MEDIA_ASSETS.delete(key);return json({error:'Uploaded audio exceeds the 95 MiB limit.'},413,origin);}
  if(Number.isFinite(expectedSize)&&expectedSize>0&&object.size!==expectedSize) return json({error:'Uploaded file size does not match the expected size.'},409,origin);
  return json({ok:true,key,url:publicAudioUrl(request,key),name:String(body?.name||key.split('/').pop()),mime:object.httpMetadata?.contentType||String(body?.type||'')||null,bytes:object.size,etag:object.httpEtag||null},200,origin);
};

const handleUpload=async(request,env,origin)=>{
  if(!env.MEDIA_ASSETS) return json({error:'R2 binding MEDIA_ASSETS is missing'},503,origin);
  let form; try{form=await request.formData();}catch{return json({error:'Invalid multipart form data'},400,origin);}
  const file=form.get('file');
  if(!(file instanceof File)) return json({error:'Missing file'},400,origin);
  const invalid=validateAudio(file.name,file.type,file.size);
  if(invalid) return json({error:invalid.error},invalid.status,origin);
  const requestedKey=String(form.get('key')||'');
  const key=requestedKey||makeAudioKeyFromName(file.name);
  if(!validAudioKey(key)) return json({error:'Invalid audio key'},400,origin);
  await env.MEDIA_ASSETS.put(key,file.stream(),{httpMetadata:{contentType:file.type||'application/octet-stream',cacheControl:'public, max-age=60, must-revalidate'},customMetadata:{originalName:file.name,kind:'public-audio',uploadedAt:new Date().toISOString()}});
  const object=await env.MEDIA_ASSETS.head(key);
  return json({ok:true,key,url:publicAudioUrl(request,key),name:file.name,mime:object?.httpMetadata?.contentType||file.type||null,bytes:object?.size??file.size,etag:object?.httpEtag||null},requestedKey?200:201,origin);
};

const handleList=async(env,origin)=>{
  if(!env.MEDIA_ASSETS) return json({error:'R2 binding MEDIA_ASSETS is missing'},503,origin);
  const listed=await env.MEDIA_ASSETS.list({prefix:AUDIO_PREFIX,limit:1000,include:['httpMetadata','customMetadata']});
  const files=listed.objects.sort((a,b)=>new Date(b.uploaded)-new Date(a.uploaded)).map((o)=>({key:o.key,bytes:o.size,uploaded:o.uploaded,etag:o.httpEtag,mime:o.httpMetadata?.contentType||null,name:o.customMetadata?.originalName||o.key.split('/').pop()}));
  return json({ok:true,files,truncated:listed.truncated},200,origin);
};

const serveAudio=async(request,env,key)=>{
  if(!env.MEDIA_ASSETS||!validAudioKey(key)) return new Response('Not found',{status:404});
  const object=await env.MEDIA_ASSETS.get(key,{onlyIf:request.headers,range:request.headers});
  if(!object) return new Response('Not found',{status:404});
  const headers=new Headers(); object.writeHttpMetadata(headers);
  headers.set('etag',object.httpEtag); headers.set('accept-ranges','bytes'); headers.set('access-control-allow-origin','*'); headers.set('cache-control','public, max-age=60, must-revalidate');
  if(!('body' in object)) return new Response(null,{status:412,headers});
  if(object.range){
    const offset=object.range.offset??0; const length=object.range.length??Math.max(0,object.size-offset);
    headers.set('content-range',`bytes ${offset}-${offset+length-1}/${object.size}`); headers.set('content-length',String(length));
    return new Response(object.body,{status:206,headers});
  }
  headers.set('content-length',String(object.size)); return new Response(object.body,{status:200,headers});
};

export default {
  async fetch(request,env){
    const url=new URL(request.url); const origin=request.headers.get('Origin')||'';
    if(request.method==='OPTIONS'){
      if(!ALLOWED_ORIGINS.has(origin)) return new Response(null,{status:403});
      return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Content-Type, X-Aupositeur-Admin','access-control-max-age':'86400',vary:'Origin'}});
    }
    if(request.method==='GET'&&url.pathname==='/') return json({service:'aupositeur-media-api',status:'ok',audioStorage:Boolean(env.MEDIA_ASSETS),directUpload:missingS3(env).length===0,maxAudioBytes:MAX_AUDIO_BYTES},200,origin);
    if(request.method==='GET'&&url.pathname.startsWith('/media/audio/tracks/')) return serveAudio(request,env,url.pathname.slice('/media/'.length));
    if(url.pathname.startsWith('/admin/')){
      if(!isAdmin(request,env)) return json({error:'Unauthorized'},401,origin);
      if(request.method==='GET'&&url.pathname==='/admin/audio-files') return handleList(env,origin);
      if(request.method==='POST'&&url.pathname==='/admin/audio-files/upload-url') return handleCreateUploadUrl(request,env,origin);
      if(request.method==='POST'&&url.pathname==='/admin/audio-files/confirm') return handleConfirmUpload(request,env,origin);
      if(request.method==='POST'&&url.pathname==='/admin/audio-files/upload') return handleUpload(request,env,origin);
    }
    return json({error:'Not found'},404,origin);
  },
};
