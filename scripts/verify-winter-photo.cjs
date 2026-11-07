// Opt-in preview build check. Fixed synthetic image only; no participants or DB calls.
if(process.env.FHS_PHOTO_SMOKE_TEST!=='1')process.exit(0)
if(process.env.VERCEL_ENV!=='preview')throw Error('Photo smoke test requires a preview build')
require('../tests/register-ts.cjs')
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict')
const {recognizeApplicationPhotos}=require('../lib/winter-photo-recognition.ts')
const bytes=fs.readFileSync(path.join(__dirname,'../tests/fixtures/photo-application-synthetic.png'))
;(async()=>{
 const result=await recognizeApplicationPhotos([{name:'photo-application-synthetic.png',digest:crypto.createHash('sha256').update(bytes).digest('hex'),dataUrl:'data:image/png;base64,'+bytes.toString('base64')}])
 const a=result.application
 assert.equal(a.club,'PHOTO TEST CLUB');assert.equal(a.people.filter(p=>p.kind==='rider').length,2);assert.equal(a.people.filter(p=>p.kind==='horse').length,1)
 assert.equal(a.entries.length,2);assert.deepEqual(a.entries.map(e=>e.competition),['5','5']);assert.equal(a.entries[0].horse,a.entries[1].horse);assert.notEqual(a.entries[0].rider,a.entries[1].rider)
 assert(a.entries.every(e=>e.rider&&e.horse));assert.equal(a.amounts.total,'28000');assert.equal(a.photoConfirmation,undefined)
 console.log('PHOTO_SMOKE_PASS '+JSON.stringify({model:result.model,generationId:result.generationId,riders:2,horses:1,entries:2,kind:'synthetic printed fixture; no real data; no writes'}))
})().catch(e=>{console.error('PHOTO_SMOKE_FAILED '+JSON.stringify({code:e.code||'assertion',message:e.message}));process.exitCode=1})
