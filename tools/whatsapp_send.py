#!/usr/bin/env python3
"""
CRM Salvadora — Herramienta CLI de envío manual por WhatsApp (DGX).

Delega siempre en el backend del CRM (`POST /api/whatsapp/cli/send`) usando
`multipart/form-data` y el header `x-whatsapp-cli-token`, garantizando:
  - Uso del proveedor activo configurado por agente (Evolution API / YCloud / futuro Meta)
  - Creación/actualización de contacto y conversación en Inbox
  - Registro del mensaje saliente y auditoría (`whatsapp.admin_send`)
  - Validación estricta de archivos (.pdf, .docx, .xlsx, .txt, .mp3, .mp4)
"""

import argparse
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from typing import Dict, Optional, Tuple

EXPLICIT_MIME_MAP: Dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
}


def resolve_mime_type(file_path: str) -> str:
    _, ext = os.path.splitext(file_path.lower())
    if ext in EXPLICIT_MIME_MAP:
        return EXPLICIT_MIME_MAP[ext]
    guessed, _ = mimetypes.guess_type(file_path)
    return guessed or "application/octet-stream"


def build_multipart_body(
    fields: Dict[str, str],
    file_path: Optional[str] = None,
) -> Tuple[bytes, str]:
    boundary = f"----CRMSalvadoraBoundary{uuid.uuid4().hex}"
    chunks = []

    for name, value in fields.items():
        if value is None or value == "":
            continue
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8")
        )
        chunks.append(f"{value}\r\n".encode("utf-8"))

    if file_path:
        filename = os.path.basename(file_path)
        mime_type = resolve_mime_type(file_path)
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        chunks.append(f"--{boundary}\r\n".encode("utf-8"))
        chunks.append(
            (
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: {mime_type}\r\n\r\n"
            ).encode("utf-8")
        )
        chunks.append(file_bytes)
        chunks.append(b"\r\n")

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(chunks)
    content_type = f"multipart/form-data; boundary={boundary}"
    return body, content_type


def normalize_endpoint_url(base_url: str) -> str:
    cleaned = base_url.strip().rstrip("/")
    if cleaned.endswith("/api/whatsapp/cli/send"):
        return cleaned
    if cleaned.endswith("/api"):
        return f"{cleaned}/whatsapp/cli/send"
    return f"{cleaned}/api/whatsapp/cli/send"


def fail(message: str, code: int = 1) -> None:
    print(f"ERROR: {message}")
    sys.exit(code)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="whatsapp_send.py",
        description=(
            "Envía mensajes y adjuntos manuales de WhatsApp a través del backend "
            "de CRM Salvadora (POST /api/whatsapp/cli/send)."
        ),
    )
    parser.add_argument(
        "--agent",
        default="booking",
        help="Clave del agente en el CRM (por defecto: booking).",
    )
    parser.add_argument(
        "--to",
        required=True,
        help="Teléfono de destino en formato E.164 (ej: +34600111222).",
    )
    parser.add_argument(
        "--message",
        default="",
        help="Texto del mensaje o caption del archivo adjunto.",
    )
    parser.add_argument(
        "--file",
        default="",
        help="Ruta local al archivo adjunto (.pdf, .docx, .xlsx, .txt, .mp3, .mp4).",
    )
    parser.add_argument(
        "--url",
        default=os.environ.get("CRM_API_URL", "http://localhost:3001"),
        help="URL base del CRM (por defecto: CRM_API_URL o http://localhost:3001).",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("WHATSAPP_CLI_TOKEN", ""),
        help="Token de autenticación CLI (por defecto: variable de entorno WHATSAPP_CLI_TOKEN).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    to_phone = (args.to or "").strip()
    message_text = (args.message or "").strip()
    file_path = (args.file or "").strip()
    token = (args.token or "").strip()

    if not to_phone:
        fail("El parámetro --to es obligatorio.")

    if not message_text and not file_path:
        fail("Debes proporcionar --message, --file o ambos.")

    if not token:
        fail(
            "Falta el token CLI. Define la variable de entorno WHATSAPP_CLI_TOKEN o pásalo con --token."
        )

    if file_path:
        if not os.path.isfile(file_path):
            fail(f'No se encontró el archivo adjunto: "{file_path}"')

    endpoint = normalize_endpoint_url(args.url)
    fields = {
        "agentKey": (args.agent or "booking").strip() or "booking",
        "to": to_phone,
        "message": message_text,
    }

    try:
        body, content_type = build_multipart_body(
            fields, file_path if file_path else None
        )
    except OSError as exc:
        fail(f"No se pudo leer el archivo adjunto: {exc}")
        return

    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Content-Type": content_type,
            "x-whatsapp-cli-token": token,
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as http_err:
        err_body = ""
        try:
            err_body = http_err.read().decode("utf-8", errors="replace")
            parsed_err = json.loads(err_body)
            msg = parsed_err.get("message") or parsed_err.get("error") or err_body
            if isinstance(msg, list):
                msg = "; ".join(str(x) for x in msg)
            fail(f"HTTP {http_err.code} — {msg}")
        except Exception:
            fail(f"HTTP {http_err.code} — {err_body or http_err.reason}")
        return
    except urllib.error.URLError as url_err:
        fail(f"No se pudo conectar con el CRM en {endpoint}: {url_err.reason}")
        return
    except Exception as exc:
        fail(str(exc))
        return

    provider = data.get("provider", "unknown")
    recipient = data.get("to", to_phone)
    primary_id = data.get("providerMessageId") or ""
    all_ids = data.get("providerMessageIds") or (
        [primary_id] if primary_id else []
    )
    status = data.get("status", "sent")

    print("OK")
    print(f"provider: {provider}")
    print(f"to: {recipient}")
    print(f"providerMessageId: {primary_id}")
    if isinstance(all_ids, list) and len(all_ids) > 1:
        print("providerMessageIds:")
        for mid in all_ids:
            print(f"- {mid}")
    print(f"status: {status}")


if __name__ == "__main__":
    main()
