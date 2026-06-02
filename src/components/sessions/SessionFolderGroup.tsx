import { ChevronRight, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SessionMeta } from "@/types";
import { SessionItem } from "./SessionItem";
import type { SessionFolderGroup as FolderGroup } from "./grouping";
import { getSessionKey, highlightText } from "./utils";

interface SessionFolderGroupProps {
  group: FolderGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedKey: string | null;
  selectionMode: boolean;
  searchQuery: string;
  selectedSessionKeys: Set<string>;
  onSelect: (key: string) => void;
  onToggleChecked: (session: SessionMeta, checked: boolean) => void;
}

/**
 * A collapsible group of sessions that share a project directory.
 * Header shows the folder name (full path on hover) and a session count;
 * the body reuses the standard <SessionItem> rows.
 */
export function SessionFolderGroup({
  group,
  open,
  onOpenChange,
  selectedKey,
  selectionMode,
  searchQuery,
  selectedSessionKeys,
  onSelect,
  onToggleChecked,
}: SessionFolderGroupProps) {
  const { t } = useTranslation();
  const isUnknown = group.key === "";
  const label = isUnknown
    ? t("sessionManager.unknownFolder", { defaultValue: "未知目录" })
    : group.label || group.dir || group.key;
  const fullPath = group.dir ?? label;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {searchQuery ? highlightText(label, searchQuery) : label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="break-all font-mono text-xs">{fullPath}</p>
            </TooltipContent>
          </Tooltip>
          <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px]">
            {group.sessions.length}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 pt-1 pl-3">
          {group.sessions.map((session) => (
            <SessionItem
              key={getSessionKey(session)}
              session={session}
              isSelected={
                selectedKey !== null && getSessionKey(session) === selectedKey
              }
              selectionMode={selectionMode}
              searchQuery={searchQuery}
              isChecked={selectedSessionKeys.has(getSessionKey(session))}
              isCheckDisabled={!session.sourcePath}
              onSelect={onSelect}
              onToggleChecked={(checked) => onToggleChecked(session, checked)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
