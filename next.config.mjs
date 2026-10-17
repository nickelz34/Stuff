/** @type {import('next').NextConfig} */
const nextConfig = {
  // Linting runs via `npm run lint` (ESLint flat config without eslint-config-next).
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // Backup and update zips. Photo uploads stay on the 10 MB server-action limit.
    middlewareClientMaxBodySize: "80mb",
  },
};

export default nextConfig;
