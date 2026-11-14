/** Self-contained so the standalone print window and React paper use exactly the same fit. */
export function fitSettlementPaper(root:ParentNode){
 const cells=Array.from(root.querySelectorAll<HTMLElement>('.checkout-paper th,.checkout-paper td'))
 const spans=cells.map(cell=>{
  let span=cell.querySelector<HTMLElement>('[data-statement-fit]')
  if(!span){span=cell.ownerDocument.createElement('span');span.dataset.statementFit='';span.textContent=cell.textContent;cell.replaceChildren(span)}
  span.style.display='block';span.style.whiteSpace='nowrap';span.style.fontSize='';span.style.lineHeight='1.25'
  return {cell,span}
 })
 const sizes=spans.map(({cell,span})=>{
  const available=span.clientWidth
  if(!available)return null
  const range=cell.ownerDocument.createRange();range.selectNodeContents(span)
  const width=range.getBoundingClientRect().width
  const base=parseFloat(cell.ownerDocument.defaultView!.getComputedStyle(cell).fontSize)
  return width>available?{span,size:Math.max(1,base*available/width*.98)}:null
 })
 for(const item of sizes)if(item)item.span.style.fontSize=item.size+'px'
}
