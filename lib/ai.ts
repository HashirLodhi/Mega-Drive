import "server-only";
import type { PublicAccount, ConnectedAccount, DriveItem } from "./types";
import { listAccounts } from "./store";
import {
  publicAccount, listDriveFiles, listFolderFiles, findFolderByName,
  setTrashed, removeFromMyDrive, permanentlyDelete, copyFileBetweenAccounts, emptyTrash,
} from "./google";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const MAX_HISTORY = 20;
const HISTORY_TTL_MS = 30 * 60 * 1000;

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

const tools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_accounts",
      description: "List all connected Google accounts with their storage usage.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search for files in a specific Google Drive account. Returns file names, types, sizes, and modification dates.",
      parameters: {
        type: "object",
        properties: {
          account_name: { type: "string", description: "The name of the account to search. Use 'all' for all accounts." },
          query: { type: "string", description: "Search query to filter files by name. Leave empty to list all." },
          mime_type: { type: "string", description: "Filter by MIME type. e.g. 'application/pdf', 'video/mp4', 'application/vnd.google-apps.folder'" },
          folder_name: { type: "string", description: "If provided, list files inside this folder instead of root. Use folder name or path like 'Photos/Vacation'." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_details",
      description: "Get detailed information about a specific file including ownership, permissions, and capabilities.",
      parameters: {
        type: "object",
        properties: {
          account_name: { type: "string", description: "The name of the account that owns the file." },
          file_name: { type: "string", description: "The name of the file to get details for." },
        },
        required: ["account_name", "file_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_storage_summary",
      description: "Get a summary of storage usage across all connected accounts.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "trash_files",
      description: "Move files to trash or restore them from trash. Use with caution.",
      parameters: {
        type: "object",
        properties: {
          account_name: { type: "string", description: "The account to trash files from." },
          file_names: { type: "array", items: { type: "string" }, description: "List of file names to trash or restore." },
          trash: { type: "boolean", description: "true to trash files, false to restore from trash." },
          confirm: { type: "boolean", description: "Set to true to execute. false to preview first." },
        },
        required: ["account_name", "file_names", "trash"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_files",
      description: "Permanently delete files. This cannot be undone.",
      parameters: {
        type: "object",
        properties: {
          account_name: { type: "string", description: "The account to delete files from." },
          file_names: { type: "array", items: { type: "string" }, description: "List of file names to permanently delete." },
          confirm: { type: "boolean", description: "Set to true to execute. false to preview first." },
        },
        required: ["account_name", "file_names"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "copy_files",
      description: "Copy files from one account to another account. Source files are kept.",
      parameters: {
        type: "object",
        properties: {
          source_account: { type: "string", description: "The account to copy files FROM." },
          dest_account: { type: "string", description: "The account to copy files TO." },
          file_names: { type: "array", items: { type: "string" }, description: "List of file names to copy." },
          dest_folder: { type: "string", description: "Optional destination folder name. Defaults to root." },
          confirm: { type: "boolean", description: "Set to true to execute. false to preview first." },
        },
        required: ["source_account", "dest_account", "file_names"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_from_drive",
      description: "Remove shared files from My Drive without deleting them. They remain accessible via sharing.",
      parameters: {
        type: "object",
        properties: {
          account_name: { type: "string", description: "The account to remove files from." },
          file_names: { type: "array", items: { type: "string" }, description: "List of file names to remove from My Drive." },
          confirm: { type: "boolean", description: "Set to true to execute. false to preview first." },
        },
        required: ["account_name", "file_names"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smart_cleanup",
      description: "Analyze storage and perform intelligent cleanup. Finds large files, old files, trash, duplicates, and suggests/execute cleanup actions.",
      parameters: {
        type: "object",
        properties: {
          account_name: { type: "string", description: "Account to clean up. Use 'all' for all accounts." },
          confirm: { type: "boolean", description: "Set to true to execute cleanup. false to preview analysis first." },
          clean_trash: { type: "boolean", description: "Empty trash folders." },
          clean_large: { type: "boolean", description: "Trash large files (over 100MB)."},
          clean_old: { type: "boolean", description: "Trash files older than 6 months." },
          clean_duplicates: { type: "boolean", description: "Find and report duplicates (by name+size)." },
        },
      },
    },
  },
];

const systemPrompt = `You are MegaDrive's AI assistant. You help users manage their Google Drive storage across multiple connected accounts.

YOUR CAPABILITIES:
- Answer questions about connected accounts and storage usage
- Search for files across accounts and inside folders
- Provide details about specific files
- Suggest storage optimization strategies
- **TRASH** files (move to trash) — reversible
- **RESTORE** files from trash
- **PERMANENTLY DELETE** files — irreversible
- **COPY** files between accounts (source kept)
- **REMOVE** shared files from My Drive (not deleted, just unlisted)
- **SMART CLEANUP** — analyze storage, find duplicates, trash old/large files, empty trash

ACTION WORKFLOW:
When a user asks you to perform an action (trash, delete, copy, cleanup, etc.):
1. FIRST call the tool with confirm=false to preview what will happen
2. Show the user a clear summary: what files, how many, total size, any risks
3. Ask "Shall I proceed?" 
4. When user confirms, call the tool again with confirm=true
5. Report results with counts and any errors

GUIDELINES:
- Be concise. Use short responses with clean formatting.
- When listing files, use a numbered list with name, type, and size.
- When discussing storage, show used vs total with percentages.
- For destructive actions (delete), ALWAYS preview first and warn about irreversibility.
- For smart cleanup, always show the analysis before executing.
- Never expose raw API data, tokens, or internal IDs to the user.
- Use the available tools to fetch real data from connected accounts.
- For folder browsing, use the folder_name parameter in search_files.`;

type Conversation = { messages: ChatMessage[]; lastAccess: number };
const conversations = new Map<string, Conversation>();

function getConversation(sessionId: string): ChatMessage[] {
  const existing = conversations.get(sessionId);
  if (existing) {
    existing.lastAccess = Date.now();
    return existing.messages;
  }
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];
  conversations.set(sessionId, { messages, lastAccess: Date.now() });
  return messages;
}

function evictOldConversations() {
  const now = Date.now();
  for (const [key, conv] of conversations) {
    if (now - conv.lastAccess > HISTORY_TTL_MS) conversations.delete(key);
  }
}

async function resolveAccountId(workspaceId: string, accountName: string): Promise<string | null> {
  const accounts = await listAccounts(workspaceId);
  if (accountName.toLowerCase() === "all") return "all";
  const match = accounts.find(
    (a) => a.name.toLowerCase().includes(accountName.toLowerCase()) || a.email.toLowerCase().includes(accountName.toLowerCase()),
  );
  return match?.id ?? null;
}

async function findFilesByName(account: ConnectedAccount, names: string[], trashed = false): Promise<DriveItem[]> {
  const found: DriveItem[] = [];
  for (const name of names) {
    const result = await listDriveFiles(account, { query: name, trashed });
    const exact = result.files?.filter((f) => f.name.toLowerCase() === name.toLowerCase()) || result.files || [];
    found.push(...exact);
  }
  return found;
}

async function findFilesInFolder(account: ConnectedAccount, folderPath: string, query?: string): Promise<{ folder: string; files: DriveItem[]; folderId: string }> {
  const segments = folderPath.split("/").map((s) => s.trim()).filter(Boolean);
  let parentId = "root";
  for (const seg of segments) {
    const id = await findFolderByName(account, seg, parentId);
    if (!id) return { folder: folderPath, files: [], folderId: "" };
    parentId = id;
  }
  const result = await listFolderFiles(account, parentId, query);
  return { folder: folderPath, files: result.files || [], folderId: parentId };
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

async function executeTool(workspaceId: string, name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "list_accounts": {
        const accounts = await listAccounts(workspaceId);
        const publicAccounts = await Promise.allSettled(accounts.map(publicAccount));
        const results = publicAccounts.filter((r): r is PromiseFulfilledResult<PublicAccount> => r.status === "fulfilled").map((r) => r.value);
        if (!results.length) return "No accounts connected.";
        return JSON.stringify(
          results.map((a) => ({
            name: a.name,
            email: a.email,
            usedGB: (a.storage.usage / 1073741824).toFixed(1),
            totalGB: a.storage.limit ? (a.storage.limit / 1073741824).toFixed(1) : "unlimited",
            trashGB: (a.storage.usageInTrash / 1073741824).toFixed(1),
          })),
        );
      }

      case "search_files": {
        const accountName = (args.account_name as string) || "all";
        const accountId = await resolveAccountId(workspaceId, accountName);
        if (!accountId) return `Account "${accountName}" not found.`;
        const accounts = await listAccounts(workspaceId);
        const targets = accountId === "all" ? accounts : accounts.filter((a) => a.id === accountId);
        const allFiles: { account: string; folder?: string; files: unknown[] }[] = [];

        for (const account of targets) {
          if (args.folder_name) {
            const { folder, files, folderId } = await findFilesInFolder(account, args.folder_name as string, (args.query as string) || undefined);
            if (!folderId) { allFiles.push({ account: account.name, folder: args.folder_name as string, files: [], }); continue; }
            let filtered = files;
            if (args.mime_type) {
              const mimeFilter = (args.mime_type as string).toLowerCase();
              filtered = filtered.filter((f) => f.mimeType.toLowerCase().includes(mimeFilter));
            }
            if (filtered.length) {
              allFiles.push({
                account: account.name,
                folder,
                files: filtered.slice(0, 50).map((f) => ({
                  name: f.name,
                  type: f.mimeType === "application/vnd.google-apps.folder" ? "folder" : (f.mimeType.split(".").pop()?.split("/").pop() || f.mimeType),
                  size: f.size ? fmtBytes(Number(f.size)) : (f.mimeType === "application/vnd.google-apps.folder" ? "—" : "N/A"),
                  modified: f.modifiedTime,
                  md5: f.md5Checksum,
                  ownedByMe: f.ownedByMe,
                })),
              });
            }
          } else {
            const result = await listDriveFiles(account, { query: (args.query as string) || undefined, trashed: false });
            let files = result.files || [];
            if (args.mime_type) {
              const mimeFilter = (args.mime_type as string).toLowerCase();
              files = files.filter((f) => f.mimeType.toLowerCase().includes(mimeFilter));
            }
            if (files.length) {
              allFiles.push({
                account: account.name,
                files: files.slice(0, 20).map((f) => ({
                  name: f.name,
                  type: f.mimeType.split(".").pop()?.split("/").pop() || f.mimeType,
                  size: f.size ? fmtBytes(Number(f.size)) : "N/A",
                  modified: f.modifiedTime,
                  md5: f.md5Checksum,
                  ownedByMe: f.ownedByMe,
                })),
              });
            }
          }
        }
        if (!allFiles.length) return "No files found matching your search.";
        return JSON.stringify(allFiles);
      }

      case "get_file_details": {
        const accountId = await resolveAccountId(workspaceId, args.account_name as string);
        if (!accountId || accountId === "all") return "Please specify a specific account.";
        const accounts = await listAccounts(workspaceId);
        const account = accounts.find((a) => a.id === accountId);
        if (!account) return "Account not found.";
        const result = await listDriveFiles(account, { query: args.file_name as string, trashed: false });
        const file = result.files?.[0];
        if (!file) return "File not found.";
        return JSON.stringify({
          name: file.name,
          type: file.mimeType,
          size: file.size ? fmtBytes(Number(file.size)) : "N/A",
          created: file.createdTime,
          modified: file.modifiedTime,
          ownedByMe: file.ownedByMe,
          shared: file.shared,
          owners: file.owners?.map((o) => o.emailAddress),
          md5: file.md5Checksum,
        });
      }

      case "get_storage_summary": {
        const accounts = await listAccounts(workspaceId);
        const results = await Promise.allSettled(accounts.map(publicAccount));
        const publicAccounts = results.filter((r): r is PromiseFulfilledResult<PublicAccount> => r.status === "fulfilled").map((r) => r.value);
        let totalUsed = 0;
        let totalLimit = 0;
        const breakdown = publicAccounts.map((a) => {
          const used = a.storage.usage;
          const limit = a.storage.limit ?? 0;
          totalUsed += used;
          totalLimit += limit;
          return {
            name: a.name,
            email: a.email,
            usedGB: (used / 1073741824).toFixed(1),
            totalGB: limit ? (limit / 1073741824).toFixed(1) : "unlimited",
            percentUsed: limit ? Math.round((used / limit) * 100) : 0,
          };
        });
        return JSON.stringify({
          totalUsedGB: (totalUsed / 1073741824).toFixed(1),
          totalLimitGB: totalLimit ? (totalLimit / 1073741824).toFixed(1) : "unlimited",
          percentUsed: totalLimit ? Math.round((totalUsed / totalLimit) * 100) : 0,
          accounts: breakdown,
        });
      }

      case "trash_files": {
        const accountName = args.account_name as string;
        const fileNames = args.file_names as string[];
        const trash = args.trash as boolean;
        const confirm = args.confirm as boolean;
        const accountId = await resolveAccountId(workspaceId, accountName);
        if (!accountId) return `Account "${accountName}" not found.`;
        const accounts = await listAccounts(workspaceId);
        const account = accounts.find((a) => a.id === accountId);
        if (!account) return "Account not found.";

        const files = await findFilesByName(account, fileNames, !trash);
        if (!files.length) return `No matching files found for: ${fileNames.join(", ")}`;

        const canDo = files.filter((f) => f.capabilities?.canTrash);
        const cannotDo = files.filter((f) => !f.capabilities?.canTrash);
        const totalSize = files.reduce((s, f) => s + (f.size ? Number(f.size) : 0), 0);

        if (!confirm) {
          const lines = files.map((f, i) => `${i + 1}. ${f.name} (${f.size ? fmtBytes(Number(f.size)) : "unknown"})`);
          let preview = `Found ${files.length} file(s) to ${trash ? "trash" : "restore"}:\n${lines.join("\n")}\n\nTotal size: ${fmtBytes(totalSize)}`;
          if (cannotDo.length) preview += `\n\nWarning: ${cannotDo.length} file(s) lack trash permission and will be skipped.`;
          preview += `\n\nShall I proceed? Reply with confirm=true to execute.`;
          return preview;
        }

        let success = 0;
        let failed = 0;
        for (const file of canDo) {
          try {
            await setTrashed(account, file.id, trash);
            success++;
          } catch { failed++; }
        }
        return `Done! ${trash ? "Trashed" : "Restored"} ${success} file(s).${failed ? ` ${failed} failed.` : ""} Total size: ${fmtBytes(totalSize)}.`;
      }

      case "delete_files": {
        const accountName = args.account_name as string;
        const fileNames = args.file_names as string[];
        const confirm = args.confirm as boolean;
        const accountId = await resolveAccountId(workspaceId, accountName);
        if (!accountId) return `Account "${accountName}" not found.`;
        const accounts = await listAccounts(workspaceId);
        const account = accounts.find((a) => a.id === accountId);
        if (!account) return "Account not found.";

        const files = await findFilesByName(account, fileNames, true);
        if (!files.length) return `No matching files found for: ${fileNames.join(", ")}`;

        const canDo = files.filter((f) => f.capabilities?.canDelete);
        const cannotDo = files.filter((f) => !f.capabilities?.canDelete);
        const totalSize = files.reduce((s, f) => s + (f.size ? Number(f.size) : 0), 0);

        if (!confirm) {
          const lines = files.map((f, i) => `${i + 1}. ${f.name} (${f.size ? fmtBytes(Number(f.size)) : "unknown"})`);
          let preview = `Found ${files.length} file(s) to PERMANENTLY DELETE:\n${lines.join("\n")}\n\nTotal size: ${fmtBytes(totalSize)}`;
          preview += `\n\n⚠️ This action CANNOT be undone.`;
          if (cannotDo.length) preview += `\n\nNote: ${cannotDo.length} file(s) lack delete permission and will be skipped.`;
          preview += `\n\nShall I proceed? Reply with confirm=true to execute.`;
          return preview;
        }

        let success = 0;
        let failed = 0;
        for (const file of canDo) {
          try {
            await permanentlyDelete(account, file.id);
            success++;
          } catch { failed++; }
        }
        return `Done! Permanently deleted ${success} file(s).${failed ? ` ${failed} failed.` : ""} Total size freed: ${fmtBytes(totalSize)}.`;
      }

      case "copy_files": {
        const sourceName = args.source_account as string;
        const destName = args.dest_account as string;
        const fileNames = args.file_names as string[];
        const destFolder = args.dest_folder as string | undefined;
        const confirm = args.confirm as boolean;

        const sourceId = await resolveAccountId(workspaceId, sourceName);
        const destId = await resolveAccountId(workspaceId, destName);
        if (!sourceId || sourceId === "all") return `Source account "${sourceName}" not found.`;
        if (!destId || destId === "all") return `Destination account "${destName}" not found.`;

        const accounts = await listAccounts(workspaceId);
        const source = accounts.find((a) => a.id === sourceId);
        const dest = accounts.find((a) => a.id === destId);
        if (!source) return "Source account not found.";
        if (!dest) return "Destination account not found.";

        const files = await findFilesByName(source, fileNames);
        if (!files.length) return `No matching files found for: ${fileNames.join(", ")}`;

        const totalSize = files.reduce((s, f) => s + (f.size ? Number(f.size) : 0), 0);
        let destParentId = "root";
        if (destFolder) {
          destParentId = await findFolderByName(dest, destFolder) || "";
          if (!destParentId) {
            const { ensureDriveFolderPath } = await import("./google");
            destParentId = await ensureDriveFolderPath(dest, destFolder.split("/").map((s) => s.trim()).filter(Boolean));
          }
        }

        if (!confirm) {
          const lines = files.map((f, i) => `${i + 1}. ${f.name} (${f.size ? fmtBytes(Number(f.size)) : "unknown"})`);
          let preview = `Will copy ${files.length} file(s) from ${source.name} to ${dest.name}:\n${lines.join("\n")}\n\nTotal size: ${fmtBytes(totalSize)}`;
          if (destFolder) preview += `\nDestination folder: ${destFolder}`;
          preview += `\n\nSource files will be kept.`;
          preview += `\n\nShall I proceed? Reply with confirm=true to execute.`;
          return preview;
        }

        let success = 0;
        let failed = 0;
        const errors: string[] = [];
        for (const file of files) {
          try {
            await copyFileBetweenAccounts(source, dest, file.id, destParentId);
            success++;
          } catch (e) {
            failed++;
            errors.push(`${file.name}: ${(e as Error).message}`);
          }
        }
        let result = `Done! Copied ${success} file(s) from ${source.name} to ${dest.name}.`;
        if (failed) result += ` ${failed} failed.`;
        if (errors.length) result += `\nErrors:\n${errors.join("\n")}`;
        return result;
      }

      case "remove_from_drive": {
        const accountName = args.account_name as string;
        const fileNames = args.file_names as string[];
        const confirm = args.confirm as boolean;
        const accountId = await resolveAccountId(workspaceId, accountName);
        if (!accountId) return `Account "${accountName}" not found.`;
        const accounts = await listAccounts(workspaceId);
        const account = accounts.find((a) => a.id === accountId);
        if (!account) return "Account not found.";

        const files = await findFilesByName(account, fileNames);
        const removable = files.filter((f) => !f.ownedByMe && f.capabilities?.canRemoveMyDriveParent && f.parents?.length === 1);
        const notRemovable = files.filter((f) => f.ownedByMe || !f.capabilities?.canRemoveMyDriveParent || (f.parents?.length ?? 0) !== 1);

        if (!removable.length) return `No removable shared files found. ${notRemovable.length} file(s) cannot be removed (owned or no parent).`;

        if (!confirm) {
          const lines = removable.map((f, i) => `${i + 1}. ${f.name} (${f.size ? fmtBytes(Number(f.size)) : "unknown"})`);
          let preview = `Found ${removable.length} shared file(s) to remove from My Drive:\n${lines.join("\n")}`;
          if (notRemovable.length) preview += `\n\n${notRemovable.length} file(s) will be skipped (owned or not removable).`;
          preview += `\n\nFiles will remain accessible via sharing links.`;
          preview += `\n\nShall I proceed? Reply with confirm=true to execute.`;
          return preview;
        }

        let success = 0;
        let failed = 0;
        for (const file of removable) {
          try {
            await removeFromMyDrive(account, file.id, file.parents![0]);
            success++;
          } catch { failed++; }
        }
        return `Done! Removed ${success} file(s) from My Drive.${failed ? ` ${failed} failed.` : ""} Files remain accessible via sharing.`;
      }

      case "smart_cleanup": {
        const accountName = (args.account_name as string) || "all";
        const confirm = args.confirm as boolean;
        const cleanTrash = args.clean_trash as boolean;
        const cleanLarge = args.clean_large as boolean;
        const cleanOld = args.clean_old as boolean;
        const cleanDuplicates = args.clean_duplicates as boolean;

        const accountId = await resolveAccountId(workspaceId, accountName);
        if (!accountId) return `Account "${accountName}" not found.`;
        const accounts = await listAccounts(workspaceId);
        const targets = accountId === "all" ? accounts : accounts.filter((a) => a.id === accountId);

        const analysis: {
          trashFiles: { account: string; files: DriveItem[]; totalSize: number };
          largeFiles: { account: string; files: DriveItem[]; totalSize: number };
          oldFiles: { account: string; files: DriveItem[]; totalSize: number };
          duplicates: { key: string; files: { account: string; file: DriveItem }[]; totalSize: number }[];
          potentialSavings: number;
        } = {
          trashFiles: { account: "", files: [], totalSize: 0 },
          largeFiles: { account: "", files: [], totalSize: 0 },
          oldFiles: { account: "", files: [], totalSize: 0 },
          duplicates: [],
          potentialSavings: 0,
        };

        const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
        const seenByNameSize = new Map<string, { account: string; file: DriveItem }[]>();

        for (const account of targets) {
          // Trash files
          if (cleanTrash !== false) {
            const trashResult = await listDriveFiles(account, { trashed: true });
            const trashFiles = trashResult.files || [];
            const trashSize = trashFiles.reduce((s, f) => s + (f.size ? Number(f.size) : 0), 0);
            if (trashFiles.length) {
              analysis.trashFiles = { account: account.name, files: trashFiles, totalSize: trashSize };
              analysis.potentialSavings += trashSize;
            }
          }

          // All non-trashed files
          const allResult = await listDriveFiles(account, { trashed: false });
          const allFiles = allResult.files || [];

          // Large files (>100MB)
          if (cleanLarge) {
            const large = allFiles.filter((f) => f.size && Number(f.size) > 104857600 && f.mimeType !== "application/vnd.google-apps.folder");
            const largeSize = large.reduce((s, f) => s + (f.size ? Number(f.size) : 0), 0);
            if (large.length) {
              analysis.largeFiles = { account: account.name, files: large.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0)).slice(0, 20), totalSize: largeSize };
              analysis.potentialSavings += largeSize;
            }
          }

          // Old files (>6 months)
          if (cleanOld) {
            const old = allFiles.filter((f) => {
              if (!f.modifiedTime || f.mimeType === "application/vnd.google-apps.folder") return false;
              return new Date(f.modifiedTime).getTime() < sixMonthsAgo;
            });
            const oldSize = old.reduce((s, f) => s + (f.size ? Number(f.size) : 0), 0);
            if (old.length) {
              analysis.oldFiles = { account: account.name, files: old.sort((a, b) => new Date(a.modifiedTime!).getTime() - new Date(b.modifiedTime!).getTime()).slice(0, 20), totalSize: oldSize };
              analysis.potentialSavings += oldSize;
            }
          }

          // Duplicates (by name + size)
          if (cleanDuplicates !== false) {
            for (const f of allFiles) {
              if (!f.size || f.mimeType === "application/vnd.google-apps.folder") continue;
              const key = `${f.name.toLowerCase()}_${f.size}`;
              if (!seenByNameSize.has(key)) seenByNameSize.set(key, []);
              seenByNameSize.get(key)!.push({ account: account.name, file: f });
            }
          }
        }

        // Deduplicate across accounts
        if (cleanDuplicates !== false) {
          for (const [, entries] of seenByNameSize) {
            if (entries.length > 1) {
              const totalSize = entries.reduce((s, e) => s + (e.file.size ? Number(e.file.size) : 0), 0);
              analysis.duplicates.push({ key: entries[0].file.name, files: entries, totalSize });
            }
          }
          analysis.duplicates.sort((a, b) => b.totalSize - a.totalSize);
          analysis.duplicates = analysis.duplicates.slice(0, 20);
          analysis.potentialSavings += analysis.duplicates.reduce((s, d) => {
            const sizes = d.files.map((e) => Number(e.file.size) || 0);
            const max = Math.max(...sizes);
            return s + sizes.reduce((a, b) => a + b, 0) - max;
          }, 0);
        }

        if (!confirm) {
          let report = `📊 Smart Cleanup Analysis\n\n`;
          report += `Potential space savings: ${fmtBytes(analysis.potentialSavings)}\n\n`;

          if (analysis.trashFiles.totalSize > 0) {
            report += `🗑️ Trash: ${analysis.trashFiles.files.length} files (${fmtBytes(analysis.trashFiles.totalSize)}) in ${analysis.trashFiles.account}\n`;
          }
          if (analysis.largeFiles.totalSize > 0) {
            report += `📦 Large files (>100MB): ${analysis.largeFiles.files.length} files (${fmtBytes(analysis.largeFiles.totalSize)}) in ${analysis.largeFiles.account}\n`;
            const top3 = analysis.largeFiles.files.slice(0, 3);
            for (const f of top3) report += `   - ${f.name} (${fmtBytes(Number(f.size))})\n`;
            if (analysis.largeFiles.files.length > 3) report += `   ... and ${analysis.largeFiles.files.length - 3} more\n`;
          }
          if (analysis.oldFiles.totalSize > 0) {
            report += `📅 Old files (>6 months): ${analysis.oldFiles.files.length} files (${fmtBytes(analysis.oldFiles.totalSize)}) in ${analysis.oldFiles.account}\n`;
          }
          if (analysis.duplicates.length > 0) {
            report += `🔁 Duplicates: ${analysis.duplicates.length} duplicate groups found\n`;
            const top3 = analysis.duplicates.slice(0, 3);
            for (const d of top3) report += `   - "${d.key}" (${d.files.length} copies, ${fmtBytes(d.totalSize)} waste)\n`;
            if (analysis.duplicates.length > 3) report += `   ... and ${analysis.duplicates.length - 3} more groups\n`;
          }

          if (analysis.potentialSavings === 0) return "No cleanup opportunities found. Your storage looks clean!";

          report += `\nShall I proceed with cleanup? Reply with confirm=true to execute.`;
          return report;
        }

        // Execute cleanup
        let freed = 0;
        let cleaned = 0;

        // Empty trash
        if (cleanTrash !== false && analysis.trashFiles.totalSize > 0) {
          for (const account of targets) {
            try {
              await emptyTrash(account);
              freed += analysis.trashFiles.totalSize;
              cleaned += analysis.trashFiles.files.length;
            } catch { /* skip */ }
          }
        }

        // Trash large files
        if (cleanLarge && analysis.largeFiles.totalSize > 0) {
          for (const entry of analysis.largeFiles.files) {
            const account = targets.find((a) => a.name === entry.name) || targets.find((a) => entry.owners?.some((o) => o.emailAddress === a.email));
            if (account && entry.capabilities?.canTrash) {
              try {
                await setTrashed(account, entry.id, true);
                freed += Number(entry.size) || 0;
                cleaned++;
              } catch { /* skip */ }
            }
          }
        }

        // Trash old files
        if (cleanOld && analysis.oldFiles.totalSize > 0) {
          for (const entry of analysis.oldFiles.files) {
            const account = targets.find((a) => a.name === entry.name) || targets.find((a) => entry.owners?.some((o) => o.emailAddress === a.email));
            if (account && entry.capabilities?.canTrash) {
              try {
                await setTrashed(account, entry.id, true);
                freed += Number(entry.size) || 0;
                cleaned++;
              } catch { /* skip */ }
            }
          }
        }

        let result = `✅ Smart Cleanup Complete!\n\n`;
        result += `Cleaned ${cleaned} file(s), freed approximately ${fmtBytes(freed)}.`;
        if (analysis.duplicates.length > 0) {
          result += `\n\nNote: ${analysis.duplicates.length} duplicate groups were found but not auto-deleted. Review them individually to decide which copies to keep.`;
        }
        return result;
      }

      default:
        return "Unknown tool.";
    }
  } catch (error) {
    return `Error: ${(error as Error).message}`;
  }
}

async function callGroq(messages: ChatMessage[]) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured. Get a free key at console.groq.com");
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto", temperature: 0.3, max_tokens: 2048 }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq API error ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

export async function chat(workspaceId: string, sessionId: string, userMessage: string): Promise<ReadableStream<string>> {
  evictOldConversations();
  const messages = getConversation(sessionId);
  messages.push({ role: "user", content: userMessage });
  if (messages.length > MAX_HISTORY + 1) {
    const system = messages[0];
    const recent = messages.slice(-MAX_HISTORY);
    messages.length = 0;
    messages.push(system, ...recent);
  }
  const stream = new ReadableStream<string>({
    start: async (controller) => {
      try {
        let response = await callGroq(messages);
        let iterations = 0;
        while (iterations < 8) {
          const choice = response.choices?.[0];
          if (!choice) break;
          const message = choice.message;
          if (!message.tool_calls?.length) {
            if (message.content) {
              const words = message.content.split(/(\s+)/);
              for (const word of words) {
                controller.enqueue(word);
                await new Promise((r) => setTimeout(r, 15));
              }
              messages.push({ role: "assistant", content: message.content });
            }
            break;
          }
          messages.push({ role: "assistant", content: message.content || "", tool_calls: message.tool_calls });
          for (const toolCall of message.tool_calls) {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeTool(workspaceId, toolCall.function.name, args);
            messages.push({ role: "tool", content: result, tool_call_id: toolCall.id });
          }
          response = await callGroq(messages);
          iterations++;
        }
        if (iterations >= 8) controller.enqueue("I've done several lookups. Please ask a more specific question.");
      } catch (error) {
        controller.enqueue(`Sorry, I encountered an error: ${(error as Error).message}`);
      } finally {
        controller.close();
      }
    },
  });
  return stream;
}

export async function getQuickGreeting(workspaceId: string): Promise<string> {
  try {
    const accounts = await listAccounts(workspaceId);
    if (!accounts.length) return "No accounts connected yet. Click **Connect account** to link your first Google Drive.";
    const results = await Promise.allSettled(accounts.map(publicAccount));
    const valid = results.filter((r): r is PromiseFulfilledResult<PublicAccount> => r.status === "fulfilled").map((r) => r.value);
    if (!valid.length) return "Your accounts are connected but I can't reach them right now.";
    let totalUsed = 0;
    let totalLimit = 0;
    for (const a of valid) {
      totalUsed += a.storage.usage;
      totalLimit += a.storage.limit ?? 0;
    }
    const usedGB = (totalUsed / 1073741824).toFixed(1);
    const totalGB = totalLimit ? (totalLimit / 1073741824).toFixed(0) : "∞";
    const pct = totalLimit ? Math.round((totalUsed / totalLimit) * 100) : 0;
    return `You have **${valid.length} account${valid.length > 1 ? "s" : ""}** connected with **${usedGB} GB** of **${totalGB} GB** used (${pct}%).\n\nAsk me anything about your files or storage. I can also **trash**, **delete**, **copy**, **transfer**, or **clean up** files for you!`;
  } catch {
    return "I'm ready to help manage your Google Drive. Ask me about your files or storage!";
  }
}
