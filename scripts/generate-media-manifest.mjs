import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

const root=process.cwd();
const publicDir=join(root,'public');
const imageDir=join(publicDir,'images');
const videoDir=join(publicDir,'videos','citations');
const imageExt=new Set(['.jpg','.jpeg','.png','.webp','.gif','.avif','.svg']);
const videoExt=new Set(['.mp4','.webm','.mov','.m4v']);

async function scan(dir,allowed){
  const out=[];
  async function walk(current){
    let entries=[]; try{entries=await readdir(current,{withFileTypes:true});}catch{return;}
    for(const entry of entries){
      const full=join(current,entry.name);
      if(entry.isDirectory()) await walk(full);
      else if(entry.isFile()&&allowed.has(extname(entry.name).toLowerCase())){
        const s=await stat(full);
        const rel=relative(publicDir,full).split('\\').join('/');
        out.push({name:entry.name,url:'/'+rel,path:'public/'+rel,bytes:s.size});
      }
    }
  }
  await walk(dir);
  return out.sort((a,b)=>a.name.localeCompare(b.name,'fr'));
}

const images=await scan(imageDir,imageExt);
const rawVideos=await scan(videoDir,videoExt);
// Legacy Unicode/ASCII copies can coexist. Keep every physical file visible;
// the manifest is regenerated on every production build.
const videos=rawVideos;
const manifest={generatedAt:new Date().toISOString(),images,videos};
await writeFile(join(publicDir,'admin','media-manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(`MEDIA MANIFEST : ${images.length} images · ${videos.length} videos`);
