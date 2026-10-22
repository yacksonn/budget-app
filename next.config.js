/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Let OpenNext resolve Prisma's workerd build (bundled wasm) instead of the Node build.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

module.exports = nextConfig;
