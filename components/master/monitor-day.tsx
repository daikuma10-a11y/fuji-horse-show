import type {ReactNode} from 'react'

export function MasterMonitorDay({title,children,compact=false}:{title:string;children:ReactNode;compact?:boolean}){
 return <div className={compact?'p-2':'p-3'}>
  <header className="sticky top-0 z-10 border-b-2 border-primary bg-white py-1">
   <h1 className={compact?'font-bold':'text-xl font-bold'}>{title}</h1>
  </header>
  <div className={compact?'flex flex-col gap-2':'flex flex-col gap-4'}>{children}</div>
 </div>
}
