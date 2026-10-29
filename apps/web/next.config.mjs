/** @type {import('next').NextConfig} */
const nextConfig = {
  // No floating "N" badge in development; the site's own dev toolbar opens with Ctrl+Shift+D.
  devIndicators: false,
  // The organization and proctor consoles used to live at /admin and /mentor.
  async redirects() {
    return [
      { source: '/admin', destination: '/organization', permanent: true },
      { source: '/admin/:path*', destination: '/organization/:path*', permanent: true },
      { source: '/mentor', destination: '/proctor', permanent: true },
      { source: '/mentor/:path*', destination: '/proctor/:path*', permanent: true },
    ];
  },
};

export default nextConfig;
