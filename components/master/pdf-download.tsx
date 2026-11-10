"use client"

import {useEffect,useRef,useState} from 'react'

export function PdfDownload({label,filename,disabled=false,generate}:{label:string;filename:string;disabled?:boolean;generate:()=>Promise<Blob>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[file,setFile]=useState<{url:string;name:string}|null>(null)
  const lock=useRef(false),alive=useRef(true),current=useRef('')
  useEffect(()=>{
    alive.current=true
    return ()=>{alive.current=false;if(current.current)URL.revokeObjectURL(current.current)}
  },[])
  async function download(){
    if(lock.current||disabled)return
    lock.current=true;setBusy(true);setError('')
    try{
      const blob=await generate()
      if(!alive.current)return
      const url=URL.createObjectURL(blob),name=filename.replace(/[\\/:*?"<>|]/g,'_')+'.pdf'
      if(current.current)URL.revokeObjectURL(current.current)
      current.current=url;setFile({url,name})
      const link=document.createElement('a')
      link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove()
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'PDFを作成できませんでした。再度お試しください。')}
    finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  return <div className="flex flex-wrap items-center gap-3">
    <button type="button" className="min-h-12 rounded-lg border-2 border-primary bg-card px-4 font-bold text-primary disabled:opacity-50" disabled={disabled||busy} onClick={()=>void download()}>{busy?'PDFを作成中…':label}</button>
    {file&&<a href={file.url} target="_blank" rel="noopener" className="underline">直前に作成したPDFを開く</a>}
    {error&&<p role="alert" className="text-destructive">{error}</p>}
  </div>
}
