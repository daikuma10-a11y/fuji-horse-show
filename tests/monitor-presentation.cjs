require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {connectPresentation,listenForPresentation,displayChannelName}=require('../lib/monitor-presentation')
const channel='winter-meeting-test', path='/winter/monitor#'+channel, peers=new Set()
class Channel {
 constructor(name){this.name=name;peers.add(this)}
 postMessage(data){for(const peer of peers)if(peer!==this&&peer.name===this.name)peer.onmessage?.({data})}
 close(){peers.delete(this)}
}
global.BroadcastChannel=Channel
class Connection extends EventTarget {
 state='connected';id='display-1'
 send(message){this.peer.dispatchEvent(new MessageEvent('message',{data:message}))}
 terminate(){for(const c of [this,this.peer]){c.state='terminated';c.dispatchEvent(new Event('terminate'))}}
}
const admin=new Connection(),screen=new Connection()
admin.peer=screen;screen.peer=admin
const list=new EventTarget();list.connections=[screen]
Object.defineProperty(navigator,'presentation',{configurable:true,value:{receiver:{connectionList:Promise.resolve(list)}}})
const storage=new Map()
const events=new EventTarget()
let starts=0,reconnects=0
global.window=Object.assign(events,{
 location:new URL('https://winter.test/winter/admin'),
 sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 PresentationRequest:class {
  constructor(url){const target=new URL(url);assert.equal(target.origin,'https://winter.test');assert.equal(target.searchParams.get('presentation'),'1');assert.equal(target.hash,'#'+channel)}
  async start(){starts++;return admin}
  async reconnect(id){reconnects++;assert.equal(id,'display-1');return admin}
 }
})
;(async()=>{
 assert.equal(await connectPresentation(channel,path,true),undefined)
 const [one,two]=await Promise.all([connectPresentation(channel,path),connectPresentation(channel,path)])
 assert.equal(one,two);assert.equal(starts,1)
 window.location=new URL('https://winter.test/winter/monitor?presentation=1#'+channel)
 const receive=listenForPresentation(channel)
 await Promise.resolve()
 const remote=[],local=[]
 const content=new Channel(displayChannelName(channel)),control=new Channel(channel)
 content.onmessage=e=>remote.push(e.data);control.onmessage=e=>local.push(e.data)
 for(const event of ['blur','visibilitychange','beforeprint','afterprint'])window.dispatchEvent(new Event(event))
 for(const data of [{kind:'meeting-preview',state:{day:1}},{kind:'monitor-scroll',x:0,y:450},{kind:'monitor-font',size:22},{kind:'monitor-published',state:{day:2}}]){
  control.postMessage(data);assert.deepEqual(remote.pop(),data)
 }
 content.postMessage({kind:'monitor-status',y:450,fullscreen:true});assert.equal(local.at(-1).fullscreen,true)
 content.postMessage({kind:'meeting-query'});assert.equal(local.at(-1).kind,'meeting-query')
 control.postMessage({kind:'unrelated'});assert.equal(remote.length,0)
 assert.equal(admin.state,'connected');assert.equal(starts,1)
 assert.equal(await connectPresentation(channel,path,true),admin);assert.equal(reconnects,0)
 admin.terminate();assert.equal(storage.size,0);control.postMessage({kind:'monitor-scroll',y:100});assert.equal(remote.length,0)
 receive();content.close();control.close();assert.equal(peers.size,0)
 console.log('PASS: independent display is reused across admin actions; isolated scroll, font, meeting and official data; explicit end detaches only its session')
})().catch(e=>{console.error(e);process.exitCode=1})
