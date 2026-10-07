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
  },
};

export default nextConfig;
