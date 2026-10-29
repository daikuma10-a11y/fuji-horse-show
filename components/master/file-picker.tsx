'use client'

import { useId, useRef, useState } from 'react'

/** Shared, keyboard-accessible file action; the caller owns reading and saving. */
export function MasterFilePicker({ label, accept, hint, disabled = false, fileName, onFiles }: {
  label: string; accept: string; hint: string; disabled?: boolean; fileName?: string
  onFiles: (files: FileList) => void
}) {
  const input = useRef<HTMLInputElement>(null), description = useId()
  const [selected, setSelected] = useState('')
  return <div className="master-file-picker">
    <button type="button" className="master-file-action" disabled={disabled} aria-describedby={description} onClick={() => input.current?.click()}>
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19h16V8h-8l-2-3H4z"/><path d="M12 16v-5m-2 2 2-2 2 2"/></svg>
      <span>{label}</span>
    </button>
    <input ref={input} hidden type="file" accept={accept} disabled={disabled} aria-label={label} onChange={event => {
      const target = event.currentTarget, files = target.files
      if (!disabled && files?.length) {
        setSelected(files[0].name)
        try { onFiles(files) } finally { target.value = '' }
      }
    }}/>
    <p id={description} className="text-sm">{hint}</p>
    <p className="master-file-name" role="status">{(fileName ?? selected) ? `選択したファイル：${fileName ?? selected}` : 'ファイルはまだ選択されていません'}</p>
  </div>
}
