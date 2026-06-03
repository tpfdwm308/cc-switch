/**
 * 代理探测工具 React Hooks
 *
 * 为「按供应商出站代理」配置界面提供：测试代理连通性、扫描本地代理端口。
 */

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  testProxyUrl,
  scanLocalProxies,
  type ProxyTestResult,
  type DetectedProxy,
} from "@/lib/api/globalProxy";

/**
 * 测试代理连接
 */
export function useTestProxy() {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: testProxyUrl,
    onSuccess: (result: ProxyTestResult) => {
      if (result.success) {
        toast.success(
          t("settings.globalProxy.testSuccess", { latency: result.latencyMs }),
        );
      } else {
        toast.error(
          t("settings.globalProxy.testFailed", { error: result.error }),
        );
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * 扫描本地代理
 */
export function useScanProxies() {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: scanLocalProxies,
    onError: (error: Error) => {
      toast.error(
        t("settings.globalProxy.scanFailed", { error: error.message }),
      );
    },
  });
}

export type { DetectedProxy };
