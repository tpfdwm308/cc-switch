/**
 * 供应商文件夹 React Hooks
 *
 * 为供应商列表的分组显示提供文件夹的查询与增删改。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { providerFoldersApi, type AppId } from "@/lib/api";
import type { ProviderFolder } from "@/types";

export const providerFolderKeys = {
  all: (appType: string) => ["providerFolders", appType] as const,
};

/** 把后端返回的错误统一成可读字符串。 */
function folderErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * 查询指定 app 下的所有文件夹
 */
export function useProviderFolders(appType: AppId) {
  return useQuery<ProviderFolder[]>({
    queryKey: providerFolderKeys.all(appType),
    queryFn: () => providerFoldersApi.getAll(appType),
    enabled: !!appType,
  });
}

/**
 * 创建文件夹
 */
export function useCreateProviderFolder(appType: AppId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => providerFoldersApi.create(name, appType),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: providerFolderKeys.all(appType),
      });
    },
    onError: (error) => {
      toast.error(`新建分组失败：${folderErrorMessage(error)}`);
    },
  });
}

/**
 * 重命名文件夹
 */
export function useRenameProviderFolder(appType: AppId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      providerFoldersApi.rename(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: providerFolderKeys.all(appType),
      });
    },
    onError: (error) => {
      toast.error(`重命名分组失败：${folderErrorMessage(error)}`);
    },
  });
}

/**
 * 删除文件夹（该文件夹下的供应商会回到「未分配」）
 */
export function useDeleteProviderFolder(appType: AppId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => providerFoldersApi.delete(id, appType),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: providerFolderKeys.all(appType),
      });
      // 供应商的 meta.folderId 可能被清空，需要刷新供应商列表
      queryClient.invalidateQueries({ queryKey: ["providers", appType] });
    },
    onError: (error) => {
      toast.error(`删除分组失败：${folderErrorMessage(error)}`);
    },
  });
}

/**
 * 把供应商移动到指定文件夹（folderId=null 表示移出）
 */
export function useMoveProviderToFolder(appType: AppId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      providerId,
      folderId,
    }: {
      providerId: string;
      folderId: string | null;
    }) => providerFoldersApi.moveProvider(providerId, appType, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers", appType] });
    },
    onError: (error) => {
      toast.error(`移动到分组失败：${folderErrorMessage(error)}`);
    },
  });
}
