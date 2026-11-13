require('./register-ts.cjs')
const assert = require('node:assert/strict')
const React = require('react')
const { useAudienceFullscreen, MonitorFullscreenButton } = require('../components/master/monitor-fullscreen')

const origin = 'https://winter.test'
const channel = 'test-monitor'
const path = '/winter/monitor'
const cleanup = []
function context(win, fn) {
 const previous = global.window
 global.window = win
 try { return fn() } finally { global.window = previous }
}
function makeWindow(path) {
 const events = new Map()
 const win = {
  location: new URL(path, origin), top: null, parent: null, opener: null,
  addEventListener: (kind, fn) => events.set(kind, fn),
  removeEventListener: kind => events.delete(kind),
  setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
  receive(data, source, senderOrigin = origin) {
   return context(win, () => events.get('message')?.({data, source, origin: senderOrigin}))
  }
 }
 win.top = win.parent = win
 return win
}
const admin = makeWindow('/winter/admin'), audience = makeWindow(path), preview = makeWindow(path+'?control=1')
audience.opener = admin
preview.parent = admin
let requests = 0, delegated, replies = [], hints = []
React.useRef = initial => ({current: initial})
React.useState = initial => [initial, value => hints.push(value)]
React.useEffect = setup => { const close = setup(); if (close) cleanup.push(close) }
React.useCallback = fn => fn
global.document = {fullscreenElement:null, documentElement:{requestFullscreen:async()=>{
 assert.equal(global.window, audience, 'only the audience can enter fullscreen')
 requests++
 global.document.fullscreenElement = global.document.documentElement
}}}
admin.postMessage = (data, destination) => {
 assert.equal(destination, origin)
 replies.push(data)
 admin.receive(data, audience)
}
audience.postMessage = (data, options) => {
 assert.deepEqual(options,{targetOrigin:origin,delegate:'fullscreen'})
 delegated = audience.receive(data,admin)
}
const control = context(admin,()=>useAudienceFullscreen(channel,path))
context(audience,()=>MonitorFullscreenButton({channel,fullscreen:false,preview:false}))
const button = context(preview,()=>MonitorFullscreenButton({channel,fullscreen:false,preview:true})).props.children[0]
async function main() {
 const request = {kind:'monitor-fullscreen-request', channel}
 await audience.receive(request, admin, 'https://other.test')
 await audience.receive(request, preview)
 await audience.receive({...request,channel:'other'},admin)
 assert.equal(requests,0)
 preview.frameElement = {dispatchEvent(event){
  assert.equal(event.type,'monitor-preview-fullscreen')
  assert.ok(event.bubbles)
  context(admin,control.request)
 }}
 context(preview,button.props.onClick)
 await delegated
 assert.equal(requests,1)
 assert.equal(replies.at(-1).fullscreen,true)
 global.document.fullscreenElement=null
 global.document.documentElement.requestFullscreen=async()=>{throw Error('refused')}
 context(admin,control.request)
 await delegated
 assert.equal(replies.at(-1).fullscreen,false)
 assert.match(hints.at(-1),/外部モニター側/)
 audience.closed=true
 context(admin,control.request)
 assert.match(hints.at(-1),/同じパソコン/)
 console.log('PASS preview delegation, matching opener/origin/channel, confirmed success, rejection and closed-window guidance')
}
main().catch(error=>{console.error(error);process.exitCode=1})
