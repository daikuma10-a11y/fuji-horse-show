// Render nested controls with the same lightweight hooks used by the checkout adapter tests.
// Preserve their state across renders until the selected paper changes or the controls unmount.
module.exports=function settlementViewRender(hooks,react){
 let previousKey,previewHooks
 return function expand(root){
  let found=false
  function visit(node){
   if(Array.isArray(node))return node.map(visit)
   if(!node?.props)return node
   if(node.type?.name==='ConsultNotice')return node.type(node.props)
   if(node.type?.name==='StatementPreview'){
    found=true
    if(!previewHooks||previousKey!==node.key){previewHooks=hooks();previousKey=node.key}
    const outer=react.useState
    react.useState=previewHooks.api.useState
    try{return previewHooks.render(()=>node.type(node.props))}finally{react.useState=outer}
   }
   return {...node,props:{...node.props,children:visit(node.props.children)}}
  }
  const result=visit(root)
  if(!found)previewHooks=null
  return result
 }
}
