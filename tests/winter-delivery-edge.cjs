const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto')
const source=fs.readFileSync('supabase/functions/winter-self-settlement/index.ts','utf8'),proxyHash=source.match(/const PROXY_HASH='([a-f0-9]+)'/)[1],token='1'.repeat(64)
let handler,calls=[],valid=true
// Substitute only the synthetic proxy-secret digest; deployed source remains unchanged.
const crypto={getRandomValues:a=>webcrypto.getRandomValues(a),subtle:{digest:async(algorithm,bytes)=>new TextDecoder().decode(bytes)==='synthetic-secret'?Uint8Array.from(Buffer.from(proxyHash,'hex')).buffer:webcrypto.subtle.digest(algorithm,bytes)}}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://db.test':'synthetic-service'},serve:h=>handler=h},crypto,TextEncoder,Request,Response,AbortSignal,Uint8Array,fetch:async(url,options={})=>{calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer synthetic-service');return Response.json(url.includes('/rpc/')?{ack:true}:valid?[{token_hash:'valid'}]:[])}})
const req=body=>new Request('https://edge.test',{method:'POST',body:JSON.stringify(body)})
;(async()=>{
 assert.equal((await handler(req({proxySecret:'bad',action:'reception-offline',token}))).status,401);assert.equal(calls.length,0)
 assert.equal((await handler(req({proxySecret:'synthetic-secret',action:'reception-offline',token:'bad'}))).status,401);assert.equal(calls.length,0)
 valid=false;assert.equal((await handler(req({proxySecret:'synthetic-secret',action:'reception-offline',token}))).status,401);assert.equal(calls.length,1)
 valid=true;const source={draft:{synthetic:true},item:{},context:{},total:0},body={proxySecret:'synthetic-secret',action:'reception-offline',token,receiptId:'synthetic-receipt',source}
 assert.equal((await handler(req(body))).status,200);assert.match(calls.at(-1).url,/rpc\/receive_winter_offline_item$/)
 const sent=JSON.parse(calls.at(-1).options.body);assert.deepEqual(sent,{p_receipt_id:body.receiptId,p_source:source,p_token_hash:Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex')})
 assert.ok(!calls.at(-1).options.body.includes('synthetic-secret'))
 await handler(req({...body,action:'reception-confirm',items:[],total:0,name:'合成'}));assert.match(calls.at(-1).url,/rpc\/submit_winter_public_reception_batch$/,'existing action preserved')
 console.log('PASS: actual Edge source proxy-secret gate, token shape/expiry gate, dedicated receiver forwarding, hashed token, existing reception action retained; synthetic HTTP/credential digest')
})().catch(e=>{console.error(e);process.exitCode=1})
