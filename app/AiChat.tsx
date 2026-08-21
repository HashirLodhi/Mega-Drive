"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [greetingLoaded, setGreetingLoaded] = useState(false);
  const [actionPending, setActionPending] = useState<{ tool: string; args: Record<string, unknown> } | null>(null);
  const sessionId = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : "default");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (open && !greetingLoaded) {
      fetch("/api/ai/chat")
        .then((r) => r.json())
        .then((data) => {
          if (data.greeting) {
            setMessages([{ role: "assistant", content: data.greeting }]);
            setGreetingLoaded(true);
          }
        })
        .catch(() => setGreetingLoaded(true));
    }
  }, [open, greetingLoaded]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = overrideText || input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);
    setActionPending(null);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, message: text }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.error || res.statusText}` }]);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantContent };
          return updated;
        });
      }

      if (assistantContent.includes("confirm=true")) {
        const toolMatch = assistantContent.match(/(?:trash_files|delete_files|copy_files|remove_from_drive|smart_cleanup)/);
        if (toolMatch) {
          setActionPending({ tool: toolMatch[0], args: {} });
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handleConfirmAction = useCallback(async (confirmed: boolean) => {
    setActionPending(null);
    const confirmMsg = confirmed ? "Yes, proceed with confirm=true" : "No, cancel the action";
    await sendMessage(confirmMsg);
  }, [sendMessage]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function renderMarkdown(text: string) {
    let html = text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/^([📊🗑️📦📅🔁✅⚠️]|-\s)/gm, "$1")
      .replace(/\n/g, "<br/>");
    return html;
  }

  function hasActionButtons(text: string) {
    return text.includes("Shall I proceed") || text.includes("confirm=true") || text.includes("Reply with confirm=true");
  }

  return (
    <>
      <button className="ai-chat-toggle" onClick={() => setOpen(!open)} aria-label="Toggle AI assistant">
        {open ? "×" : "✦"}
      </button>

      {open && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <span className="ai-chat-icon">✦</span>
            <div>
              <strong>MegaDrive AI</strong>
              <small>Ask about your files & storage</small>
            </div>
            <button className="ai-chat-close" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
          </div>

          <div className="ai-chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ai-chat-bubble ${msg.role}`}>
                {msg.role === "assistant" && <span className="ai-avatar">✦</span>}
                <div>
                  <div
                    className="ai-chat-text"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                  {msg.role === "assistant" && loading && i === messages.length - 1 && !msg.content && (
                    <div className="ai-typing">
                      <span /><span /><span />
                    </div>
                  )}
                  {msg.role === "assistant" && !loading && i === messages.length - 1 && hasActionButtons(msg.content) && actionPending && (
                    <div className="ai-action-buttons">
                      <button className="ai-action-confirm" onClick={() => handleConfirmAction(true)}>
                        ✓ Yes, proceed
                      </button>
                      <button className="ai-action-cancel" onClick={() => handleConfirmAction(false)}>
                        ✕ Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="ai-chat-input-wrap">
            <textarea
              ref={inputRef}
              className="ai-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={loading ? "Working on it..." : "Ask about your storage..."}
              rows={1}
              disabled={loading}
            />
            <button className="ai-chat-send" onClick={() => sendMessage()} disabled={loading || !input.trim()} aria-label="Send">
              {loading ? "..." : "↑"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
