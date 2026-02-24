import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: ["http://192.168.1.101:3000", "http://localhost:3000"],
  turbopack: {
    root: "C:\\Users\\dardi\\OneDrive - sdu.edu.tr\\Masaüstü\\pdm",
  },
};

export default nextConfig;
