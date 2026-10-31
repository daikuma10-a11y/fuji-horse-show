/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: '/winter/sw.js',
      headers: [{ key: 'Service-Worker-Allowed', value: '/winter' }],
    }]
  },
  outputFileTracingIncludes: {
    '/api/official-excel': ['./templates/autumn-*.xlsm'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

// Redeploy marker: verified start-order fix
export default nextConfig
