import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
        <Compass className="h-6 w-6 text-indigo-600" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          Página no encontrada
        </h2>
        <p className="mt-1 max-w-md text-sm text-neutral-500">
          La página que buscas no existe o se ha movido.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
