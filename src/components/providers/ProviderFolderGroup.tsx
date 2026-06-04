import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  ChevronRight,
  FolderOpen,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Provider } from "@/types";
import type { ProviderGroup } from "./grouping";

interface ProviderFolderGroupProps {
  group: ProviderGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 渲染单个供应商卡片（由 ProviderList 提供，内部含 SortableProviderCard）。 */
  renderProvider: (provider: Provider) => ReactNode;
  /** 仅真实文件夹提供：重命名。 */
  onRename?: (name: string) => void;
  /** 仅真实文件夹提供：删除。 */
  onDelete?: () => void;
  /** 仅真实文件夹提供：拖拽排序手柄（来自 dnd-kit useSortable）。 */
  dragHandleProps?: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
    isDragging?: boolean;
  };
}

/**
 * 一个可折叠的供应商文件夹分组。
 * Header 显示文件夹名 + 供应商数量；body 复用 ProviderList 传入的卡片渲染。
 * 真实文件夹支持重命名 / 删除 / 拖拽排序；「未分配」伪分组不显示这些操作。
 */
export function ProviderFolderGroup({
  group,
  open,
  onOpenChange,
  renderProvider,
  onRename,
  onDelete,
  dragHandleProps,
}: ProviderFolderGroupProps) {
  const { t } = useTranslation();
  const isUnassigned = group.folderId === null;
  const label = isUnassigned
    ? t("provider.folders.unassigned", { defaultValue: "未分配" })
    : group.folderName;

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(group.folderName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      const frame = requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isEditing]);

  const startRename = () => {
    setDraftName(group.folderName);
    setIsEditing(true);
  };

  const commitRename = () => {
    const next = draftName.trim();
    if (next && next !== group.folderName) {
      onRename?.(next);
    }
    setIsEditing(false);
  };

  const cancelRename = () => {
    setDraftName(group.folderName);
    setIsEditing(false);
  };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-1 rounded-md px-1 py-1 transition-colors hover:bg-muted/50">
        {dragHandleProps && (
          <button
            type="button"
            className={cn(
              "flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing",
              dragHandleProps.isDragging && "cursor-grabbing",
            )}
            aria-label={t("provider.folders.dragHandle", {
              defaultValue: "拖拽排序",
            })}
            {...dragHandleProps.attributes}
            {...(dragHandleProps.listeners ?? {})}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left"
          >
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <FolderOpen
              className={cn(
                "size-4 shrink-0",
                isUnassigned ? "text-muted-foreground/60" : "text-amber-500",
              )}
            />
            {isEditing ? (
              <Input
                ref={inputRef}
                value={draftName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                }}
                className="h-7 min-w-0 flex-1 text-sm"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {label}
              </span>
            )}
            <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px]">
              {group.providers.length}
            </Badge>
          </button>
        </CollapsibleTrigger>

        {!isUnassigned &&
          (isEditing ? (
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={commitRename}
                aria-label={t("common.confirm", { defaultValue: "确认" })}
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={cancelRename}
                aria-label={t("common.cancel", { defaultValue: "取消" })}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 opacity-60 hover:opacity-100"
                  aria-label={t("provider.folders.menu", {
                    defaultValue: "分组操作",
                  })}
                >
                  <MoreVertical className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={startRename}>
                  <Pencil className="mr-2 size-3.5" />
                  {t("provider.folders.rename", { defaultValue: "重命名" })}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete?.()}
                >
                  <Trash2 className="mr-2 size-3.5" />
                  {t("provider.folders.delete", { defaultValue: "删除" })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
      </div>

      <CollapsibleContent>
        <div className="space-y-3 py-2 pl-5">
          {group.providers.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {t("provider.folders.empty", {
                defaultValue: "（此分组为空）",
              })}
            </p>
          ) : (
            <SortableContext
              items={group.providers.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {group.providers.map((provider) => renderProvider(provider))}
            </SortableContext>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
