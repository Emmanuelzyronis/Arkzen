"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { AssistantMessage } from "@/lib/data/repository";

interface Props {
  initialMessages: AssistantMessage[];
}

export function AssistantChat({ initialMessages }: Props) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const optimistic: AssistantMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = (await res.json()) as { reply?: string; message?: { id?: string }; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        return;
      }

      const aiMessage: AssistantMessage = {
        id: data.message?.id ?? `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply ?? "",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), optimistic, aiMessage]);
    } catch {
      setError("Could not reach the server. Check your connection.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-[calc(100dvh-120px)] flex-col rounded-card border border-line bg-surface shadow-card">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-[14px] font-medium text-fg">Your pipeline assistant</p>
            <p className="max-w-xs text-[13px] leading-relaxed text-fg-muted">
              Ask anything — which leads to prioritise, how to open a conversation, what a post actually means, or how your pipeline is looking.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={[
                "max-w-[78%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed",
                message.role === "user"
                  ? "rounded-br-sm bg-brand text-white"
                  : "rounded-bl-sm bg-surface-2 text-fg",
              ].join(" ")}
            >
              {message.content.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < message.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full bg-fg-muted animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-[12.5px] text-down">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-line px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={onKeyDown}
            placeholder="Ask about your pipeline…"
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px] text-fg placeholder-fg-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
            style={{ minHeight: "42px", maxHeight: "120px" }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || loading}
            className="flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send aria-hidden="true" className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[11.5px] text-fg-muted">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
}
