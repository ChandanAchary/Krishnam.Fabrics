/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Lint via `npm run lint`; don't block production builds on lint warnings.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
