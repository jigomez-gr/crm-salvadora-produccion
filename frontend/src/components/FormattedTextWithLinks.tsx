import React from "react";

interface FormattedTextWithLinksProps {
  text?: string | null;
  className?: string;
  linkClassName?: string;
}

export function FormattedTextWithLinks({
  text,
  className = "",
  linkClassName = "",
}: FormattedTextWithLinksProps) {
  if (!text) return null;

  // Regex to match URLs: http(s)://... or www....
  // Avoid capturing trailing punctuation like .,;:!?)
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }

    const rawUrl = match[0];
    const href = rawUrl.startsWith("www.") ? `https://${rawUrl}` : rawUrl;

    elements.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={
          linkClassName ||
          "inline-flex items-center gap-1 font-bold text-[#800020] hover:text-[#5a0016] underline underline-offset-2 decoration-[#800020]/50 hover:decoration-[#800020] bg-white/90 hover:bg-white px-2 py-0.5 rounded-md border border-amber-300/80 shadow-2xs hover:shadow-xs transition duration-200 break-all cursor-pointer"
        }
        title={`Abrir enlace: ${href}`}
      >
        <span className="break-all">{rawUrl}</span>
        <span className="text-[10px] text-amber-800 font-black opacity-80 select-none">
          ↗
        </span>
      </a>
    );

    lastIndex = match.index + rawUrl.length;
  }

  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return <span className={className}>{elements}</span>;
}

export default FormattedTextWithLinks;
