/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
