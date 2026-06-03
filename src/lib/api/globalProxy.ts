/**
 * 代理探测工具 API
 *
 * 为「按供应商出站代理」配置界面提供：测试代理连通性、扫描本地代理端口。
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * 代理测试结果
 */
export interface ProxyTestResult {
  success: boolean;
  latencyMs: number;
  error: string | null;
}

/**
 * 检测到的代理
 */
export interface DetectedProxy {
  url: string;
  proxyType: string;
  port: number;
}

/**
 * 测试代理连接
 *
 * @param url - 要测试的代理 URL
 * @returns 测试结果，包含是否成功、延迟和错误信息
 */
export async function testProxyUrl(url: string): Promise<ProxyTestResult> {
  return invoke<ProxyTestResult>("test_proxy_url", { url });
}

/**
 * 扫描本地代理
 *
 * @returns 检测到的代理列表
 */
export async function scanLocalProxies(): Promise<DetectedProxy[]> {
  return invoke<DetectedProxy[]>("scan_local_proxies");
}
