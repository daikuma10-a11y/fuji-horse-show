// Synthetic roster names and IDs only; no database requests.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {rosterCandidates,normalizeApplicationName}=require('../lib/winter-application.ts')
const {searchIdentityCandidate}=require('../lib/master/identity-candidate-search.ts')
const fixture=require('./winter-application-fixture.cjs')
const horse={...fixture().people[1],name:'ハリーポッターD',reading:'',jef:''}
const entity=(id,name,more={})=>({id,kind:'horse',name,reading:'',jef_number:null,archived_at:null,...more})
const data={entities:[
 entity('one','ハリーポッター・Ｄ',{reading:'ハリーポッターディー',jef_number:'900001'}),
 entity('two','ハリポッター・D',{jef_number:'900002'}),
 entity('three','ハリーボーイ',{reading:'ハリーボーイ'}),
 entity('four','ライアン'),entity('rider','ハリーポッター・D',{kind:'rider'}),entity('archived','ハリーポッターD',{archived_at:'2020-01-01'})
],clubs:[{id:'club-a',name:'合成クラブA'},{id:'club-b',name:'合成クラブB'}],affiliations:[{entity_id:'one',club_id:'club-b',ended_at:null},{entity_id:'two',club_id:'club-a',ended_at:null}],participants:[]}
const before=JSON.stringify({horse,data})
for(const name of ['ハリーポッターD','ハリーポッター','ハリー','はりー','ﾊﾘｰﾎﾟｯﾀｰＤ']){
 const found=rosterCandidates({...horse,name},data,'',{similar:true})
 assert(found.some(c=>c.entity.id==='one'),name)
 assert(found.some(c=>c.entity.id==='two'),name)
 assert(!found.some(c=>['rider','archived','four'].includes(c.entity.id)))
}
const partial=rosterCandidates(horse,data,'合成クラブA',{similar:true,search:'ハリー'})
assert.deepEqual(new Set(partial.map(c=>c.entity.id)),new Set(['one','two','three']))
assert(partial.every(c=>c.reason.includes('一部')))
assert.deepEqual(rosterCandidates(horse,data,'',{search:'900001'}).map(c=>c.entity.id),['one'])
assert.deepEqual(new Set(rosterCandidates(horse,data,'',{search:'900'}).map(c=>c.entity.id)),new Set(['one','two']))
assert.equal(rosterCandidates(horse,data,'',{search:'・ー'}).length,0)
assert.equal(rosterCandidates({...horse,name:'ハ'},data,'',{similar:true}).length,0,'one-character partial queries do not suggest everyone')
assert.equal(rosterCandidates({...horse,name:'ロリポップ'},data,'',{similar:true}).length,0)
const numbered=rosterCandidates({...horse,jef:'900001'},data,'合成クラブA',{similar:true});assert.equal(numbered[0].entity.id,'one','number match outranks an in-club similar spelling')
assert.equal(numbered[0].reason,'日馬連番号一致')
assert.equal(rosterCandidates(horse,data,'').length,0,'broad suggestions do not alter the strict duplicate/identity gate')
assert.equal(normalizeApplicationName('ハリーポッターD')===normalizeApplicationName('ハリーポッター・D'),false,'search normalization is never identity normalization')
assert.equal(JSON.stringify({horse,data}),before)
assert(searchIdentityCandidate({name:'',reading:'はりーぽったーでぃー',jef:''},{name:'別の表記',reading:'ハリーポッターディー',jef:''}))
const rider={...fixture().people[0],name:'渡辺',reading:''}
assert.equal(rosterCandidates(rider,{...data,entities:[entity('person','渡辺 太郎',{kind:'rider'})]},'',{similar:true})[0].entity.id,'person')
console.log('PASS: punctuation/long-vowel/kana/width variants, partial names/readings/numbers, cross-club and missing-club suggestions, number ranking, archived/kind/short-query exclusion, no identity mutation or relaxed duplicate gate')
