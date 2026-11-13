export function MonitorFontControl({value,onChange}:{value:number;onChange:(size:number)=>void}){
 return <label className="inline-flex items-center gap-2 px-3 text-sm font-bold">文字サイズ
  <input type="range" min={12} max={24} value={value} onChange={event=>onChange(Number(event.target.value))}/>
 </label>
}
