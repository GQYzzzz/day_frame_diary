/** 浏览器内请求 FastAPI（上传等）。默认本地开发端口 8000。 */
export function getApiBase(): string {
  const raw =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE
      ? process.env.NEXT_PUBLIC_API_BASE
      : "http://127.0.0.1:8000";
  return raw.replace(/\/$/, "");
}
