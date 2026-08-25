"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary for failures in the root layout itself (where the
 * normal error.tsx cannot render). It must provide its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          color: "#171717",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
          La aplicación ha encontrado un error
        </h2>
        <p style={{ color: "#737373", maxWidth: "28rem", fontSize: "0.875rem" }}>
          Vuelve a intentarlo. Si el problema persiste, recarga la página.
        </p>
        <button
          onClick={reset}
          style={{
            background: "#4f46e5",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
