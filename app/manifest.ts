import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fuji Horse Show 大会受付',
    short_name: 'Fuji Horse Show',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#205f9e',
    icons: [{ src: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  }
}
