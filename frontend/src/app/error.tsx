"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Route-level error boundary. Catches render/runtime errors in any page so the
 * user sees a recoverable message instead of a blank white screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for diagnostics (a real deployment would forward this to
    // an error tracker like Sentry).
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle className="h-6 w-6 text-red-600" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Algo ha salido mal
        </h2>
        <p className="mt-1 max-w-md text-sm text-neutral-500">
          Ha ocurrido un error inesperado al cargar esta sección. Puedes intentarlo
          de nuevo.
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Reintentar
      </button>
    </div>
  );
}
