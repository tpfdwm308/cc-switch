import { CSS } from "@dnd-kit/utilities";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  FolderInput,
  FolderPlus,
  FolderTree,
  List,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Provider } from "@/types";
import type { AppId } from "@/lib/api";
import { providersApi, providerFoldersApi } from "@/lib/api/providers";
import { useDragSort } from "@/hooks/useDragSort";
import {
  useProviderFolders,
  useCreateProviderFolder,
  useRenameProviderFolder,
  useDeleteProviderFolder,
  useMoveProviderToFolder,
  providerFolderKeys,
} from "@/hooks/useProviderFolders";
import {
  groupProvidersByFolder,
  type ProviderGroup,
} from "@/components/providers/grouping";
import { ProviderFolderGroup } from "@/components/providers/ProviderFolderGroup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useOpenClawLiveProviderIds,
  useOpenClawDefaultModel,
} from "@/hooks/useOpenClaw";
import {
  useHermesLiveProviderIds,
  useHermesModelConfig,
} from "@/hooks/useHermes";
import { useStreamCheck } from "@/hooks/useStreamCheck";
import { ProviderCard } from "@/components/providers/ProviderCard";
import { ProviderEmptyState } from "@/components/providers/ProviderEmptyState";
import {
  useAutoFailoverEnabled,
  useFailoverQueue,
  useAddToFailoverQueue,
  useRemoveFromFailoverQueue,
} from "@/lib/query/failover";
import {
  useCurrentOmoProviderId,
  useCurrentOmoSlimProviderId,
} from "@/lib/query/omo";
import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { settingsApi } from "@/lib/api/settings";

interface ProviderListProps {
  providers: Record<string, Provider>;
  currentProviderId: string;
  appId: AppId;
  onSwitch: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onRemoveFromConfig?: (provider: Provider) => void;
  onDisableOmo?: () => void;
  onDisableOmoSlim?: () => void;
  onDuplicate: (provider: Provider) => void;
  onConfigureUsage?: (provider: Provider) => void;
  onOpenWebsite: (url: string) => void;
  onOpenTerminal?: (provider: Provider) => void;
  onCreate?: () => void;
  isLoading?: boolean;
  isProxyRunning?: boolean; // 代理服务运行状态
  isProxyTakeover?: boolean; // 代理接管模式（Live配置已被接管）
  activeProviderId?: string; // 代理当前实际使用的供应商 ID（用于故障转移模式下标注绿色边框）
  onSetAsDefault?: (provider: Provider) => void; // OpenClaw: set as default model
}

export function ProviderList({
  providers,
  currentProviderId,
  appId,
  onSwitch,
  onEdit,
  onDelete,
  onRemoveFromConfig,
  onDisableOmo,
  onDisableOmoSlim,
  onDuplicate,
  onConfigureUsage,
  onOpenWebsite,
  onOpenTerminal,
  onCreate,
  isLoading = false,
  isProxyRunning = false,
  isProxyTakeover = false,
  activeProviderId,
  onSetAsDefault,
}: ProviderListProps) {
  const { t } = useTranslation();
  const { checkProvider, isChecking } = useStreamCheck(appId);
  const { sortedProviders, sensors, handleDragEnd } = useDragSort(
    providers,
    appId,
  );

  // ── 文件夹分组 ──
  const VIEW_MODE_KEY = `cc-switch-provider-view-mode-${appId}`;
  const COLLAPSED_KEY = `cc-switch-provider-collapsed-folders-${appId}`;

  const [viewMode, setViewMode] = useState<"flat" | "grouped">(() => {
    if (typeof window === "undefined") return "flat";
    return window.localStorage.getItem(VIEW_MODE_KEY) === "grouped"
      ? "grouped"
      : "flat";
  });
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(COLLAPSED_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  const { data: folders = [] } = useProviderFolders(appId);
  const createFolderMutation = useCreateProviderFolder(appId);
  const renameFolderMutation = useRenameProviderFolder(appId);
  const deleteFolderMutation = useDeleteProviderFolder(appId);
  const moveFolderMutation = useMoveProviderToFolder(appId);
  const [folderPendingDelete, setFolderPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // 供应商卡片右键菜单（移动到分组 / 新建分组）
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    provider: Provider;
  } | null>(null);
  // 新建分组对话框；moveProvider 非空表示「新建并把该供应商移入」
  const [folderDialog, setFolderDialog] = useState<{
    moveProvider: Provider | null;
  } | null>(null);
  const [folderDialogName, setFolderDialogName] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    }
  }, [viewMode, VIEW_MODE_KEY]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        COLLAPSED_KEY,
        JSON.stringify(Array.from(collapsedFolders)),
      );
    }
  }, [collapsedFolders, COLLAPSED_KEY]);

  useEffect(() => {
    if (isCreatingFolder) {
      const frame = requestAnimationFrame(() => {
        newFolderInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isCreatingFolder]);

  const setFolderOpen = useCallback((key: string, open: boolean) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (open) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const { data: opencodeLiveIds } = useQuery({
    queryKey: ["opencodeLiveProviderIds"],
    queryFn: () => providersApi.getOpenCodeLiveProviderIds(),
    enabled: appId === "opencode",
  });

  // OpenClaw: 查询 live 配置中的供应商 ID 列表，用于判断 isInConfig
  const { data: openclawLiveIds } = useOpenClawLiveProviderIds(
    appId === "openclaw",
  );

  // Hermes: 查询 live 配置中的供应商 ID 列表，用于判断 isInConfig
  const { data: hermesLiveIds } = useHermesLiveProviderIds(appId === "hermes");

  // Hermes: 读取当前 model.provider，用于判断哪个供应商是"当前激活"（高亮）
  const { data: hermesModelConfig } = useHermesModelConfig(appId === "hermes");
  const hermesCurrentProviderId = hermesModelConfig?.provider;

  // 判断供应商是否已添加到配置（累加模式应用：OpenCode/OpenClaw/Hermes）
  const isProviderInConfig = useCallback(
    (providerId: string): boolean => {
      if (appId === "opencode") {
        return opencodeLiveIds?.includes(providerId) ?? false;
      }
      if (appId === "openclaw") {
        return openclawLiveIds?.includes(providerId) ?? false;
      }
      if (appId === "hermes") {
        return hermesLiveIds?.includes(providerId) ?? false;
      }
      return true; // 其他应用始终返回 true
    },
    [appId, opencodeLiveIds, openclawLiveIds, hermesLiveIds],
  );

  // OpenClaw: query default model to determine which provider is default
  const { data: openclawDefaultModel } = useOpenClawDefaultModel(
    appId === "openclaw",
  );

  const isProviderDefaultModel = useCallback(
    (providerId: string): boolean => {
      if (appId !== "openclaw" || !openclawDefaultModel?.primary) return false;
      return openclawDefaultModel.primary.startsWith(providerId + "/");
    },
    [appId, openclawDefaultModel],
  );

  // 故障转移相关
  const { data: isAutoFailoverEnabled } = useAutoFailoverEnabled(appId);
  const { data: failoverQueue } = useFailoverQueue(appId);
  const addToQueue = useAddToFailoverQueue();
  const removeFromQueue = useRemoveFromFailoverQueue();

  const isFailoverModeActive =
    isProxyTakeover === true && isAutoFailoverEnabled === true;

  const isOpenCode = appId === "opencode";
  const { data: currentOmoId } = useCurrentOmoProviderId(isOpenCode);
  const { data: currentOmoSlimId } = useCurrentOmoSlimProviderId(isOpenCode);

  const getFailoverPriority = useCallback(
    (providerId: string): number | undefined => {
      if (!isFailoverModeActive || !failoverQueue) return undefined;
      const index = failoverQueue.findIndex(
        (item) => item.providerId === providerId,
      );
      return index >= 0 ? index + 1 : undefined;
    },
    [isFailoverModeActive, failoverQueue],
  );

  const isInFailoverQueue = useCallback(
    (providerId: string): boolean => {
      if (!isFailoverModeActive || !failoverQueue) return false;
      return failoverQueue.some((item) => item.providerId === providerId);
    },
    [isFailoverModeActive, failoverQueue],
  );

  const handleToggleFailover = useCallback(
    (providerId: string, enabled: boolean) => {
      if (enabled) {
        addToQueue.mutate({ appType: appId, providerId });
      } else {
        removeFromQueue.mutate({ appType: appId, providerId });
      }
    },
    [appId, addToQueue, removeFromQueue],
  );

  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showStreamCheckConfirm, setShowStreamCheckConfirm] = useState(false);
  const [pendingTestProvider, setPendingTestProvider] =
    useState<Provider | null>(null);
  const { data: claudeDesktopStatus } = useQuery({
    queryKey: ["claudeDesktopStatus"],
    queryFn: () => providersApi.getClaudeDesktopStatus(),
    enabled: appId === "claude-desktop",
    refetchInterval: appId === "claude-desktop" ? 5000 : false,
  });

  // Query settings for streamCheckConfirmed flag
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsApi.get(),
  });

  const handleTest = useCallback(
    (provider: Provider) => {
      if (!settings?.streamCheckConfirmed) {
        setPendingTestProvider(provider);
        setShowStreamCheckConfirm(true);
      } else {
        checkProvider(provider.id, provider.name);
      }
    },
    [checkProvider, settings?.streamCheckConfirmed],
  );

  const handleStreamCheckConfirm = async () => {
    setShowStreamCheckConfirm(false);
    try {
      if (settings) {
        const { webdavSync: _, ...rest } = settings;
        await settingsApi.save({ ...rest, streamCheckConfirmed: true });
        await queryClient.invalidateQueries({ queryKey: ["settings"] });
      }
    } catch (error) {
      console.error("Failed to save stream check confirmed:", error);
    }
    if (pendingTestProvider) {
      checkProvider(pendingTestProvider.id, pendingTestProvider.name);
      setPendingTestProvider(null);
    }
  };

  // Import current live config as default provider
  const queryClient = useQueryClient();
  const importMutation = useMutation({
    mutationFn: async (): Promise<boolean> => {
      if (appId === "opencode") {
        const count = await providersApi.importOpenCodeFromLive();
        return count > 0;
      }
      if (appId === "openclaw") {
        const count = await providersApi.importOpenClawFromLive();
        return count > 0;
      }
      if (appId === "hermes") {
        const count = await providersApi.importHermesFromLive();
        return count > 0;
      }
      if (appId === "claude-desktop") {
        const count = await providersApi.importClaudeDesktopFromClaude();
        return count > 0;
      }
      return providersApi.importDefault(appId);
    },
    onSuccess: (imported) => {
      if (imported) {
        queryClient.invalidateQueries({ queryKey: ["providers", appId] });
        if (appId === "claude-desktop") {
          queryClient.invalidateQueries({ queryKey: ["claudeDesktopStatus"] });
        }
        toast.success(t("provider.importCurrentDescription"));
      } else {
        toast.info(t("provider.noProviders"));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "f") {
        event.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      if (key === "escape") {
        setIsSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isSearchOpen) {
      const frame = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isSearchOpen]);

  const filteredProviders = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return sortedProviders;
    return sortedProviders.filter((provider) => {
      const fields = [provider.name, provider.notes, provider.websiteUrl];
      return fields.some((field) =>
        field?.toString().toLowerCase().includes(keyword),
      );
    });
  }, [searchTerm, sortedProviders]);

  const isSearching = searchTerm.trim().length > 0;

  const claudeDesktopStatusMessages = useMemo(() => {
    if (appId !== "claude-desktop" || !claudeDesktopStatus) return [];

    const messages: string[] = [];
    if (!claudeDesktopStatus.supported) {
      messages.push(
        t("claudeDesktop.statusUnsupported", {
          defaultValue: "当前平台暂不支持 Claude Desktop 3P 配置写入。",
        }),
      );
      return messages;
    }

    if (claudeDesktopStatus.staleRawModels) {
      messages.push(
        t("claudeDesktop.statusStaleRawModels", {
          defaultValue:
            "Claude Desktop profile 中存在非 claude-* 模型名，新版 Claude Desktop 可能拒绝加载；重新切换当前供应商可修复。",
        }),
      );
    }
    if (claudeDesktopStatus.missingRouteMappings) {
      messages.push(
        t("claudeDesktop.statusMissingRouteMappings", {
          defaultValue:
            "当前供应商启用了模型映射，但没有有效路由；请编辑供应商并补全至少一个模型映射。",
        }),
      );
    }
    if (
      claudeDesktopStatus.mode === "proxy" &&
      !claudeDesktopStatus.gatewayTokenConfigured
    ) {
      messages.push(
        t("claudeDesktop.statusGatewayTokenMissing", {
          defaultValue:
            "当前本地路由 token 尚未生成；重新切换该供应商会写入新的本地 token。",
        }),
      );
    }

    const expected = claudeDesktopStatus.expectedBaseUrl?.replace(/\/+$/, "");
    const actual = claudeDesktopStatus.actualBaseUrl?.replace(/\/+$/, "");
    if (expected && actual && expected !== actual) {
      messages.push(
        t("claudeDesktop.statusBaseUrlMismatch", {
          expected,
          actual,
          defaultValue:
            "Claude Desktop profile 指向的地址与当前供应商不一致；当前为 {{actual}}，应为 {{expected}}。重新切换当前供应商可修复。",
        }),
      );
    }

    return messages;
  }, [appId, claudeDesktopStatus, t]);

  // 分组视图：用分组（文件夹）归类供应商（按 sortIndex 排各组内的供应商）。
  // - 「未分配」伪分组为空时永远隐藏（只在确有未归类供应商时才出现）。
  // - 搜索时隐藏所有空组（含已建的空分组）；非搜索时空分组保留以便管理。
  // 注意：此 useMemo 必须位于下面所有提前 return 之前，否则在 isLoading/空列表
  // 首屏短路返回时不会被调用，等数据加载后再调用会触发 Hooks 顺序违例导致白屏。
  const folderGroups = useMemo(() => {
    const groups = groupProvidersByFolder(filteredProviders, folders);
    return groups.filter((g) => {
      if (g.folderId === null && g.providers.length === 0) return false;
      if (isSearching && g.providers.length === 0) return false;
      return true;
    });
  }, [filteredProviders, folders, isSearching]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="w-full border border-dashed rounded-lg h-28 border-muted-foreground/40 bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (sortedProviders.length === 0) {
    return (
      <ProviderEmptyState
        appId={appId}
        onCreate={onCreate}
        onImport={() => importMutation.mutate()}
      />
    );
  }

  const handleProviderContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    provider: Provider,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setCtxMenu({ x: event.clientX, y: event.clientY, provider });
  };

  const moveProviderTo = (provider: Provider, folderId: string | null) => {
    setCtxMenu(null);
    if ((provider.meta?.folderId ?? null) === folderId) return;
    moveFolderMutation.mutate({ providerId: provider.id, folderId });
  };

  const openFolderDialog = (moveProvider: Provider | null) => {
    setCtxMenu(null);
    setFolderDialogName("");
    setFolderDialog({ moveProvider });
  };

  const closeFolderDialog = () => {
    setFolderDialog(null);
    setFolderDialogName("");
  };

  const submitFolderDialog = async () => {
    const name = folderDialogName.trim();
    if (!name) return;
    const target = folderDialog?.moveProvider ?? null;
    try {
      const folder = await createFolderMutation.mutateAsync(name);
      if (target) {
        await moveFolderMutation.mutateAsync({
          providerId: target.id,
          folderId: folder.id,
        });
      }
      // 让用户立刻看到新分组效果
      setViewMode("grouped");
    } catch {
      // 失败已由 mutation 的 onError toast 提示
    } finally {
      closeFolderDialog();
    }
  };

  const renderProvider = (provider: Provider): ReactNode => {
    const isOmo = provider.category === "omo";
    const isOmoSlim = provider.category === "omo-slim";
    const isOmoCurrent = isOmo && provider.id === (currentOmoId || "");
    const isOmoSlimCurrent =
      isOmoSlim && provider.id === (currentOmoSlimId || "");
    const isHermesCurrent =
      appId === "hermes" && hermesCurrentProviderId === provider.id;
    return (
      <div
        key={provider.id}
        onContextMenu={(event) => handleProviderContextMenu(event, provider)}
      >
        <SortableProviderCard
          provider={provider}
          isCurrent={
            isOmo
              ? isOmoCurrent
              : isOmoSlim
                ? isOmoSlimCurrent
                : appId === "hermes"
                  ? isHermesCurrent
                  : provider.id === currentProviderId
          }
          appId={appId}
          isInConfig={isProviderInConfig(provider.id)}
          isOmo={isOmo}
          isOmoSlim={isOmoSlim}
          onSwitch={onSwitch}
          onEdit={onEdit}
          onDelete={onDelete}
          onRemoveFromConfig={onRemoveFromConfig}
          onDisableOmo={onDisableOmo}
          onDisableOmoSlim={onDisableOmoSlim}
          onDuplicate={onDuplicate}
          onConfigureUsage={onConfigureUsage}
          onOpenWebsite={onOpenWebsite}
          onOpenTerminal={onOpenTerminal}
          onTest={handleTest}
          isTesting={isChecking(provider.id)}
          isProxyRunning={isProxyRunning}
          isProxyTakeover={isProxyTakeover}
          isAutoFailoverEnabled={isFailoverModeActive}
          failoverPriority={getFailoverPriority(provider.id)}
          isInFailoverQueue={isInFailoverQueue(provider.id)}
          onToggleFailover={(enabled) =>
            handleToggleFailover(provider.id, enabled)
          }
          activeProviderId={activeProviderId}
          // OpenClaw: default model / Hermes: model.provider === provider.id
          isDefaultModel={
            appId === "hermes"
              ? isHermesCurrent
              : isProviderDefaultModel(provider.id)
          }
          onSetAsDefault={
            onSetAsDefault ? () => onSetAsDefault(provider) : undefined
          }
        />
      </div>
    );
  };

  const renderProviderList = () => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={filteredProviders.map((provider) => provider.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {filteredProviders.map((provider) => renderProvider(provider))}
        </div>
      </SortableContext>
    </DndContext>
  );

  // 分组模式下的拖拽：仅支持同组内重排。
  // 把目标组内重排后，与其他组拼回完整顺序，再 0..N 重写 sortIndex。
  const handleGroupedDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // ── 文件夹排序：active.id 形如 "folder:<id>" ──
    if (activeId.startsWith("folder:")) {
      const realGroups = groupProvidersByFolder(
        sortedProviders,
        folders,
      ).filter((g) => g.folderId !== null);
      const orderIds = realGroups.map((g) => g.folderId as string);
      const activeFid = activeId.slice("folder:".length);
      // over 可能是文件夹头，也可能是某文件夹内的供应商卡片
      let overFid: string | null;
      if (overId.startsWith("folder:")) {
        overFid = overId.slice("folder:".length);
      } else {
        overFid =
          realGroups.find((g) => g.providers.some((p) => p.id === overId))
            ?.folderId ?? null;
      }
      if (!overFid || activeFid === overFid) return;
      const oldIndex = orderIds.indexOf(activeFid);
      const newIndex = orderIds.indexOf(overFid);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(orderIds, oldIndex, newIndex);
      const folderUpdates = reordered.map((id, index) => ({
        id,
        sortIndex: index,
      }));
      void (async () => {
        try {
          await providerFoldersApi.updateSortOrder(folderUpdates, appId);
          await queryClient.invalidateQueries({
            queryKey: providerFolderKeys.all(appId),
          });
        } catch (error) {
          console.error("Failed to update folder sort order", error);
          toast.error(
            t("provider.folders.sortFailed", {
              defaultValue: "分组排序更新失败",
            }),
          );
        }
      })();
      return;
    }

    // ── 供应商同组内排序 ──
    const allGroups = groupProvidersByFolder(sortedProviders, folders);
    const sourceGroup = allGroups.find((g) =>
      g.providers.some((p) => p.id === active.id),
    );
    if (!sourceGroup) return;
    // 只允许同组内拖拽
    if (!sourceGroup.providers.some((p) => p.id === over.id)) return;

    const oldIndex = sourceGroup.providers.findIndex((p) => p.id === active.id);
    const newIndex = sourceGroup.providers.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedGroup = arrayMove(sourceGroup.providers, oldIndex, newIndex);

    // 用重排后的组替换，按 allGroups 顺序拼回完整列表
    const flattened: Provider[] = [];
    for (const g of allGroups) {
      if (g.folderId === sourceGroup.folderId) {
        flattened.push(...reorderedGroup);
      } else {
        flattened.push(...g.providers);
      }
    }

    const updates = flattened.map((provider, index) => ({
      id: provider.id,
      sortIndex: index,
    }));

    void (async () => {
      try {
        await providersApi.updateSortOrder(updates, appId);
        await queryClient.invalidateQueries({ queryKey: ["providers", appId] });
        await queryClient.invalidateQueries({
          queryKey: ["failoverQueue", appId],
        });
        try {
          await providersApi.updateTrayMenu();
        } catch (trayError) {
          console.error("Failed to update tray menu after sort", trayError);
        }
      } catch (error) {
        console.error("Failed to update provider sort order", error);
        toast.error(
          t("provider.sortUpdateFailed", { defaultValue: "排序更新失败" }),
        );
      }
    })();
  };

  const renderGroupedList = () => {
    const realGroups = folderGroups.filter((g) => g.folderId !== null);
    const unassigned = folderGroups.find((g) => g.folderId === null) ?? null;
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleGroupedDragEnd}
      >
        <div className="space-y-1">
          <SortableContext
            items={realGroups.map((g) => `folder:${g.folderId}`)}
            strategy={verticalListSortingStrategy}
          >
            {realGroups.map((group) => (
              <SortableFolderGroup
                key={group.folderId}
                group={group}
                open={isSearching || !collapsedFolders.has(group.folderId!)}
                onOpenChange={(open) => setFolderOpen(group.folderId!, open)}
                renderProvider={renderProvider}
                onRename={(name) =>
                  renameFolderMutation.mutate({ id: group.folderId!, name })
                }
                onDelete={() =>
                  setFolderPendingDelete({
                    id: group.folderId!,
                    name: group.folderName,
                  })
                }
              />
            ))}
          </SortableContext>
          {unassigned && (
            <ProviderFolderGroup
              key="__unassigned__"
              group={unassigned}
              open={isSearching || !collapsedFolders.has("__unassigned__")}
              onOpenChange={(open) => setFolderOpen("__unassigned__", open)}
              renderProvider={renderProvider}
            />
          )}
        </div>
      </DndContext>
    );
  };

  return (
    <div className="mt-4 space-y-4">
      {claudeDesktopStatusMessages.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("claudeDesktop.statusTitle", {
              defaultValue: "Claude Desktop 配置需要检查",
            })}
          </div>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed">
            {claudeDesktopStatusMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 文件夹分组工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={viewMode === "grouped" ? "secondary" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            setViewMode((m) => (m === "grouped" ? "flat" : "grouped"))
          }
        >
          {viewMode === "grouped" ? (
            <List className="size-3.5" />
          ) : (
            <FolderTree className="size-3.5" />
          )}
          <span className="text-xs">
            {viewMode === "grouped"
              ? t("provider.viewFlat", { defaultValue: "平铺" })
              : t("provider.viewGrouped", { defaultValue: "按分组" })}
          </span>
        </Button>

        {viewMode === "grouped" &&
          (isCreatingFolder ? (
            <div className="flex items-center gap-1.5">
              <Input
                ref={newFolderInputRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t("provider.folders.createPlaceholder", {
                  defaultValue: "分组名称",
                })}
                className="h-8 w-44 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const name = newFolderName.trim();
                    if (name) {
                      createFolderMutation.mutate(name);
                    }
                    setNewFolderName("");
                    setIsCreatingFolder(false);
                  }
                  if (e.key === "Escape") {
                    setNewFolderName("");
                    setIsCreatingFolder(false);
                  }
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  const name = newFolderName.trim();
                  if (name) {
                    createFolderMutation.mutate(name);
                  }
                  setNewFolderName("");
                  setIsCreatingFolder(false);
                }}
              >
                {t("provider.folders.createConfirm", { defaultValue: "创建" })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setNewFolderName("");
                  setIsCreatingFolder(false);
                }}
              >
                {t("common.cancel", { defaultValue: "取消" })}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setIsCreatingFolder(true)}
            >
              <FolderPlus className="size-3.5" />
              <span className="text-xs">
                {t("provider.folders.createNew", { defaultValue: "新建分组" })}
              </span>
            </Button>
          ))}
      </div>

      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            key="provider-search"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed left-1/2 top-[6.5rem] z-40 w-[min(90vw,26rem)] -translate-x-1/2 sm:right-6 sm:left-auto sm:translate-x-0"
          >
            <div className="p-4 space-y-3 border shadow-md rounded-2xl border-white/10 bg-background/95 shadow-black/20 backdrop-blur-md">
              <div className="relative flex items-center gap-2">
                <Search className="absolute w-4 h-4 -translate-y-1/2 pointer-events-none left-3 top-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={t("provider.searchPlaceholder", {
                    defaultValue: "Search name, notes, or URL...",
                  })}
                  aria-label={t("provider.searchAriaLabel", {
                    defaultValue: "Search providers",
                  })}
                  className="pr-16 pl-9"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute text-xs -translate-y-1/2 right-11 top-1/2"
                    onClick={() => setSearchTerm("")}
                  >
                    {t("common.clear", { defaultValue: "Clear" })}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  onClick={() => setIsSearchOpen(false)}
                  aria-label={t("provider.searchCloseAriaLabel", {
                    defaultValue: "Close provider search",
                  })}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {t("provider.searchScopeHint", {
                    defaultValue: "Matches provider name, notes, and URL.",
                  })}
                </span>
                <span>
                  {t("provider.searchCloseHint", {
                    defaultValue: "Press Esc to close",
                  })}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filteredProviders.length === 0 ? (
        <div className="px-6 py-8 text-sm text-center border border-dashed rounded-lg border-border text-muted-foreground">
          {t("provider.noSearchResults", {
            defaultValue: "No providers match your search.",
          })}
        </div>
      ) : viewMode === "grouped" ? (
        renderGroupedList()
      ) : (
        renderProviderList()
      )}

      <ConfirmDialog
        isOpen={showStreamCheckConfirm}
        variant="info"
        title={t("confirm.streamCheck.title")}
        message={t("confirm.streamCheck.message")}
        confirmText={t("confirm.streamCheck.confirm")}
        onConfirm={() => void handleStreamCheckConfirm()}
        onCancel={() => {
          setShowStreamCheckConfirm(false);
          setPendingTestProvider(null);
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(folderPendingDelete)}
        variant="destructive"
        title={t("provider.folders.deleteTitle", { defaultValue: "删除分组" })}
        message={t("provider.folders.deleteConfirm", {
          defaultValue:
            "删除分组「{{name}}」？里面的供应商会回到「未分配」，不会被删除。",
          name: folderPendingDelete?.name ?? "",
        })}
        confirmText={t("provider.folders.delete", { defaultValue: "删除" })}
        onConfirm={() => {
          if (folderPendingDelete) {
            deleteFolderMutation.mutate(folderPendingDelete.id);
          }
          setFolderPendingDelete(null);
        }}
        onCancel={() => setFolderPendingDelete(null)}
      />

      {/* 供应商卡片右键菜单：移动到分组 / 新建分组 */}
      {ctxMenu && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) setCtxMenu(null);
          }}
        >
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              style={{
                position: "fixed",
                left: ctxMenu.x,
                top: ctxMenu.y,
                width: 0,
                height: 0,
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={2}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="mr-2 size-3.5" />
                {t("provider.folders.contextMove", {
                  defaultValue: "移动到分组",
                })}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {ctxMenu.provider.meta?.folderId && (
                  <>
                    <DropdownMenuItem
                      onClick={() => moveProviderTo(ctxMenu.provider, null)}
                    >
                      {t("provider.folders.moveOut", {
                        defaultValue: "移出分组（未分配）",
                      })}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {folders.length === 0 ? (
                  <DropdownMenuItem disabled>
                    {t("provider.folders.noFolders", {
                      defaultValue: "（暂无分组）",
                    })}
                  </DropdownMenuItem>
                ) : (
                  folders.map((folder) => {
                    const isCurrent =
                      ctxMenu.provider.meta?.folderId === folder.id;
                    return (
                      <DropdownMenuItem
                        key={folder.id}
                        disabled={isCurrent}
                        onClick={() =>
                          moveProviderTo(ctxMenu.provider, folder.id)
                        }
                      >
                        <Check
                          className={
                            isCurrent
                              ? "mr-2 size-3.5"
                              : "mr-2 size-3.5 opacity-0"
                          }
                        />
                        <span className="truncate">{folder.name}</span>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={() => openFolderDialog(ctxMenu.provider)}
            >
              <FolderPlus className="mr-2 size-3.5" />
              {t("provider.folders.createAndMove", {
                defaultValue: "新建分组并移入…",
              })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* 新建分组对话框（含「新建并移入」） */}
      <Dialog
        open={Boolean(folderDialog)}
        onOpenChange={(open) => {
          if (!open) closeFolderDialog();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("provider.folders.dialogTitle", { defaultValue: "新建分组" })}
            </DialogTitle>
            <DialogDescription>
              {folderDialog?.moveProvider
                ? t("provider.folders.dialogDescMove", {
                    defaultValue: "创建一个新分组，并把该供应商移入其中。",
                  })
                : t("provider.folders.dialogDesc", {
                    defaultValue: "创建一个新分组用于整理供应商。",
                  })}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={folderDialogName}
            onChange={(e) => setFolderDialogName(e.target.value)}
            placeholder={t("provider.folders.createPlaceholder", {
              defaultValue: "分组名称",
            })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitFolderDialog();
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={closeFolderDialog}>
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
            <Button
              onClick={() => void submitFolderDialog()}
              disabled={!folderDialogName.trim()}
            >
              {t("provider.folders.createConfirm", { defaultValue: "创建" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SortableProviderCardProps {
  provider: Provider;
  isCurrent: boolean;
  appId: AppId;
  isInConfig: boolean;
  isOmo: boolean;
  isOmoSlim: boolean;
  onSwitch: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onRemoveFromConfig?: (provider: Provider) => void;
  onDisableOmo?: () => void;
  onDisableOmoSlim?: () => void;
  onDuplicate: (provider: Provider) => void;
  onConfigureUsage?: (provider: Provider) => void;
  onOpenWebsite: (url: string) => void;
  onOpenTerminal?: (provider: Provider) => void;
  onTest?: (provider: Provider) => void;
  isTesting: boolean;
  isProxyRunning: boolean;
  isProxyTakeover: boolean;
  isAutoFailoverEnabled: boolean;
  failoverPriority?: number;
  isInFailoverQueue: boolean;
  onToggleFailover: (enabled: boolean) => void;
  activeProviderId?: string;
  // OpenClaw: default model
  isDefaultModel?: boolean;
  onSetAsDefault?: () => void;
}

function SortableProviderCard({
  provider,
  isCurrent,
  appId,
  isInConfig,
  isOmo,
  isOmoSlim,
  onSwitch,
  onEdit,
  onDelete,
  onRemoveFromConfig,
  onDisableOmo,
  onDisableOmoSlim,
  onDuplicate,
  onConfigureUsage,
  onOpenWebsite,
  onOpenTerminal,
  onTest,
  isTesting,
  isProxyRunning,
  isProxyTakeover,
  isAutoFailoverEnabled,
  failoverPriority,
  isInFailoverQueue,
  onToggleFailover,
  activeProviderId,
  isDefaultModel,
  onSetAsDefault,
}: SortableProviderCardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: provider.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ProviderCard
        provider={provider}
        isCurrent={isCurrent}
        appId={appId}
        isInConfig={isInConfig}
        isOmo={isOmo}
        isOmoSlim={isOmoSlim}
        onSwitch={onSwitch}
        onEdit={onEdit}
        onDelete={onDelete}
        onRemoveFromConfig={onRemoveFromConfig}
        onDisableOmo={onDisableOmo}
        onDisableOmoSlim={onDisableOmoSlim}
        onDuplicate={onDuplicate}
        onConfigureUsage={
          onConfigureUsage ? (item) => onConfigureUsage(item) : () => undefined
        }
        onOpenWebsite={onOpenWebsite}
        onOpenTerminal={onOpenTerminal}
        onTest={onTest}
        isTesting={isTesting}
        isProxyRunning={isProxyRunning}
        isProxyTakeover={isProxyTakeover}
        dragHandleProps={{
          attributes,
          listeners,
          isDragging,
        }}
        isAutoFailoverEnabled={isAutoFailoverEnabled}
        failoverPriority={failoverPriority}
        isInFailoverQueue={isInFailoverQueue}
        onToggleFailover={onToggleFailover}
        activeProviderId={activeProviderId}
        // OpenClaw: default model
        isDefaultModel={isDefaultModel}
        onSetAsDefault={onSetAsDefault}
      />
    </div>
  );
}

interface SortableFolderGroupProps {
  group: ProviderGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderProvider: (provider: Provider) => ReactNode;
  onRename: (name: string) => void;
  onDelete: () => void;
}

/** 把文件夹分组包成可拖拽排序的项（仅真实文件夹使用）。 */
function SortableFolderGroup({
  group,
  open,
  onOpenChange,
  renderProvider,
  onRename,
  onDelete,
}: SortableFolderGroupProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `folder:${group.folderId}` });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ProviderFolderGroup
        group={group}
        open={open}
        onOpenChange={onOpenChange}
        renderProvider={renderProvider}
        onRename={onRename}
        onDelete={onDelete}
        dragHandleProps={{ attributes, listeners, isDragging }}
      />
    </div>
  );
}
