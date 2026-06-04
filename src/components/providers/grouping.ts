import type { Provider, ProviderFolder } from "@/types";

/** 一个供应商分组：对应一个文件夹，或「未分配」组（folderId 为 null）。 */
export interface ProviderGroup {
  /** 文件夹 ID；null 表示未分配组。 */
  folderId: string | null;
  /** 显示名（未分配组为 ""，由调用方本地化）。 */
  folderName: string;
  /** 组内供应商（已按 sortIndex 排序）。 */
  providers: Provider[];
}

const sortProviders = (a: Provider, b: Provider): number => {
  const ai = a.sortIndex;
  const bi = b.sortIndex;
  if (ai !== undefined && bi !== undefined && ai !== bi) return ai - bi;
  if (ai !== undefined && bi === undefined) return -1;
  if (bi !== undefined && ai === undefined) return 1;
  const ta = a.createdAt ?? 0;
  const tb = b.createdAt ?? 0;
  if (ta && tb && ta !== tb) return ta - tb;
  return (a.name || "").localeCompare(b.name || "");
};

/**
 * 把供应商按文件夹分组。
 * - 每个文件夹生成一个组（即使为空也保留，方便用户看到自己建的结构）。
 * - 未分配（meta.folderId 为空）或引用了已删除文件夹的供应商，归入「未分配」组。
 * - 文件夹按其 sortIndex 排序；「未分配」组永远排最后。
 * - 组内供应商按 sortIndex → createdAt → name 排序。
 *
 * 纯函数、确定性（不依赖 Date/Math.random），便于单测。
 */
export const groupProvidersByFolder = (
  providers: Provider[],
  folders: ProviderFolder[],
): ProviderGroup[] => {
  const validFolderIds = new Set(folders.map((f) => f.id));
  const buckets = new Map<string | null, Provider[]>();

  // 预建所有文件夹的桶（含空文件夹）+ 未分配桶
  buckets.set(null, []);
  for (const folder of folders) {
    buckets.set(folder.id, []);
  }

  for (const provider of providers) {
    const fid = provider.meta?.folderId;
    const key = fid && validFolderIds.has(fid) ? fid : null;
    buckets.get(key)!.push(provider);
  }

  for (const list of buckets.values()) {
    list.sort(sortProviders);
  }

  const sortedFolders = [...folders].sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
    return a.name.localeCompare(b.name);
  });

  const result: ProviderGroup[] = sortedFolders.map((folder) => ({
    folderId: folder.id,
    folderName: folder.name,
    providers: buckets.get(folder.id) ?? [],
  }));

  // 未分配组永远排最后
  result.push({
    folderId: null,
    folderName: "",
    providers: buckets.get(null) ?? [],
  });

  return result;
};
