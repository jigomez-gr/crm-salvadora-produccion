"use client";

import { useEffect, useRef } from "react";
import { apiUrl } from "@/lib/api";

type EventHandler = (data: unknown) => void;

type EventMap = {
  "message.received"?: EventHandler;
  "message.sent"?: EventHandler;
  "message.status"?: EventHandler;
  "conversation.updated"?: EventHandler;
  "appointment.created"?: EventHandler;
  "contact.updated"?: EventHandler;
  "call.ended"?: EventHandler;
};

export function useEvents(handlers: EventMap) {
  const handlersRef = useRef(handlers);
  // Keep the ref pointing at the latest handlers. Writing to a ref must happen
  // after render (in an effect), not during render.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let es: EventSource | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      try {
        // withCredentials sends the httpOnly auth cookie so the guarded SSE
        // endpoint authenticates the stream (EventSource can't set headers).
        es = new EventSource(apiUrl("/api/events"), { withCredentials: true });

        es.addEventListener("message.received", (e: MessageEvent) => {
          try {
            handlersRef.current["message.received"]?.(JSON.parse(e.data));
          } catch {}
        });
        es.addEventListener("message.sent", (e: MessageEvent) => {
          try {
            handlersRef.current["message.sent"]?.(JSON.parse(e.data));
          } catch {}
        });
        es.addEventListener("message.status", (e: MessageEvent) => {
          try {
            handlersRef.current["message.status"]?.(JSON.parse(e.data));
          } catch {}
        });
        es.addEventListener("conversation.updated", (e: MessageEvent) => {
          try {
            handlersRef.current["conversation.updated"]?.(JSON.parse(e.data));
          } catch {}
        });
        es.addEventListener("appointment.created", (e: MessageEvent) => {
          try {
            handlersRef.current["appointment.created"]?.(JSON.parse(e.data));
          } catch {}
        });
        es.addEventListener("contact.updated", (e: MessageEvent) => {
          try {
            handlersRef.current["contact.updated"]?.(JSON.parse(e.data));
          } catch {}
        });
        es.addEventListener("call.ended", (e: MessageEvent) => {
          try {
            handlersRef.current["call.ended"]?.(JSON.parse(e.data));
          } catch {}
        });

        // EventSource reconnects natively on error — no manual retry needed
        es.onerror = () => {
          // native reconnect will handle it
        };
      } catch {
        // SSE not available (backend down) — ignore silently
      }
    }

    connect();

    return () => {
      destroyed = true;
      es?.close();
    };
  }, []);
}
