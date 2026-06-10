import { invoke } from "@tauri-apps/api/core";
import type {
  UsageSummary,
  UsageSummaryByApp,
  DailyStats,
  ProviderStats,
  ModelStats,
  RequestLog,
  LogFilters,
  ProviderLimitStatus,
  PaginatedLogs,
  SessionSyncResult,
  DataSourceSummary,
} from "@/types/usage";
import type { UsageResult } from "@/types";
import type { AppId } from "./types";
import type { TemplateType } from "@/config/constants";

export const usageApi = {
  // Provider usage script methods
  query: async (providerId: string, appId: AppId): Promise<UsageResult> => {
    return invoke("queryProviderUsage", { providerId, app: appId });
  },

  testScript: async (
    providerId: string,
    appId: AppId,
    scriptCode: string,
    timeout?: number,
    apiKey?: string,
    baseUrl?: string,
    accessToken?: string,
    userId?: string,
    templateType?: TemplateType,
  ): Promise<UsageResult> => {
    return invoke("testUsageScript", {
      providerId,
      app: appId,
      scriptCode,
      timeout,
      apiKey,
      baseUrl,
      accessToken,
      userId,
      templateType,
    });
  },

  // Proxy usage statistics methods
  getUsageSummary: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<UsageSummary> => {
    return invoke("get_usage_summary", { startDate, endDate, appType });
  },

  getUsageSummaryByApp: async (
    startDate?: number,
    endDate?: number,
  ): Promise<UsageSummaryByApp[]> => {
    return invoke("get_usage_summary_by_app", { startDate, endDate });
  },

  getUsageTrends: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<DailyStats[]> => {
    return invoke("get_usage_trends", { startDate, endDate, appType });
  },

  getProviderStats: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<ProviderStats[]> => {
    return invoke("get_provider_stats", { startDate, endDate, appType });
  },

  getModelStats: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<ModelStats[]> => {
    return invoke("get_model_stats", { startDate, endDate, appType });
  },

  getRequestLogs: async (
    filters: LogFilters,
    page: number = 0,
    pageSize: number = 20,
  ): Promise<PaginatedLogs> => {
    return invoke("get_request_logs", {
      filters,
      page,
      pageSize,
    });
  },

  getRequestDetail: async (requestId: string): Promise<RequestLog | null> => {
    return invoke("get_request_detail", { requestId });
  },

  checkProviderLimits: async (
    providerId: string,
    appType: string,
  ): Promise<ProviderLimitStatus> => {
    return invoke("check_provider_limits", { providerId, appType });
  },

  // Session usage sync
  syncSessionUsage: async (): Promise<SessionSyncResult> => {
    return invoke("sync_session_usage");
  },

  getDataSourceBreakdown: async (): Promise<DataSourceSummary[]> => {
    return invoke("get_usage_data_sources");
  },
};
