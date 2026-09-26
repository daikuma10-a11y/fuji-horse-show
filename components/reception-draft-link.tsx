"use client"
import Link from "next/link"
import {useStore} from "@/lib/store"
export function ReceptionDraftLink(){
 const {draftRequests,draftReady}=useStore()
 if(!draftReady||!draftRequests.length)return null
 return <Link href="/reception-review" className="mt-6 flex min-h-16 items-center justify-center rounded-2xl border-2 border-primary bg-primary/10 px-4 text-center text-xl font-bold text-primary">確認待ちの受付 {draftRequests.length}件を見る・まとめて確定する</Link>
}
