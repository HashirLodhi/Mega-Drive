"use client";

import { useMemo, useRef, useState } from "react";
import LiveDashboard from "./LiveDashboard";
import AiChat from "./AiChat";

type Account = {
  id: string;
  name: string;
  email: string;
  used: number;
  total: number;
  color: string;
};

type DriveFile = {
  id: string;
  name: string;
  kind: "Folder" | "PDF" | "Video" | "Image" | "Document" | "Archive";
  size: number;
  accountId: string;
  modified: string;
  trashed?: boolean;
};

const initialAccounts: Account[] = [
  { id: "a1", name: "Personal", email: "alex.home@gmail.com", used: 13.8, total: 15, color: "#7559f3" },
  { id: "a2", name: "Projects", email: "alex.work@gmail.com", used: 7.2, total: 15, color: "#18a999" },
  { id: "a3", name: "Archive", email: "alex.archive@gmail.com", used: 2.1, total: 15, color: "#f3a712" },
];

const initialFiles: DriveFile[] = [
  { id: "f1", name: "Family Photos", kind: "Folder", size: 3.4, accountId: "a1", modified: "Today, 9:41 PM" },
  { id: "f2", name: "Product launch footage.mp4", kind: "Video", size: 2.8, accountId: "a1", modified: "Yesterday" },
  { id: "f3", name: "Design resources.zip", kind: "Archive", size: 1.7, accountId: "a2", modified: "Aug 14, 2026" },
  { id: "f4", name: "Tax documents 2025.pdf", kind: "PDF", size: 0.42, accountId: "a1", modified: "Aug 10, 2026" },
  { id: "f5", name: "Portfolio backup", kind: "Folder", size: 1.2, accountId: "a2", modified: "Aug 7, 2026" },
  { id: "f6", name: "Brand photography", kind: "Image", size: 0.83, accountId: "a3", modified: "Jul 28, 2026" },
  { id: "f7", name: "Project notes", kind: "Document", size: 0.06, accountId: "a2", modified: "Jul 21, 2026" },
];

const iconFor: Record<DriveFile["kind"], string> = {
  Folder: "▰",
  PDF: "PDF",
  Video: "▶",
  Image: "◫",
  Document: "≡",
  Archive: "ZIP",
};

function DemoHome() {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [files, setFiles] = useState(initialFiles);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeAccount, setActiveAccount] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"files" | "activity" | "trash">("files");
  const [dialog, setDialog] = useState<"transfer" | "connect" | null>(null);
  const [destination, setDestination] = useState("a3");
  const [toast, setToast] = useState("");
  const [activity, setActivity] = useState([
    "Storage scan completed across 3 accounts",
    "Connected Archive account",
    "Uploaded Project notes to Projects",
  ]);
  const uploadRef = useRef<HTMLInputElement>(null);

  const visibleFiles = useMemo(() => files.filter((file) => {
    const accountMatch = activeAccount === "all" || file.accountId === activeAccount;
    const searchMatch = file.name.toLowerCase().includes(search.toLowerCase());
    const viewMatch = view === "trash" ? file.trashed : !file.trashed;
    return accountMatch && searchMatch && viewMatch;
  }), [files, activeAccount, search, view]);

  const totals = accounts.reduce((sum, account) => ({ used: sum.used + account.used, total: sum.total + account.total }), { used: 0, total: 0 });
  const percentage = Math.round((totals.used / totals.total) * 100);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function toggleFile(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    if (!picked.length) return;
    const target = activeAccount === "all" ? accounts.reduce((best, item) => item.total - item.used > best.total - best.used ? item : best).id : activeAccount;
    const additions = picked.map((file, index): DriveFile => ({
      id: `upload-${Date.now()}-${index}`,
      name: file.name,
      kind: file.type.startsWith("image") ? "Image" : file.type.startsWith("video") ? "Video" : file.type.includes("pdf") ? "PDF" : "Document",
      size: file.size / 1024 / 1024 / 1024,
      accountId: target,
      modified: "Just now",
    }));
    setFiles((current) => [...additions, ...current]);
    setActivity((current) => [`Uploaded ${picked.length} file${picked.length > 1 ? "s" : ""}`, ...current]);
    notify(`${picked.length} file${picked.length > 1 ? "s" : ""} added to the transfer queue`);
    event.target.value = "";
  }

  function moveToTrash() {
    if (!selected.length) return;
    setFiles((current) => current.map((file) => selected.includes(file.id) ? { ...file, trashed: true } : file));
    setActivity((current) => [`Moved ${selected.length} item${selected.length > 1 ? "s" : ""} to Trash`, ...current]);
    notify("Items moved to Trash — they can still be restored");
    setSelected([]);
  }

  function restoreSelected() {
    setFiles((current) => current.map((file) => selected.includes(file.id) ? { ...file, trashed: false } : file));
    notify("Selected items restored");
    setSelected([]);
  }

  function transferSelected() {
    const names = files.filter((file) => selected.includes(file.id)).map((file) => file.name);
    setFiles((current) => current.map((file) => selected.includes(file.id) ? { ...file, accountId: destination, modified: "Just now" } : file));
    setActivity((current) => [`Transferred ${names.length} item${names.length > 1 ? "s" : ""} and verified the destination copy`, ...current]);
    setSelected([]);
    setDialog(null);
    notify("Transfer complete. The destination copy was verified.");
  }

  function connectDemoAccount() {
    const account: Account = { id: `a${accounts.length + 1}`, name: "New account", email: "new.account@gmail.com", used: 0, total: 15, color: "#ee6c4d" };
    setAccounts((current) => [...current, account]);
    setActivity((current) => ["Connected new.account@gmail.com", ...current]);
    setDialog(null);
    notify("Account connected in demo mode");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">M</span><span>MegaDrive</span></div>
        <nav aria-label="Main navigation">
          <button className={view === "files" && activeAccount === "all" ? "nav-item active" : "nav-item"} onClick={() => { setView("files"); setActiveAccount("all"); }}><span>⌂</span> Overview</button>
          <button className={view === "files" && activeAccount !== "all" ? "nav-item active" : "nav-item"} onClick={() => { setView("files"); setActiveAccount(accounts[0]?.id ?? "all"); }}><span>▱</span> All files</button>
          <button className={view === "activity" ? "nav-item active" : "nav-item"} onClick={() => setView("activity")}><span>↻</span> Activity</button>
          <button className={view === "trash" ? "nav-item active" : "nav-item"} onClick={() => setView("trash")}><span>♲</span> Trash</button>
        </nav>
        <div className="sidebar-label">CONNECTED ACCOUNTS</div>
        <div className="account-nav">
          {accounts.map((account) => <button key={account.id} onClick={() => { setActiveAccount(account.id); setView("files"); }} className={activeAccount === account.id && view === "files" ? "account-link selected-account" : "account-link"}>
            <span className="avatar small" style={{ background: account.color }}>{account.email[0].toUpperCase()}</span>
            <span><strong>{account.name}</strong><small>{account.used.toFixed(1)} of {account.total} GB</small></span>
            <i>{Math.round(account.used / account.total * 100)}%</i>
          </button>)}
        </div>
        <button className="connect-side" onClick={() => setDialog("connect")}>＋ Connect account</button>
        <div className="privacy-note"><span>●</span><div><strong>Private by design</strong><small>Files move directly through this device.</small></div></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="search-wrap"><span>⌕</span><input aria-label="Search all drives" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search across all drives..."/><kbd>⌘ K</kbd></div>
          <button className="icon-button" aria-label="Notifications">♢<i /></button>
          <div className="profile"><span className="avatar">A</span><span><strong>Alex Morgan</strong><small>3 accounts connected</small></span><b>⌄</b></div>
        </header>

        <div className="page">
          {view === "activity" ? <ActivityPanel activity={activity} /> : <>
            <div className="heading-row">
              <div><p className="eyebrow">YOUR STORAGE COMMAND CENTER</p><h1>{view === "trash" ? "Trash" : activeAccount === "all" ? "Good evening, Alex" : accounts.find((item) => item.id === activeAccount)?.name}</h1><p>{view === "trash" ? "Review and restore deleted items." : "All your Google Drive storage, finally in one place."}</p></div>
              <div className="header-actions"><input ref={uploadRef} type="file" multiple hidden onChange={handleUpload}/><button className="secondary" onClick={() => setDialog("connect")}>＋ Connect account</button><button className="primary" onClick={() => uploadRef.current?.click()}>↑ Upload files</button></div>
            </div>

            {view !== "trash" && <>
              <section className="storage-hero">
                <div className="capacity-ring" style={{ "--value": `${percentage * 3.6}deg` } as React.CSSProperties}><div><strong>{totals.used.toFixed(1)}</strong><span>GB used</span></div></div>
                <div className="capacity-copy"><span className="status-pill">ALL SYSTEMS HEALTHY</span><h2>{(totals.total - totals.used).toFixed(1)} GB available</h2><p>across {accounts.length} connected Google accounts</p><div className="capacity-track"><span style={{ width: `${percentage}%` }} /></div><small>{percentage}% used <b>{totals.total} GB total capacity</b></small></div>
                <div className="insight"><span className="spark">✦</span><div><strong>Smart insight</strong><p>Your Personal drive is almost full. Move <b>4.2 GB</b> to Archive to free up space.</p><button onClick={() => { setActiveAccount("a1"); setSelected(["f2", "f4"]); setDialog("transfer"); }}>Review suggestion →</button></div></div>
              </section>

              <section className="section-block"><div className="section-heading"><div><h2>Your accounts</h2><p>Storage usage at a glance</p></div><button className="text-button">Manage accounts</button></div><div className="account-grid">
                {accounts.map((account) => { const pct = Math.round(account.used / account.total * 100); return <article className="account-card" key={account.id} onClick={() => setActiveAccount(account.id)}>
                  <div className="account-card-top"><span className="avatar" style={{ background: account.color }}>{account.email[0].toUpperCase()}</span><div><strong>{account.name}</strong><small>{account.email}</small></div><button aria-label={`More options for ${account.name}`}>•••</button></div>
                  <div className="account-stats"><strong>{account.used.toFixed(1)} GB <span>of {account.total} GB</span></strong><b className={pct > 85 ? "danger" : ""}>{pct}%</b></div><div className="mini-track"><span style={{ width: `${pct}%`, background: account.color }} /></div><small>{(account.total - account.used).toFixed(1)} GB free</small>
                </article>})}
              </div></section>
            </>}

            <section className="section-block files-section">
              <div className="section-heading"><div><h2>{view === "trash" ? "Deleted items" : "Recent files"}</h2><p>{visibleFiles.length} items across {activeAccount === "all" ? `${accounts.length} drives` : "this drive"}</p></div><div className="file-controls"><button>☷</button><button>▦</button><button>⇅ Sort</button></div></div>
              {selected.length > 0 && <div className="selection-bar"><strong>{selected.length} selected</strong><button onClick={view === "trash" ? restoreSelected : () => setDialog("transfer")}>{view === "trash" ? "↶ Restore" : "⇄ Transfer"}</button>{view !== "trash" && <button onClick={moveToTrash}>♲ Move to trash</button>}<button onClick={() => setSelected([])}>Clear</button></div>}
              <div className="file-table" role="table" aria-label="Drive files">
                <div className="file-row table-head" role="row"><span><input type="checkbox" aria-label="Select all" checked={visibleFiles.length > 0 && visibleFiles.every((file) => selected.includes(file.id))} onChange={() => setSelected(visibleFiles.every((file) => selected.includes(file.id)) ? [] : visibleFiles.map((file) => file.id))}/> Name</span><span>Account</span><span>Size</span><span>Modified</span><span /></div>
                {visibleFiles.map((file) => { const account = accounts.find((item) => item.id === file.accountId)!; return <div className="file-row" role="row" key={file.id}>
                  <span className="file-name"><input type="checkbox" aria-label={`Select ${file.name}`} checked={selected.includes(file.id)} onChange={() => toggleFile(file.id)}/><i className={`file-icon ${file.kind.toLowerCase()}`}>{iconFor[file.kind]}</i><span><strong>{file.name}</strong><small>{file.kind}</small></span></span>
                  <span className="account-cell"><i style={{ background: account.color }}>{account.email[0].toUpperCase()}</i>{account.name}</span><span>{file.size < .1 ? `${Math.round(file.size * 1024)} MB` : `${file.size.toFixed(1)} GB`}</span><span>{file.modified}</span><button aria-label={`More actions for ${file.name}`}>•••</button>
                </div>})}
                {!visibleFiles.length && <div className="empty-state"><span>□</span><h3>Nothing here</h3><p>{view === "trash" ? "Your trash is empty." : "Try a different search or upload a file."}</p></div>}
              </div>
            </section>
          </>}
        </div>
      </section>

      {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialog(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button className="modal-close" onClick={() => setDialog(null)} aria-label="Close">×</button>
        {dialog === "connect" ? <><span className="modal-symbol">G</span><h2 id="dialog-title">Connect a Google account</h2><p>Sign in with Google to view and manage this account’s Drive. MegaDrive never stores your files.</p><div className="permission-list"><span>✓ View files and storage capacity</span><span>✓ Upload, copy, and organize files</span><span>✓ Move files to trash only when you approve</span></div><button className="google-button" onClick={connectDemoAccount}><b>G</b> Continue with Google</button><small className="demo-copy">Demo mode: adds a sample account until OAuth credentials are configured.</small></> : <><span className="modal-symbol transfer-symbol">⇄</span><h2 id="dialog-title">Transfer {selected.length} item{selected.length !== 1 ? "s" : ""}</h2><p>We’ll copy each item, verify it at the destination, and keep the original safe.</p><label className="destination-label">Destination drive<select value={destination} onChange={(e) => setDestination(e.target.value)}>{accounts.filter((account) => !files.filter((file) => selected.includes(file.id)).some((file) => file.accountId === account.id)).map((account) => <option value={account.id} key={account.id}>{account.name} · {(account.total - account.used).toFixed(1)} GB free</option>)}</select></label><div className="safe-transfer"><span>✓</span><div><strong>Safe transfer enabled</strong><small>The source files won’t be removed automatically.</small></div></div><button className="primary modal-action" onClick={transferSelected}>Start verified transfer</button></>}
      </div></div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
      <AiChat />
    </main>
  );
}

function ActivityPanel({ activity }: { activity: string[] }) {
  return <div className="activity-page"><p className="eyebrow">LOCAL AUDIT LOG</p><h1>Activity</h1><p>Every important storage action, in one clear timeline.</p><div className="activity-card">{activity.map((item, index) => <div className="activity-item" key={`${item}-${index}`}><span>✓</span><div><strong>{item}</strong><small>{index === 0 ? "Just now" : `${index + 1} days ago`} · This device</small></div></div>)}</div></div>;
}

export default LiveDashboard;
