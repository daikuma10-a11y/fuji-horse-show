// Hand-authored test data; no real Excel workbook, people or financial records.
const {WINTER_EVENT_ID}=require('../lib/winter-event.ts')
const origin=(sheet,cell,value)=>({sheet,cell,value})
module.exports=()=>({eventId:WINTER_EVENT_ID,fileName:'synthetic.xlsx',digest:'a'.repeat(64),club:'合成クラブ',clubOrigin:origin('選手名簿','D76','合成クラブ'),
 people:[
  {key:'r1',kind:'rider',name:'合成選手',reading:'ごうせいせんしゅ',jef:'',grade:'未登録',checked:false,sportsMember:'会員',instructorMember:'',qualified:false,origin:origin('選手名簿','B7','合成選手')},
  {key:'h1',kind:'horse',name:'合成馬',reading:'ごうせいうま',jef:'',grade:'',checked:false,sportsMember:'',instructorMember:'',qualified:false,origin:origin('馬匹名簿','B6','合成馬')}
 ],entries:[{key:'障害!J13:0',competition:'5',rider:'r1',horse:'h1',op:false,rawRider:'合成選手',rawHorse:'合成馬',origin:origin('障害','J13','合成選手')}],
 amounts:{horse:'14000',jump:'5000',dressage:'0',total:'19000'},amountOrigins:{horse:origin('申込集計書','F6','14000'),jump:origin('申込集計書','F7','5000'),dressage:origin('申込集計書','F8','0'),total:origin('申込集計書','F10','19000')},issues:[],sheets:['障害','馬場']})
