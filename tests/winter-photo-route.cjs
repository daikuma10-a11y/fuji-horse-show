require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),originalLoad=Module._load
let reads=0,release,hold=false
const actual=require('../lib/winter-photo-recognition.ts')
Module._load=function(id,...args){if(id==='@/lib/winter-photo-recognition')return {...actual,recognizeApplicationPhotos:async()=>{reads++;if(hold)await new Promise(r=>release=r);return {application:{club:'SYNTHETIC ONLY'}}}};return originalLoad.call(this,id,...args)}
const {NextRequest}=require('next/server'),{POST}=require('../app/api/winter-application/photo/route.ts')
Module._load=originalLoad
let authCalls=0,role='admin',status=200
global.fetch=async(url,options)=>{authCalls++;assert.match(url,/\/auth\/v1\/user$/);assert.equal(options.method,undefined);return new Response(JSON.stringify({id:'synthetic-admin',app_metadata:{role}}),{status})}
const pages=[{name:'synthetic.png',digest:'a'.repeat(64),dataUrl:'data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,...Array(30).fill(0)]).toString('base64')}]
function request(headers={},body={pages}){return new NextRequest('https://synthetic.invalid/api/winter-application/photo',{method:'POST',headers:{origin:'https://synthetic.invalid','content-type':'application/json',authorization:'Bearer synthetic-token',...headers},body:JSON.stringify(body)})}
;(async()=>{
 assert.equal((await POST(request({authorization:''}))).status,401);assert.equal(authCalls,0)
 assert.equal((await POST(request({origin:'https://other.invalid'}))).status,403);assert.equal(authCalls,0)
 process.env.VERCEL_ENV='production';assert.equal((await POST(request())).status,403);delete process.env.VERCEL_ENV;assert.equal(authCalls,0)
 role='guest';assert.equal((await POST(request())).status,403);assert.equal(reads,0)
 role='admin';status=401;assert.equal((await POST(request())).status,401);assert.equal(reads,0);status=200
 assert.equal((await POST(request({'content-length':'4000000'}))).status,413)
 assert.equal((await POST(request({}, {pages:[{...pages[0],dataUrl:'https://other.invalid/private'}]}))).status,400)
 assert.equal((await POST(request({}, {pages,extra:'x'.repeat(3800000)}))).status,413);assert.equal(reads,0)
 hold=true;const first=POST(request());while(!release)await new Promise(r=>setImmediate(r))
 assert.equal((await POST(request())).status,429);assert.equal(reads,1);release();const response=await first
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{application:{club:'SYNTHETIC ONLY'}})
 hold=false;assert.equal((await POST(request())).status,200);assert.equal(reads,2)
 console.log('PASS: photo endpoint rejects missing/invalid admin, other origin, production, oversized and remote images; concurrent request blocked; no database writes')
})().catch(e=>{console.error(e);process.exitCode=1})
