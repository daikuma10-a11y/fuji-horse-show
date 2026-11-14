require('./register-ts.cjs')
const assert=require('node:assert/strict'),vm=require('node:vm')
const {fitSettlementPaper}=require('../lib/master/settlement-fit')
const cells=[]
const doc={defaultView:{getComputedStyle:cell=>({fontSize:cell.base+'px'})},createElement:()=>({dataset:{},style:{}}),createRange:()=>{let span;return{selectNodeContents:s=>span=s,getBoundingClientRect:()=>({width:span.textContent.length*(parseFloat(span.style.fontSize)||span.cell.base)*.7})}}}
for(const [text,width] of [['第26競技 とても長い競技名から別のとても長い競技名への変更',90],['長い選手の名前と変更後の選手の名前',70],['OP参加 ／ 競技料4,000円＋追加料3,000円',55],['¥7,000',100],['保存後の入金\n今回精算で差引済み',60],['隠れた明細',0]]){
 const cell={base:12,ownerDocument:doc,textContent:text,span:null,querySelector:()=>cell.span,replaceChildren:span=>{cell.span=span;span.cell=cell;Object.defineProperty(span,'clientWidth',{get:()=>cell.width})},width};cells.push(cell)
}
const root={querySelectorAll:()=>cells},original=cells.map(c=>c.textContent)
fitSettlementPaper(root)
for(const cell of cells){assert.equal(cell.span.textContent,cell.textContent);assert.equal(cell.span.style.whiteSpace,'nowrap');if(cell.width)assert.ok(cell.textContent.length*(parseFloat(cell.span.style.fontSize)||cell.base)*.7<=cell.width)}
assert.equal(cells[3].span.style.fontSize,'','Short amounts keep their original size')
// Printing uses a different base font and page width, then screen restoration fits again.
for(const c of cells){c.base=9;c.width=45}
vm.runInNewContext('('+fitSettlementPaper.toString()+')(root)',{root})
for(const cell of cells)assert.ok(cell.textContent.length*(parseFloat(cell.span.style.fontSize)||cell.base)*.7<=cell.width)
assert.deepEqual(cells.map(c=>c.span.textContent),original,'Nothing is truncated or replaced by ellipses')
console.log('PASS: single-line cell fitting preserves all text, shrinks only long fields, handles hidden papers and print-width/font changes, same self-contained routine in print window')
