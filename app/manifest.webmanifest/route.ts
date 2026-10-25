import type {MetadataRoute} from 'next'

export const dynamic='force-static'

// Explicit route keeps Autumn metadata overridable by the Winter layout.
export function GET(){
 const manifest:MetadataRoute.Manifest={
  name:'Fuji Horse Show 大会受付',
  short_name:'Fuji Horse Show',
  start_url:'/',
  scope:'/',
  display:'standalone',
  background_color:'#ffffff',
  theme_color:'#205f9e',
  icons:[{src:'/apple-icon.png',sizes:'180x180',type:'image/png'}],
 }
 return Response.json(manifest,{headers:{'Content-Type':'application/manifest+json','Cache-Control':'public, max-age=0, must-revalidate'}})
}
