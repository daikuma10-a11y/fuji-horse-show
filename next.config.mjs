/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/official-excel': ['./templates/autumn-1-10.xlsm'],
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
