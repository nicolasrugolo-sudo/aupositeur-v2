export async function verifyGitHubAdmin(request){
  const auth=request.headers.get("authorization")||"";
  const match=/^Bearer ([A-Za-z0-9_]{20,255})$/i.exec(auth);
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
