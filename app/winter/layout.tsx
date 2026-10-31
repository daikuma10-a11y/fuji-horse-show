import {WinterAutomaticDelivery} from '@/components/winter-automatic-delivery'
import {WinterOfflineShell} from '@/components/winter-offline-shell'
import type {Metadata} from 'next'
import type {ReactNode} from 'react'
import {WINTER_EVENT_NAME} from '@/lib/winter-event'

// Every Winter page installs the Winter reception home, including settlement/admin.
export const metadata:Metadata={
 title:'Fuji Horse Show Winter 大会受付',
 description:`${WINTER_EVENT_NAME} の大会受付`,
 manifest:'/winter/manifest.webmanifest',
 appleWebApp:{capable:true,title:'FHS Winter',statusBarStyle:'default'},
}

export default function WinterLayout({children}:{children:ReactNode}){return <><WinterAutomaticDelivery/><WinterOfflineShell>{children}</WinterOfflineShell></>}
