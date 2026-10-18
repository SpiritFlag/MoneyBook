import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 협업 정본은 직접 관리합니다. 개발 서버가 AGENTS.md를 덧쓰지 않게 합니다.
  agentRules: false,
};

export default nextConfig;
