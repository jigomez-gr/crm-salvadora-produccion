"use client";

import { XCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function PaymentCancelledPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <XCircle className="h-10 w-10" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-neutral-900">
          Pago no completado
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          El proceso de pago ha sido cancelado o no se ha podido procesar. Puedes volver a intentarlo cuando lo desees desde el enlace facilitado.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-800 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
