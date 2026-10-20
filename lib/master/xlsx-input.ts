import {unzipSync,strFromU8} from 'fflate'

export type InputCell={value:string;formula?:string;error?:boolean}
export type InputSheet={name:string;cells:Record<string,InputCell>;hidden:boolean}
export type InputBook={sheets:InputSheet[]}
const decode=(s:string)=>s.replace(/&#x([0-9a-f]+);|&#(\d+);|&(lt|gt|amp|quot|apos);/gi,(_,hex,dec,n)=>hex||dec?String.fromCodePoint(parseInt(hex||dec,hex?16:10)):({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[n as string]??''))
function attrs(s:string){const a:Record<string,string>={};for(const m of s.matchAll(/([\w:]+)\s*=\s*(["'])(.*?)\2/g))a[m[1]]=decode(m[3]);return a}
function text(s:string){return [...s.replace(/<rPh\b[\s\S]*?<\/rPh>/g,'').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m=>decode(m[1])).join('')}
/** Read values only. Never evaluate formulas, external references, macros, or links. */
export function readInputXlsx(bytes:Uint8Array):InputBook{
 if(bytes.byteLength>8_000_000)throw new Error('Excelは8MB以内で選択してください')
 let size=0,count=0
 const files=unzipSync(bytes,{filter:f=>{size+=f.originalSize;count++;if(size>24_000_000||count>2500)throw new Error('展開後のExcelが大きすぎます');return /^(?:\[Content_Types\]\.xml|xl\/.*\.xml|xl\/_rels\/workbook.xml.rels)$/.test(f.name)}})
 if(files['xl/vbaProject.bin']||Object.keys(files).some(k=>/externalLinks|vba/i.test(k)))throw new Error('マクロ・外部参照を含むExcelは対象外です')
 function xml(path:string){const b=files[path];if(!b)throw new Error(`Excelの構造を確認できません：${path}`);const s=strFromU8(b);if(/<!DOCTYPE|<!ENTITY|<\w+:worksheet|<\w+:workbook/i.test(s))throw new Error('このXML形式には対応していません');return s}
 const types=xml('[Content_Types].xml');if(/macroEnabled|vbaProject/i.test(types))throw new Error('マクロ付きファイルは対象外です')
 const strings=files['xl/sharedStrings.xml']?[...xml('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>text(m[1])):[]
 const targets:Record<string,string>={}
 for(const m of xml('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?\s*>/g)){const a=attrs(m[1]);if(a.TargetMode==='External')throw new Error('外部リンクを含むExcelは対象外です');targets[a.Id]=a.Target.startsWith('/')?a.Target.slice(1):'xl/'+a.Target.replace(/^\.\//,'')}
 const formats:Record<string,string>={};const styles=files['xl/styles.xml']?xml('xl/styles.xml'):''
 for(const m of styles.matchAll(/<numFmt\b([^>]*)\/?\s*>/g)){const a=attrs(m[1]);formats[a.numFmtId]=a.formatCode}
 const styleIds=[...(styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1]??'').matchAll(/<xf\b([^>]*)/g)].map(m=>attrs(m[1]).numFmtId)
 const sheets:InputSheet[]=[];let cellsRead=0
 for(const m of xml('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?\s*>/g)){
  const a=attrs(m[1]),path=targets[a['r:id']];if(!path||!/^xl\/worksheets\/[\w.-]+\.xml$/.test(path))throw new Error('シートの参照先を確認できません')
  if(sheets.length>=32)throw new Error('シートは32枚以内です')
  const cells:Record<string,InputCell>={}
  for(const c of xml(path).matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
   if(++cellsRead>100000)throw new Error('セル数が多すぎます')
   const ca=attrs(c[1]),body=c[2]??'',v=body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]??''
   if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ca.r))throw new Error('セル位置が不正です')
   if(ca.t==='s'&&!/^\d+$/.test(v))throw new Error('共有文字列の番号が不正です')
   let value=ca.t==='s'?strings[Number(v)]:ca.t==='inlineStr'?text(body):decode(v)
   if(value===undefined)throw new Error('共有文字列が見つかりません')
   const format=formats[styleIds[Number(ca.s??0)]]
   if(!ca.t&&format&&/^0{2,20}$/.test(format)&&/^\d+$/.test(value))value=value.padStart(format.length,'0')
   cells[ca.r]={value,...(/<f\b/.test(body)?{formula:decode(body.match(/<f\b[^>]*>([\s\S]*?)<\/f>/)?.[1]??'共有数式')}:{}),...(ca.t==='e'?{error:true}:{})}
  }
  sheets.push({name:a.name,cells,hidden:a.state==='hidden'||a.state==='veryHidden'})
 }
 if(!sheets.length)throw new Error('シートがありません')
 return {sheets}
}
