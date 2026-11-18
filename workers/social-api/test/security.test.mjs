import test from "node:test";
import assert from "node:assert/strict";
import worker from "../index.js";
const base="https://social.example/api/admin/social/";
const request=(path,options={})=>new Request(base+path,options);
test("anonymous requests are rejected before touching D1",async()=>{
 const env={DB:{prepare(){throw Error("Database must not be accessed")}}};
 for(const path of ["health","posts","calendar"]){
  const response=await worker.fetch(request(path),env);
  assert.equal(response.status,403);
  assert.equal(response.headers.get("cache-control"),"no-store");
 }
});
test("forged bearer and unsigned Access tokens are rejected",async()=>{
 const env={ACCESS_TEAM_DOMAIN:"example.cloudflareaccess.com",ACCESS_AUD:"test",ADMIN_EMAIL:"admin@example.com"};
 for(const headers of [{"authorization":"Bearer forged"},{"cf-access-jwt-assertion":"a.b.c"}]){
  const response=await worker.fetch(request("posts",{headers}),env);
  assert.equal(response.status,403);
 }
});
test("unrecognized route is not a backdoor",async()=>{
 const response=await worker.fetch(new Request("https://social.example/anything"),{});
 assert.equal(response.status,404);
});
test("POST is rejected before authentication",async()=>{
 const response=await worker.fetch(request("posts",{method:"POST"}),{});
 assert.equal(response.status,403);
});

test("Access session cookies without valid signatures are rejected",async()=>{
 const env={ACCESS_TEAM_DOMAIN:"example.cloudflareaccess.com",ACCESS_AUD:"test",ADMIN_EMAIL:"admin@example.com"};
 for(const cookie of ["CF_Authorization=forged","other=abc; CF_Authorization=a.b.c","CF_Authorization="]){
  const response=await worker.fetch(request("health",{headers:{cookie}}),env);
  assert.equal(response.status,403);
 }
});
test("a forged Access assertion cannot be bypassed with a session cookie",async()=>{
 const env={ACCESS_TEAM_DOMAIN:"example.cloudflareaccess.com",ACCESS_AUD:"test",ADMIN_EMAIL:"admin@example.com"};
 const response=await worker.fetch(request("health",{headers:{"cf-access-jwt-assertion":"forged","cookie":"CF_Authorization=a.b.c"}}),env);
 assert.equal(response.status,403);
});
