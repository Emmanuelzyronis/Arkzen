/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native/DB clients must stay outside the bundler in Next 15+.
  serverExternalPackages: ["better-sqlite3", "pg"],
  // Pin the workspace root so Turbopack does not walk up to a parent lockfile.
  turbopack: { root: import.meta.dirname },
  // Local tooling (screenshots, curl) may hit the dev server by IP. Without
  // this Next 16 treats those as cross-origin, blocks dev resources and the
  // page never hydrates.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
