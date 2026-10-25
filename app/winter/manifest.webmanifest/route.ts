import type {MetadataRoute} from 'next'
import {WINTER_EVENT_NAME} from '@/lib/winter-event'

export const dynamic='force-static'

export function GET(){
 const manifest:MetadataRoute.Manifest={
  id:'/winter',
  name:`${WINTER_EVENT_NAME} 大会受付`,
  short_name:'FHS Winter',
  start_url:'/winter',
  // Next.js canonicalizes /winter/ to /winter; include that canonical home.
  scope:'/winter',
  display:'standalone',
  background_color:'#ffffff',
  theme_color:'#205f9e',
  icons:[{src:'/apple-icon.png',sizes:'180x180',type:'image/png'}],
 }
 return Response.json(manifest,{headers:{'Content-Type':'application/manifest+json','Cache-Control':'public, max-age=0, must-revalidate'}})
}
