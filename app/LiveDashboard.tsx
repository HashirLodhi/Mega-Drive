"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AiChat from "./AiChat";

type Account = {
  id: string; email: string; name: string; picture?: string;
  storage: { limit: number | null; usage: number; usageInTrash: number };
};
type DriveFile = {
  id: string; name: string; mimeType: string; size?: string; modifiedTime?: string;
  webViewLink?: string; accountId: string; ownedByMe?: boolean; shared?: boolean;
  driveId?: string; parents?: string[];
  owners?: { displayName?: string; emailAddress?: string; photoLink?: string }[];
  capabilities?: { canDownload?: boolean; canTrash?: boolean; canDelete?: boolean; canCopy?: boolean; canEdit?: boolean; canRemoveMyDriveParent?: boolean };
};
type Upload = {
  id: string; name: string; size: number; uploaded: number; progress: number;
  status: "queued" | "uploading" | "done" | "error"; error?: string; retries?: number;
  speed?: number; startedAt?: number;
};
type UploadSummary = { total: number; uploaded: number; percent: number; done: number; failed: number; active?: Upload; speed: number };

const GB = 1024 ** 3;
const MiB = 1024 ** 2;
const MAX_UPLOAD_ATTEMPTS = 6;
const MAX_API_ATTEMPTS = 3;

const fmtBytes = (n: number) => n >= GB ? `${(n / GB).toFixed(1)} GB` : n >= MiB ? `${(n / MiB).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`;
const fmtSpeed = (bps: number) => bps >= GB ? `${(bps / GB).toFixed(1)} GB/s` : bps >= MiB ? `${(bps / MiB).toFixed(1)} MB/s` : bps >= 1024 ? `${(bps / 1024).toFixed(0)} KB/s` : `${Math.max(0, Math.round(bps))} B/s`;
const fileKind = (mime: string) => mime.includes("folder") ? "Folder" : mime.includes("spreadsheet") ? "Sheet" : mime.includes("presentation") ? "Slides" : mime.includes("document") ? "Doc" : mime.startsWith("image") ? "Image" : mime.startsWith("video") ? "Video" : mime.includes("pdf") ? "PDF" : "File";
const fileIcon = (mime: string) => ({ Folder: "\u25B0", Sheet: "\u25A6", Slides: "\u25A4", Doc: "\u2261", Image: "\u25EB", Video: "\u25B6", PDF: "PDF", File: "\u25A1" })[fileKind(mime) as keyof ReturnType<typeof Object.freeze>] ?? "\u25A1";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function isRetryable(e: unknown) { const m = ((e as Error)?.message || "").toLowerCase(); return m.includes("fetch") || m.includes("network") || m.includes("timeout") || m.includes("econnreset") || m.includes("502") || m.includes("503") || m.includes("504"); }

async function api<T>(url: string, init?: RequestInit, retries = MAX_API_ATTEMPTS): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
      return data as T;
    } catch (e) {
      if (attempt >= retries - 1 || !isRetryable(e)) throw e;
      await sleep(Math.min(800 * Math.pow(2, attempt), 8000));
    }
  }
  throw new Error("Request failed after retries");
}

function LogoMark({ large = false }: { large?: boolean }) {
  return <span className={`logo-mark${large ? " logo-mark-large" : ""}`} aria-hidden="true"><i /><b /></span>;
}

export default function LiveDashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [accountId, setAccountId] = useState("all");
  const [view, setView] = useState<"files" | "trash">("files");
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const speedHistory = useRef<Map<string, { bytes: number; time: number }[]>>(new Map());

  const notify = (message: string) => { setToast(message); setTimeout(() => setToast(""), 3500); };

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
      try {
        const result = await api<{ accounts: Account[]; errors?: { message: string }[] }>("/api/accounts");
        setAccounts(result.accounts);
        if (result.errors?.length) setError(result.errors.map(x => x.message).join(" \u00b7 "));
        break;
      } catch (e) {
        if (attempt >= MAX_API_ATTEMPTS - 1) setError((e as Error).message);
        else await sleep(Math.min(1000 * Math.pow(2, attempt), 8000));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();
    const p = new URLSearchParams(location.search);
    if (p.get("error")) setError(p.get("error")!);
    if (p.get("connected")) { notify("Google Drive connected"); history.replaceState({}, "", "/"); }
  }, [loadAccounts]);

  const loadFiles = useCallback(async () => {
    if (!accounts.length) { setFiles([]); return; }
    setFilesLoading(true);
    setSelected([]);
    for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
      try {
        const targets = accountId === "all" ? accounts : accounts.filter(a => a.id === accountId);
        const groups = await Promise.all(targets.map(async a => {
          const p = new URLSearchParams({ accountId: a.id, trashed: String(view === "trash") });
          if (search.trim()) p.set("q", search.trim());
          const r = await api<{ files: Omit<DriveFile, "accountId">[] }>(`/api/files?${p}`);
          return r.files.map(f => ({ ...f, accountId: a.id }));
        }));
        setFiles(groups.flat().sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || "")));
        break;
      } catch (e) {
        if (attempt >= MAX_API_ATTEMPTS - 1) setError((e as Error).message);
        else await sleep(Math.min(1000 * Math.pow(2, attempt), 8000));
      }
    }
    setFilesLoading(false);
  }, [accounts, accountId, view, search]);

  useEffect(() => { const timer = setTimeout(loadFiles, 250); return () => clearTimeout(timer); }, [loadFiles]);

  const totals = useMemo(() => accounts.reduce((s, a) => ({ used: s.used + a.storage.usage, total: s.total + (a.storage.limit || 0) }), { used: 0, total: 0 }), [accounts]);
  const pct = totals.total ? Math.round(totals.used / totals.total * 100) : 0;
  const visibleFiles = ownedOnly ? files.filter(f => f.ownedByMe) : files;
  const chosen = files.filter(f => selected.includes(f.id));
  const source = chosen.length && chosen.every(f => f.accountId === chosen[0].accountId) ? chosen[0].accountId : null;
  const canTrashSelection = chosen.length > 0 && chosen.every(f => f.capabilities?.canTrash);
  const canRemoveSelection = chosen.length > 0 && chosen.every(f => !f.ownedByMe && f.capabilities?.canRemoveMyDriveParent && f.parents?.length === 1);

  const uploadSummary = useMemo<UploadSummary | null>(() => {
    if (!uploads.length) return null;
    const total = uploads.reduce((sum, j) => sum + j.size, 0);
    const uploaded = uploads.reduce((sum, j) => sum + j.uploaded, 0);
    const done = uploads.filter(j => j.status === "done").length;
    const failed = uploads.filter(j => j.status === "error").length;
    const active = uploads.find(j => j.status === "uploading") ?? uploads.find(j => j.status === "queued");
    const rawPercent = total ? Math.floor(uploaded / total * 100) : (done ? 100 : 0);
    let totalSpeed = 0;
    for (const u of uploads) {
      if (u.status !== "uploading" || !u.startedAt) continue;
      const hist = speedHistory.current.get(u.id);
      if (!hist || hist.length < 2) continue;
      const recent = hist.slice(-10);
      const bytesDelta = recent[recent.length - 1].bytes - recent[0].bytes;
      const timeDelta = (recent[recent.length - 1].time - recent[0].time) / 1000;
      if (timeDelta > 0) totalSpeed += bytesDelta / timeDelta;
    }
    return { total, uploaded, done, failed, active, percent: uploaded > 0 && rawPercent === 0 ? 1 : Math.min(100, rawPercent), speed: totalSpeed };
  }, [uploads]);

  function trackSpeed(id: string, uploadedBytes: number) {
    const now = Date.now();
    const hist = speedHistory.current.get(id) || [];
    hist.push({ bytes: uploadedBytes, time: now });
    if (hist.length > 20) hist.shift();
    speedHistory.current.set(id, hist);
    const recent = hist.slice(-10);
    if (recent.length >= 2) {
      const bytesDelta = recent[recent.length - 1].bytes - recent[0].bytes;
      const timeDelta = (recent[recent.length - 1].time - recent[0].time) / 1000;
      if (timeDelta > 0) {
        const bps = bytesDelta / timeDelta;
        setUploads(j => j.map(x => x.id === id ? { ...x, speed: bps } : x));
      }
    }
  }

  async function uploadSingleFile(file: File, id: string, target: string) {
    let uploadId: string | null = null;
    let chunkSize = 0;
    for (let startAttempt = 0; startAttempt < 3; startAttempt++) {
      try {
        const start = await api<{ uploadId: string; chunkSize: number }>("/api/uploads/start", {
          method: "POST",
          body: JSON.stringify({ accountId: target, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, relativePath: file.webkitRelativePath }),
        });
        uploadId = start.uploadId;
        chunkSize = start.chunkSize;
        break;
      } catch (e) {
        if (startAttempt >= 2) throw e;
        else await sleep(Math.min(1500 * Math.pow(2, startAttempt), 8000));
      }
    }
    if (!uploadId) throw new Error("Failed to start upload session");
    const startedAt = Date.now();
    setUploads(j => j.map(x => x.id === id ? { ...x, status: "uploading", startedAt } : x));

    const chunks: { offset: number; end: number; blob: Blob }[] = [];
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, file.size);
      chunks.push({ offset, end, blob: file.slice(offset, end) });
    }

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt++) {
        try {
          const response = await fetch(`/api/uploads/${uploadId}`, {
            method: "PUT",
            headers: { "content-range": `bytes ${chunk.offset}-${chunk.end - 1}/${file.size}` },
            body: chunk.blob,
          });
          if (response.ok || response.status === 308) {
            trackSpeed(id, chunk.end);
            setUploads(j => j.map(x => x.id === id ? { ...x, uploaded: chunk.end, progress: file.size ? Math.max(1, Math.floor(chunk.end / file.size * 100)) : 100 } : x));
            break;
          }
          if (response.status === 410) {
            const body = await response.json().catch(() => ({}));
            if (body.expired) {
              setUploads(j => j.map(x => x.id === id ? { ...x, retries: (x.retries || 0) + 1 } : x));
              for (let ra = 0; ra < 3; ra++) {
                try {
                  const ns = await api<{ uploadId: string; chunkSize: number }>("/api/uploads/start", {
                    method: "POST",
                    body: JSON.stringify({ accountId: target, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, relativePath: file.webkitRelativePath }),
                  });
                  uploadId = ns.uploadId;
                  chunkSize = ns.chunkSize;
                  break;
                } catch (re) {
                  if (ra >= 2) throw re;
                  await sleep(Math.min(1500 * Math.pow(2, ra), 6000));
                }
              }
              ci = -1;
              break;
            }
          }
          const body = await response.json().catch(() => ({}));
          if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 408) {
            throw new Error(body?.error || `Upload failed (${response.status})`);
          }
          await sleep(Math.min(1000 * Math.pow(2, attempt), 12000));
        } catch (e) {
          if (attempt >= MAX_UPLOAD_ATTEMPTS - 1) throw e;
          if (isRetryable(e)) await sleep(Math.min(1000 * Math.pow(2, attempt), 10000));
          else throw e;
        }
      }
    }
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const target = accountId === "all"
      ? accounts.reduce((best, a) => (a.storage.limit || Infinity) - a.storage.usage > (best.storage.limit || Infinity) - best.storage.usage ? a : best).id
      : accountId;
    const batch = Array.from(list).map(file => ({ file, id: crypto.randomUUID() }));
    setUploads(j => [...j, ...batch.map(({ file, id }) => ({
      id, name: file.webkitRelativePath || file.name, size: file.size,
      uploaded: 0, progress: 0, status: "queued" as const, retries: 0, speed: 0, startedAt: undefined,
    }))]);

    for (const { file, id } of batch) {
      try {
        await uploadSingleFile(file, id, target);
        setUploads(j => j.map(x => x.id === id ? { ...x, status: "done", uploaded: file.size, progress: 100, error: undefined } : x));
      } catch (e) {
        const message = (e as Error).message;
        setUploads(j => j.map(x => x.id === id ? { ...x, status: "error", error: message } : x));
        setError(`${file.webkitRelativePath || file.name}: ${message}`);
      }
    }
    speedHistory.current.clear();
    notify(`${batch.length} item${batch.length === 1 ? "" : "s"} queued`);
  }

  async function trash(value: boolean) {
    const blocked = chosen.filter(f => !f.capabilities?.canTrash);
    if (blocked.length) return setError(`${blocked.length} selected item(s) are shared or read-only and cannot be ${value ? "moved to Trash" : "restored"} by this account.`);
    setBusy(true);
    try {
      const grouped = Map.groupBy(chosen, f => f.accountId);
      const results = await Promise.all(Array.from(grouped, ([id, items]) =>
        api<{ ok?: boolean; partial?: boolean; error?: string; results?: { id: string; ok: boolean; error?: string }[] }>("/api/files", {
          method: "PATCH", body: JSON.stringify({ accountId: id, fileIds: items.map(x => x.id), trashed: value }),
        })
      ));
      const partialFailures = results.filter(r => r.partial).length;
      if (partialFailures) notify(`${value ? "Moved to Trash" : "Items restored"} (some items could not be changed)`);
      else notify(value ? "Moved to Trash" : "Items restored");
      await loadFiles();
      await loadAccounts();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function removeFromMyDrive() {
    if (!canRemoveSelection) return;
    setBusy(true);
    try {
      const grouped = Map.groupBy(chosen, f => f.accountId);
      await Promise.all(Array.from(grouped, ([id, items]) =>
        api("/api/files", { method: "PATCH", body: JSON.stringify({ accountId: id, fileIds: items.map(x => x.id), action: "removeFromMyDrive" }) })
      ));
      notify("Removed from My Drive");
      await loadFiles();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function forever() {
    const blocked = chosen.filter(f => !f.capabilities?.canDelete);
    if (blocked.length) return setError(`${blocked.length} selected item(s) cannot be permanently deleted because this account is not their owner.`);
    if (!confirm(`Permanently delete ${selected.length} item(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const grouped = Map.groupBy(chosen, f => f.accountId);
      await Promise.all(Array.from(grouped, ([id, items]) =>
        api("/api/files", { method: "DELETE", body: JSON.stringify({ accountId: id, fileIds: items.map(x => x.id) }) })
      ));
      notify("Permanently deleted");
      await loadFiles();
      await loadAccounts();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function transfer() {
    if (!source || !destination) return;
    setBusy(true);
    for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
      try {
        const result = await api<{ results?: unknown[]; errors?: { fileId: string; error: string }[]; error?: string }>("/api/transfers", {
          method: "POST", body: JSON.stringify({ sourceAccountId: source, destinationAccountId: destination, fileIds: selected }),
        });
        setTransferOpen(false);
        setSelected([]);
        if (result.errors?.length) {
          notify(`Transfer completed with ${result.errors.length} error(s) \u2014 sources kept`);
          setError(result.errors.map(e => e.error).join(" \u00b7 "));
        } else notify("Destination verified. Sources were kept.");
        await loadAccounts();
        await loadFiles();
        break;
      } catch (e) {
        if (attempt >= MAX_API_ATTEMPTS - 1) setError((e as Error).message);
        else { notify(`Transfer attempt ${attempt + 1} failed, retrying\u2026`); await sleep(Math.min(2000 * Math.pow(2, attempt), 15000)); }
      }
    }
    setBusy(false);
  }

  async function disconnect(id: string) {
    if (!confirm("Disconnect this account? Its Google Drive files will not change.")) return;
    try {
      await api(`/api/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (accountId === id) setAccountId("all");
      await loadAccounts();
      notify("Account disconnected");
    } catch (e) { setError((e as Error).message); }
  }

  if (loading) return (
    <main className="first-run">
      <LogoMark large />
      <h1>Opening MegaDrive</h1>
      <p>Bringing your connected drives into focus\u2026</p>
      <div className="loader" />
    </main>
  );

  if (!accounts.length) return (
    <main className="first-run">
      <div className="first-run-brand"><LogoMark large /><strong>MegaDrive</strong></div>
      <span className="status-pill">PRIVATE BY DESIGN</span>
      <h1>Every drive.<br /><em>One calm workspace.</em></h1>
      <p>See capacity, find files, and move data safely across your Google accounts without losing track of what lives where.</p>
      {error && <div className="error-banner">{error}<button onClick={() => setError("")}>×</button></div>}
      <a className="google-connect" href="/api/auth/google/start">
        <b>G</b>
        <span>Connect your first Google account<small>Takes less than a minute</small></span>
        <i>→</i>
      </a>
      <div className="trust-row">
        <span>✓ Official Google authorization</span>
        <span>✓ Encrypted on this device</span>
        <span>✓ Sources stay protected</span>
      </div>
      <small className="setup-note">MegaDrive never asks for your Google password.</small>
    </main>
  );

  const accountOptions = accounts.filter(a => a.id !== source).map(a => (
    <option value={a.id} key={a.id}>{a.email}</option>
  ));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><LogoMark /><span>MegaDrive<small>DRIVE COMMAND</small></span></div>
        <nav>
          <button className={view === "files" && accountId === "all" ? "nav-item active" : "nav-item"} onClick={() => { setView("files"); setAccountId("all"); }}><span>{"\u2302"}</span> Overview</button>
          <button className={view === "trash" ? "nav-item active" : "nav-item"} onClick={() => setView("trash")}><span>{"\u2673"}</span> Trash</button>
        </nav>
        <div className="sidebar-label">CONNECTED ACCOUNTS</div>
        <div className="account-nav">
          {accounts.map(a => (
            <button key={a.id} className={accountId === a.id ? "account-link selected-account" : "account-link"} onClick={() => { setAccountId(a.id); setView("files"); }}>
              <span className="avatar small">{a.picture ? <img src={a.picture} alt="" /> : a.email[0].toUpperCase()}</span>
              <span><strong>{a.name}</strong><small>{fmtBytes(a.storage.usage)} used</small></span>
              <i onClick={e => { e.stopPropagation(); disconnect(a.id); }}>×</i>
            </button>
          ))}
        </div>
        <a className="connect-side" href="/api/auth/google/start">＋ Connect account</a>
        <div className="privacy-note"><span>●</span><div><strong>Local &amp; encrypted</strong><small>Transfers run through this device.</small></div></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="search-wrap"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search connected drives\u2026" /></div>
          <a className="secondary compact" href="/api/auth/google/start">＋ Add account</a>
        </header>
        <div className="page">
          <div className="heading-row">
            <div>
              <p className="eyebrow">LIVE GOOGLE DRIVE DATA</p>
              <h1>{view === "trash" ? "Trash" : accountId === "all" ? "Your storage" : accounts.find(a => a.id === accountId)?.name}</h1>
              <p>{view === "trash" ? "Restore items or permanently remove them." : `${accounts.length} connected account${accounts.length === 1 ? "" : "s"}, one private workspace.`}</p>
            </div>
            <div className="header-actions">
              <input ref={uploadInput} type="file" multiple hidden onChange={e => upload(e.target.files)} />
              <input ref={node => { folderInput.current = node; if (node) { node.setAttribute("webkitdirectory", ""); node.setAttribute("directory", ""); } }} type="file" multiple hidden onChange={e => upload(e.target.files)} />
              <button className="secondary folder-upload" onClick={() => folderInput.current?.click()}>Upload folder</button>
              <button className="primary" onClick={() => uploadInput.current?.click()}>↑ Upload files</button>
            </div>
          </div>
          {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}

          {view === "files" && (<>
            <section className="storage-hero">
              <div className="capacity-ring" style={{ "--value": `${pct * 3.6}deg` } as React.CSSProperties}><div><strong>{(totals.used / GB).toFixed(1)}</strong><span>GB used</span></div></div>
              <div className="capacity-copy">
                <span className="status-pill">LIVE CAPACITY</span>
                <h2>{totals.total ? `${fmtBytes(totals.total - totals.used)} available` : "Storage limit unavailable"}</h2>
                <p>reported directly by Google Drive</p>
                <div className="capacity-track"><span style={{ width: `${pct}%` }} /></div>
                <small>{pct}% used <b>{fmtBytes(totals.total)} total</b></small>
              </div>
              <div className="insight"><span className="spark">✓</span><div><strong>Your files stay in Google Drive</strong><p>Transfers keep the source until the destination copy passes verification.</p></div></div>
            </section>
            <section className="section-block">
              <div className="section-heading"><div><h2>Your accounts</h2><p>Current storage reported by Google</p></div></div>
              <div className="account-grid">
                {accounts.map(a => {
                  const p = a.storage.limit ? Math.round(a.storage.usage / a.storage.limit * 100) : 0;
                  return (
                    <article className="account-card" key={a.id} onClick={() => setAccountId(a.id)}>
                      <div className="account-card-top"><span className="avatar">{a.picture ? <img src={a.picture} alt="" /> : a.email[0]}</span><div><strong>{a.name}</strong><small>{a.email}</small></div></div>
                      <div className="account-stats"><strong>{fmtBytes(a.storage.usage)} <span>of {a.storage.limit ? fmtBytes(a.storage.limit) : "unlimited"}</span></strong><b className={p > 85 ? "danger" : ""}>{p}%</b></div>
                      <div className="mini-track"><span style={{ width: `${p}%` }} /></div>
                      <small>{fmtBytes(a.storage.usageInTrash)} in Trash</small>
                    </article>
                  );
                })}
              </div>
            </section>
          </>)}

          <section className="section-block files-section">
            <div className="section-heading">
              <div><h2>{view === "trash" ? "Deleted items" : "Files"}</h2><p>{filesLoading ? "Loading from Google\u2026" : `${visibleFiles.length} item${visibleFiles.length === 1 ? "" : "s"} shown`}</p></div>
              <div className="file-heading-actions">
                {view === "files" && <label className="owned-filter"><input type="checkbox" checked={ownedOnly} onChange={e => { setOwnedOnly(e.target.checked); setSelected([]); }} /> Owned by me</label>}
                <button className="text-button" onClick={loadFiles}>↻ Refresh</button>
              </div>
            </div>
            {selected.length > 0 && (
              <div className="selection-bar">
                <strong>{selected.length} selected</strong>
                {view === "files" ? (<>
                  <button onClick={() => { if (!source) return setError("Choose files from one source account per transfer."); setDestination(accounts.find(a => a.id !== source)?.id || ""); setTransferOpen(true); }}>⇄ Transfer</button>
                  <button disabled={busy || !canTrashSelection} title={!canTrashSelection ? "One or more selected files cannot be trashed by this account" : undefined} onClick={() => trash(true)}>♲ Trash</button>
                  {canRemoveSelection && <button disabled={busy} onClick={removeFromMyDrive}>− Remove from My Drive</button>}
                </>) : (<>
                  <button disabled={busy || !canTrashSelection} onClick={() => trash(false)}>↶ Restore</button>
                  <button disabled={busy} className="danger-action" onClick={forever}>Delete forever</button>
                </>)}
                <button onClick={() => setSelected([])}>Clear</button>
              </div>
            )}
            <div className="file-table">
              <div className="file-row table-head">
                <span><input type="checkbox" checked={visibleFiles.length > 0 && visibleFiles.every(f => selected.includes(f.id))} onChange={() => setSelected(visibleFiles.every(f => selected.includes(f.id)) ? [] : visibleFiles.map(f => f.id))} /> Name</span>
                <span>Owner</span><span>Account</span><span>Size</span><span>Modified</span><span />
              </div>
              {filesLoading ? (
                <div className="empty-state"><div className="loader small-loader" /><p>Reading Google Drive\u2026</p></div>
              ) : visibleFiles.length ? (
                visibleFiles.map(f => {
                  const a = accounts.find(x => x.id === f.accountId)!;
                  const owner = f.driveId ? "Shared drive" : f.owners?.[0]?.displayName || f.owners?.[0]?.emailAddress || (f.ownedByMe ? a.name : "Unknown owner");
                  const accessLabel = f.ownedByMe ? "Owned" : f.capabilities?.canEdit ? "Shared \u00b7 Editor" : "Shared \u00b7 Read-only";
                  return (
                    <div className="file-row" key={`${f.accountId}-${f.id}`}>
                      <span className="file-name">
                        <input type="checkbox" checked={selected.includes(f.id)} onChange={() => setSelected(s => s.includes(f.id) ? s.filter(x => x !== f.id) : [...s, f.id])} />
                        <i className={`file-icon ${fileKind(f.mimeType).toLowerCase()}`}>{fileIcon(f.mimeType)}</i>
                        <span><strong>{f.name}</strong><small>{fileKind(f.mimeType)} <b className={`access-badge ${f.ownedByMe ? "owned" : f.capabilities?.canEdit ? "shared" : "readonly"}`}>{accessLabel}</b></small></span>
                      </span>
                      <span className="owner-cell" title={f.owners?.[0]?.emailAddress}>{owner}</span>
                      <span className="account-cell">{a.name}</span>
                      <span>{f.size ? fmtBytes(Number(f.size)) : "\u2014"}</span>
                      <span>{f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : "\u2014"}</span>
                      {f.webViewLink ? <a href={f.webViewLink} target="_blank" rel="noreferrer">↗</a> : <span />}
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">
                  <span>{"\u25A1"}</span>
                  <h3>{ownedOnly ? "No files owned by this account" : search ? "No matching files" : view === "trash" ? "Trash is empty" : "This Drive is empty"}</h3>
                  <p>{view === "files" && !search && !ownedOnly ? "Upload a file to get started." : "Nothing to show here."}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      {uploadSummary && (
        <div className="upload-panel">
          <div className="upload-panel-head">
            <strong>Uploading <small>{uploadSummary.done} of {uploads.length} complete</small>{uploadSummary.speed > 0 ? <small> at {fmtSpeed(uploadSummary.speed)}</small> : null}</strong>
            <button aria-label="Clear completed uploads" title="Clear completed uploads" onClick={() => setUploads(x => x.filter(j => j.status === "uploading" || j.status === "queued"))}>×</button>
          </div>
          <div className="upload-total">
            <div>
              <span title={uploadSummary.active?.name}>{uploadSummary.active ? uploadSummary.active.name : uploadSummary.failed ? "Finished with errors" : "Upload complete"}</span>
              <b>{uploadSummary.percent}%</b>
            </div>
            <i><b style={{ width: `${uploadSummary.percent}%` }} /></i>
            <small>
              {fmtBytes(uploadSummary.uploaded)} of {fmtBytes(uploadSummary.total)}
              {uploadSummary.speed > 0 ? ` \u00b7 ${fmtSpeed(uploadSummary.speed)}` : ""}
              {uploadSummary.failed ? ` \u00b7 ${uploadSummary.failed} failed` : ""}
            </small>
          </div>
          <div className="upload-list">
            {uploads.slice(-8).map(j => (
              <div className={`upload-job ${j.status}`} key={j.id}>
                <span title={j.name}>{j.name}</span>
                <small title={j.error}>
                  {j.status === "error" ? `Failed: ${j.error || "Unknown error"}` :
                    j.status === "queued" ? "Queued" :
                    j.status === "done" ? "Done" :
                    j.speed ? `${j.progress}% \u00b7 ${fmtSpeed(j.speed)}` :
                    j.retries ? `${j.progress}% (retry ${j.retries})` :
                    `${j.progress}%`}
                </small>
                <i><b style={{ width: `${j.progress}%` }} /></i>
              </div>
            ))}
          </div>
        </div>
      )}

      {transferOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <button className="modal-close" onClick={() => setTransferOpen(false)}>×</button>
            <span className="modal-symbol transfer-symbol">⇄</span>
            <h2>Copy {selected.length} item{selected.length === 1 ? "" : "s"}</h2>
            <p>The destination will be verified. Source files remain untouched.</p>
            <label className="destination-label">
              Destination
              <select value={destination} onChange={e => setDestination(e.target.value)}>
                {accountOptions}
              </select>
            </label>
            <div className="safe-transfer"><span>✓</span><div><strong>Source protection enabled</strong><small>Nothing is deleted during transfer.</small></div></div>
            <button className="primary modal-action" disabled={busy || !destination} onClick={transfer}>{busy ? "Copying and verifying\u2026" : "Start verified transfer"}</button>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      <AiChat />
    </main>
  );
}
