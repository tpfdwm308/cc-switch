import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Coins,
  Globe,
  Loader2,
  Search,
  TestTube2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ProviderTestConfig } from "@/types";
import {
  useGlobalProxyUrl,
  useScanProxies,
  useTestProxy,
  type DetectedProxy,
} from "@/hooks/useGlobalProxy";

export type PricingModelSourceOption = "inherit" | "request" | "response";

interface ProviderPricingConfig {
  enabled: boolean;
  costMultiplier?: string;
  pricingModelSource: PricingModelSourceOption;
}

interface ProviderAdvancedConfigProps {
  testConfig: ProviderTestConfig;
  pricingConfig: ProviderPricingConfig;
  onTestConfigChange: (config: ProviderTestConfig) => void;
  onPricingConfigChange: (config: ProviderPricingConfig) => void;
  proxyMode: "global" | "direct" | "custom";
  onProxyModeChange: (mode: "global" | "direct" | "custom") => void;
  proxyUrl: string;
  onProxyUrlChange: (url: string) => void;
}

export function ProviderAdvancedConfig({
  testConfig,
  pricingConfig,
  onTestConfigChange,
  onPricingConfigChange,
  proxyMode,
  onProxyModeChange,
  proxyUrl,
  onProxyUrlChange,
}: ProviderAdvancedConfigProps) {
  const { t } = useTranslation();
  const { data: globalProxyUrl } = useGlobalProxyUrl();
  const scanMutation = useScanProxies();
  const testMutation = useTestProxy();
  const [detectedProxies, setDetectedProxies] = useState<DetectedProxy[]>([]);

  const handleScanProxies = async () => {
    const result = await scanMutation.mutateAsync();
    setDetectedProxies(result);
  };

  const handleTestProxy = async () => {
    const trimmed = proxyUrl.trim();
    if (trimmed) {
      await testMutation.mutateAsync(trimmed);
    }
  };
  const [isTestConfigOpen, setIsTestConfigOpen] = useState(testConfig.enabled);
  const [isPricingConfigOpen, setIsPricingConfigOpen] = useState(
    pricingConfig.enabled,
  );

  useEffect(() => {
    setIsTestConfigOpen(testConfig.enabled);
  }, [testConfig.enabled]);

  useEffect(() => {
    setIsPricingConfigOpen(pricingConfig.enabled);
  }, [pricingConfig.enabled]);

  return (
    <div className="space-y-4">
      {/* 出站代理 */}
      <div className="rounded-lg border border-border/50 bg-muted/20">
        <div className="flex w-full items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {t("providerAdvanced.outboundProxy.title", {
                defaultValue: "出站代理",
              })}
            </span>
          </div>
          <Select
            value={proxyMode}
            onValueChange={(value) =>
              onProxyModeChange(value as "global" | "direct" | "custom")
            }
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">
                {t("providerAdvanced.outboundProxy.modeGlobal", {
                  defaultValue: "跟随全局",
                })}
              </SelectItem>
              <SelectItem value="direct">
                {t("providerAdvanced.outboundProxy.modeDirect", {
                  defaultValue: "直连",
                })}
              </SelectItem>
              <SelectItem value="custom">
                {t("providerAdvanced.outboundProxy.modeCustom", {
                  defaultValue: "自定义",
                })}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="border-t border-border/50 p-4 space-y-3">
          {proxyMode === "custom" ? (
            <>
              <div className="flex gap-2">
                <Input
                  value={proxyUrl}
                  onChange={(e) => onProxyUrlChange(e.target.value)}
                  placeholder={t(
                    "providerAdvanced.outboundProxy.customPlaceholder",
                    {
                      defaultValue:
                        "http://127.0.0.1:7890 / socks5://127.0.0.1:1080",
                    },
                  )}
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={scanMutation.isPending}
                  onClick={handleScanProxies}
                  title={t("settings.globalProxy.scan")}
                >
                  {scanMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!proxyUrl.trim() || testMutation.isPending}
                  onClick={handleTestProxy}
                  title={t("settings.globalProxy.test")}
                >
                  {testMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TestTube2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {detectedProxies.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {detectedProxies.map((p) => (
                    <Button
                      key={p.url}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onProxyUrlChange(p.url);
                        setDetectedProxies([]);
                      }}
                      className="font-mono text-xs"
                    >
                      {p.url}
                    </Button>
                  ))}
                </div>
              )}
              {!proxyUrl.trim() && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {t("providerAdvanced.outboundProxy.customEmpty", {
                    defaultValue: "未填写地址时回退为跟随全局。",
                  })}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {proxyMode === "direct"
                ? t("providerAdvanced.outboundProxy.directDesc", {
                    defaultValue: "此供应商将直连上游，忽略全局出站代理。",
                  })
                : globalProxyUrl
                  ? t("providerAdvanced.outboundProxy.followGlobalActive", {
                      proxy: globalProxyUrl,
                      defaultValue: "跟随全局出站代理：{{proxy}}",
                    })
                  : t("providerAdvanced.outboundProxy.followGlobalNone", {
                      defaultValue: "全局未设置出站代理，当前为直连。",
                    })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t("providerAdvanced.outboundProxy.hint", {
              defaultValue: "仅在 cc-switch 代理转发该应用时生效。",
            })}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/20">
        <button
          type="button"
          className="flex w-full items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          onClick={() => setIsTestConfigOpen(!isTestConfigOpen)}
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {t("providerAdvanced.testConfig", {
                defaultValue: "模型测试配置",
              })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Label
                htmlFor="test-config-enabled"
                className="text-sm text-muted-foreground"
              >
                {t("providerAdvanced.useCustomConfig", {
                  defaultValue: "使用单独配置",
                })}
              </Label>
              <Switch
                id="test-config-enabled"
                checked={testConfig.enabled}
                onCheckedChange={(checked) => {
                  onTestConfigChange({ ...testConfig, enabled: checked });
                  if (checked) setIsTestConfigOpen(true);
                }}
              />
            </div>
            {isTestConfigOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isTestConfigOpen
              ? "max-h-[500px] opacity-100"
              : "max-h-0 opacity-0",
          )}
        >
          <div className="border-t border-border/50 p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("providerAdvanced.testConfigDesc", {
                defaultValue:
                  "为此供应商配置单独的模型测试参数，不启用时使用全局配置。",
              })}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="test-model">
                  {t("providerAdvanced.testModel", {
                    defaultValue: "测试模型",
                  })}
                </Label>
                <Input
                  id="test-model"
                  value={testConfig.testModel || ""}
                  onChange={(e) =>
                    onTestConfigChange({
                      ...testConfig,
                      testModel: e.target.value || undefined,
                    })
                  }
                  placeholder={t("providerAdvanced.testModelPlaceholder", {
                    defaultValue: "留空使用全局配置",
                  })}
                  disabled={!testConfig.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-timeout">
                  {t("providerAdvanced.timeoutSecs", {
                    defaultValue: "超时时间（秒）",
                  })}
                </Label>
                <Input
                  id="test-timeout"
                  type="number"
                  min={1}
                  max={300}
                  value={testConfig.timeoutSecs || ""}
                  onChange={(e) =>
                    onTestConfigChange({
                      ...testConfig,
                      timeoutSecs: e.target.value
                        ? parseInt(e.target.value, 10)
                        : undefined,
                    })
                  }
                  placeholder="45"
                  disabled={!testConfig.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-prompt">
                  {t("providerAdvanced.testPrompt", {
                    defaultValue: "测试提示词",
                  })}
                </Label>
                <Input
                  id="test-prompt"
                  value={testConfig.testPrompt || ""}
                  onChange={(e) =>
                    onTestConfigChange({
                      ...testConfig,
                      testPrompt: e.target.value || undefined,
                    })
                  }
                  placeholder="Who are you?"
                  disabled={!testConfig.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="degraded-threshold">
                  {t("providerAdvanced.degradedThreshold", {
                    defaultValue: "降级阈值（毫秒）",
                  })}
                </Label>
                <Input
                  id="degraded-threshold"
                  type="number"
                  min={100}
                  max={60000}
                  value={testConfig.degradedThresholdMs || ""}
                  onChange={(e) =>
                    onTestConfigChange({
                      ...testConfig,
                      degradedThresholdMs: e.target.value
                        ? parseInt(e.target.value, 10)
                        : undefined,
                    })
                  }
                  placeholder="6000"
                  disabled={!testConfig.enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-retries">
                  {t("providerAdvanced.maxRetries", {
                    defaultValue: "最大重试次数",
                  })}
                </Label>
                <Input
                  id="max-retries"
                  type="number"
                  min={0}
                  max={10}
                  value={testConfig.maxRetries ?? ""}
                  onChange={(e) =>
                    onTestConfigChange({
                      ...testConfig,
                      maxRetries: e.target.value
                        ? parseInt(e.target.value, 10)
                        : undefined,
                    })
                  }
                  placeholder="2"
                  disabled={!testConfig.enabled}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 计费配置 */}
      <div className="rounded-lg border border-border/50 bg-muted/20">
        <button
          type="button"
          className="flex w-full items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          onClick={() => setIsPricingConfigOpen(!isPricingConfigOpen)}
        >
          <div className="flex items-center gap-3">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {t("providerAdvanced.pricingConfig", {
                defaultValue: "计费配置",
              })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Label
                htmlFor="pricing-config-enabled"
                className="text-sm text-muted-foreground"
              >
                {t("providerAdvanced.useCustomPricing", {
                  defaultValue: "使用单独配置",
                })}
              </Label>
              <Switch
                id="pricing-config-enabled"
                checked={pricingConfig.enabled}
                onCheckedChange={(checked) => {
                  onPricingConfigChange({ ...pricingConfig, enabled: checked });
                  if (checked) setIsPricingConfigOpen(true);
                }}
              />
            </div>
            {isPricingConfigOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isPricingConfigOpen
              ? "max-h-[500px] opacity-100"
              : "max-h-0 opacity-0",
          )}
        >
          <div className="border-t border-border/50 p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("providerAdvanced.pricingConfigDesc", {
                defaultValue:
                  "为此供应商配置单独的计费参数，不启用时使用全局默认配置。",
              })}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost-multiplier">
                  {t("providerAdvanced.costMultiplier", {
                    defaultValue: "成本倍率",
                  })}
                </Label>
                <Input
                  id="cost-multiplier"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={pricingConfig.costMultiplier || ""}
                  onChange={(e) =>
                    onPricingConfigChange({
                      ...pricingConfig,
                      costMultiplier: e.target.value || undefined,
                    })
                  }
                  placeholder={t("providerAdvanced.costMultiplierPlaceholder", {
                    defaultValue: "留空使用全局默认（1）",
                  })}
                  disabled={!pricingConfig.enabled}
                />
                <p className="text-xs text-muted-foreground">
                  {t("providerAdvanced.costMultiplierHint", {
                    defaultValue: "实际成本 = 基础成本 × 倍率，支持小数如 1.5",
                  })}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricing-model-source">
                  {t("providerAdvanced.pricingModelSourceLabel", {
                    defaultValue: "计费模式",
                  })}
                </Label>
                <Select
                  value={pricingConfig.pricingModelSource}
                  onValueChange={(value) =>
                    onPricingConfigChange({
                      ...pricingConfig,
                      pricingModelSource: value as PricingModelSourceOption,
                    })
                  }
                  disabled={!pricingConfig.enabled}
                >
                  <SelectTrigger id="pricing-model-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inherit">
                      {t("providerAdvanced.pricingModelSourceInherit", {
                        defaultValue: "继承全局默认",
                      })}
                    </SelectItem>
                    <SelectItem value="request">
                      {t("providerAdvanced.pricingModelSourceRequest", {
                        defaultValue: "请求模型",
                      })}
                    </SelectItem>
                    <SelectItem value="response">
                      {t("providerAdvanced.pricingModelSourceResponse", {
                        defaultValue: "返回模型",
                      })}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("providerAdvanced.pricingModelSourceHint", {
                    defaultValue: "选择按请求模型还是返回模型进行定价匹配",
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
