import Link from "next/link";

interface FooterLegalProps {
  dark?: boolean;
  className?: string;
}

export function FooterLegal({ dark = true, className = "" }: FooterLegalProps) {
  return (
    <footer
      className={`py-8 px-4 border-t text-center text-xs space-y-4 transition-colors ${
        dark
          ? "bg-stone-900 border-stone-800 text-stone-400"
          : "bg-white border-stone-200 text-stone-600"
      } ${className}`}
    >
      <div className="max-w-6xl mx-auto space-y-3">
        {/* Social Links */}
        <div className="flex items-center justify-center gap-3">
          <a
            href="https://www.instagram.com/escuelayogasalvadoraconesa/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-linear-to-r from-pink-500/15 via-rose-500/15 to-purple-500/15 text-pink-600 hover:text-pink-500 hover:from-pink-500/25 hover:to-purple-500/25 border border-pink-500/30 transition shadow-2xs group"
          >
            <svg
              className="w-3.5 h-3.5 fill-current transition-transform group-hover:scale-110"
              viewBox="0 0 24 24"
            >
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
            <span>Instagram</span>
          </a>

          <a
            href="https://www.facebook.com/share/1EhbRPtem8/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-600 hover:text-blue-500 hover:bg-blue-500/25 border border-blue-500/30 transition shadow-2xs group"
          >
            <svg
              className="w-3.5 h-3.5 fill-current transition-transform group-hover:scale-110"
              viewBox="0 0 24 24"
            >
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Facebook</span>
          </a>
        </div>

        {/* Legal Links */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
          <a
            href="https://salvadora.jigretera.com/politica-de-privacidad"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-amber-400 transition"
          >
            Política de Privacidad
          </a>
          <span className="text-stone-500 select-none">•</span>
          <a
            href="https://salvadora.jigretera.com/politica-de-cookies"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-amber-400 transition"
          >
            Política de Cookies
          </a>
          <span className="text-stone-500 select-none">•</span>
          <a
            href="https://salvadora.jigretera.com/ley-de-proteccion-de-datos"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline hover:text-amber-400 transition"
          >
            Ley de Protección de Datos
          </a>
        </div>

        {/* Copyright */}
        <p className="text-[11px] text-stone-400">
          © 2026 Centro de Yoga Fuenlabrada Salvadora Conesa. Todos los derechos reservados.
        </p>

        {/* Webmaster */}
        <p className="text-[11px] text-stone-400">
          WebMaster ReagrupamientoAI{" "}
          <a
            href="mailto:contacto@reagrupamientoAI.com"
            className="text-amber-400 hover:text-amber-300 font-semibold hover:underline"
          >
            @reagrupamientoAI.com
          </a>
        </p>
      </div>
    </footer>
  );
}
