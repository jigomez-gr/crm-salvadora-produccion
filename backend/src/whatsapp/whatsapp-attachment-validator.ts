import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import * as path from 'path';
import { MediaType } from '../common/entities/message.entity';
import { WhatsappMediaInput } from './providers/whatsapp-provider.interface';

const DEFAULT_MAX_ATTACHMENT_MB = 101;

export interface RawUploadedFile {
  originalname: string;
  mimetype: string;
  size?: number;
  buffer: Buffer;
}

export interface ValidatedWhatsappAttachment extends WhatsappMediaInput {
  extension:
    | '.pdf'
    | '.docx'
    | '.xlsx'
    | '.txt'
    | '.mp3'
    | '.mp4'
    | '.jpg'
    | '.jpeg'
    | '.png'
    | '.webp';
  messageMediaType: MediaType;
  sizeBytes: number;
}

const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Resolves the CRM's internal maximum attachment size in bytes from
 * `process.env.WHATSAPP_MAX_ATTACHMENT_MB` (default: 101 MB).
 */
export function getWhatsappMaxAttachmentBytes(): {
  maxMb: number;
  maxBytes: number;
} {
  const raw = process.env.WHATSAPP_MAX_ATTACHMENT_MB;
  const parsed = raw ? Number(raw) : NaN;
  const maxMb =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ATTACHMENT_MB;
  return {
    maxMb,
    maxBytes: Math.floor(maxMb * 1024 * 1024),
  };
}

/**
 * Extracts entry file paths from a ZIP buffer (`PK\x03\x04` Local File Headers
 * and `PK\x01\x02` Central Directory File Headers) and verifies the End of
 * Central Directory signature (`PK\x05\x06`).
 *
 * Returns `null` if the buffer is not a valid ZIP archive.
 */
export function extractZipEntryNames(buffer: Buffer): Set<string> | null {
  if (!buffer || buffer.length < 22) return null;

  // Must start with Local File Header signature PK\x03\x04 (0x04034b50 LE)
  if (
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return null;
  }

  // Locate End of Central Directory (EOCD) signature PK\x05\x06 (0x06054b50 LE)
  // within the last 65557 bytes of the archive
  const minEocdOffset = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= minEocdOffset; i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    return null;
  }

  const entries = new Set<string>();

  // 1. Parse Central Directory headers (authoritative index in ZIP files)
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (cdOffset + cdSize <= buffer.length) {
    let ptr = cdOffset;
    for (let idx = 0; idx < totalEntries && ptr + 46 <= buffer.length; idx++) {
      if (
        buffer[ptr] !== 0x50 ||
        buffer[ptr + 1] !== 0x4b ||
        buffer[ptr + 2] !== 0x01 ||
        buffer[ptr + 3] !== 0x02
      ) {
        break;
      }
      const nameLen = buffer.readUInt16LE(ptr + 28);
      const extraLen = buffer.readUInt16LE(ptr + 30);
      const commentLen = buffer.readUInt16LE(ptr + 32);
      const nameStart = ptr + 46;
      const nameEnd = nameStart + nameLen;
      if (nameEnd > buffer.length) break;
      const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
      if (name) entries.add(name.replace(/\\/g, '/'));
      ptr = nameEnd + extraLen + commentLen;
    }
  }

  // 2. Also scan Local File Headers from offset 0 as a secondary verification
  let localPtr = 0;
  while (localPtr + 30 <= buffer.length) {
    if (
      buffer[localPtr] !== 0x50 ||
      buffer[localPtr + 1] !== 0x4b ||
      buffer[localPtr + 2] !== 0x03 ||
      buffer[localPtr + 3] !== 0x04
    ) {
      break;
    }
    const flags = buffer.readUInt16LE(localPtr + 6);
    const compressedSize = buffer.readUInt32LE(localPtr + 18);
    const nameLen = buffer.readUInt16LE(localPtr + 26);
    const extraLen = buffer.readUInt16LE(localPtr + 28);
    const nameStart = localPtr + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > buffer.length) break;
    const name = buffer.subarray(nameStart, nameEnd).toString('utf8');
    if (name) entries.add(name.replace(/\\/g, '/'));

    // If bit 3 (data descriptor) is set and compressedSize is 0, stop linear walk
    // and rely on Central Directory parsed above.
    if ((flags & 0x08) !== 0 && compressedSize === 0) {
      break;
    }
    const nextPtr = nameEnd + extraLen + compressedSize;
    if (nextPtr <= localPtr) break;
    localPtr = nextPtr;
  }

  return entries.size > 0 ? entries : null;
}

/**
 * Validates an uploaded WhatsApp attachment strictly by:
 * 1. CRM configurable size limit (`WHATSAPP_MAX_ATTACHMENT_MB` -> HTTP 413)
 * 2. Allowed extension (`.pdf`, `.docx`, `.xlsx`, `.txt`, `.mp3`, `.mp4`)
 * 3. Declared MIME type coherence
 * 4. Magic bytes / container structure (including internal ZIP structure for DOCX and XLSX)
 */
export function validateWhatsappAttachment(
  file: RawUploadedFile | null | undefined,
): ValidatedWhatsappAttachment {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new BadRequestException('El archivo adjunto no es válido.');
  }

  const sizeBytes = file.buffer.length;
  if (sizeBytes === 0) {
    throw new BadRequestException('El archivo adjunto está vacío (0 bytes).');
  }

  const { maxMb, maxBytes } = getWhatsappMaxAttachmentBytes();
  if (sizeBytes > maxBytes) {
    const fileMb = (sizeBytes / (1024 * 1024)).toFixed(2);
    throw new PayloadTooLargeException(
      `Límite interno del CRM superado: el archivo "${file.originalname}" pesa ${fileMb} MB y el máximo configurado (WHATSAPP_MAX_ATTACHMENT_MB) es ${maxMb} MB.`,
    );
  }

  const safeFilename = path.basename(file.originalname || '').trim();
  const ext = path.extname(safeFilename).toLowerCase();
  const rawMime = (file.mimetype || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  switch (ext) {
    case '.pdf': {
      if (rawMime !== 'application/pdf') {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .pdf ("${rawMime}"). Se esperaba "application/pdf".`,
        );
      }
      // Magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
      if (
        sizeBytes < 5 ||
        file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
      ) {
        throw new BadRequestException(
          'El archivo .pdf no contiene una cabecera PDF válida (%PDF-). Se rechazan archivos renombrados.',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: 'application/pdf',
        mediaCategory: 'document',
        messageMediaType: MediaType.DOCUMENT,
        extension: '.pdf',
        sizeBytes,
      };
    }

    case '.docx': {
      if (rawMime !== MIME_DOCX) {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .docx ("${rawMime}"). Se esperaba "${MIME_DOCX}".`,
        );
      }
      const entries = extractZipEntryNames(file.buffer);
      if (!entries) {
        throw new BadRequestException(
          'El archivo .docx no es un contenedor ZIP OpenXML válido (PK\\x03\\x04).',
        );
      }
      const entryList = Array.from(entries);
      const hasContentTypes = entries.has('[Content_Types].xml');
      const hasWordDir = entryList.some((e) => e.startsWith('word/'));
      const hasWordDocumentXml = entries.has('word/document.xml');
      if (!hasContentTypes || !hasWordDir || !hasWordDocumentXml) {
        throw new BadRequestException(
          'El archivo .docx no contiene la estructura interna obligatoria de Microsoft Word ([Content_Types].xml y word/document.xml). Se rechazan archivos ZIP o Excel renombrados.',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: MIME_DOCX,
        mediaCategory: 'document',
        messageMediaType: MediaType.DOCUMENT,
        extension: '.docx',
        sizeBytes,
      };
    }

    case '.xlsx': {
      if (rawMime !== MIME_XLSX) {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .xlsx ("${rawMime}"). Se esperaba "${MIME_XLSX}".`,
        );
      }
      const entries = extractZipEntryNames(file.buffer);
      if (!entries) {
        throw new BadRequestException(
          'El archivo .xlsx no es un contenedor ZIP OpenXML válido (PK\\x03\\x04).',
        );
      }
      const entryList = Array.from(entries);
      const hasContentTypes = entries.has('[Content_Types].xml');
      const hasXlDir = entryList.some((e) => e.startsWith('xl/'));
      const hasWorkbookXml = entries.has('xl/workbook.xml');
      if (!hasContentTypes || !hasXlDir || !hasWorkbookXml) {
        throw new BadRequestException(
          'El archivo .xlsx no contiene la estructura interna obligatoria de Microsoft Excel ([Content_Types].xml y xl/workbook.xml). Se rechazan archivos ZIP o Word renombrados.',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: MIME_XLSX,
        mediaCategory: 'document',
        messageMediaType: MediaType.DOCUMENT,
        extension: '.xlsx',
        sizeBytes,
      };
    }

    case '.txt': {
      if (rawMime !== 'text/plain') {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .txt ("${rawMime}"). Se esperaba "text/plain".`,
        );
      }
      // Reject binary NUL bytes or disguised binary signatures
      if (file.buffer.includes(0x00)) {
        throw new BadRequestException(
          'El archivo .txt contiene bytes binarios nulos (0x00) y no es texto plano válido.',
        );
      }
      if (
        (sizeBytes >= 5 &&
          file.buffer.subarray(0, 5).toString('ascii') === '%PDF-') ||
        (sizeBytes >= 4 &&
          file.buffer[0] === 0x50 &&
          file.buffer[1] === 0x4b &&
          file.buffer[2] === 0x03 &&
          file.buffer[3] === 0x04)
      ) {
        throw new BadRequestException(
          'El archivo .txt contiene una firma binaria (PDF/ZIP) renombrada.',
        );
      }
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
      } catch {
        throw new BadRequestException(
          'El archivo .txt no tiene una codificación de texto UTF-8 válida.',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: 'text/plain',
        mediaCategory: 'document',
        messageMediaType: MediaType.DOCUMENT,
        extension: '.txt',
        sizeBytes,
      };
    }

    case '.mp3': {
      if (rawMime !== 'audio/mpeg' && rawMime !== 'audio/mp3') {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .mp3 ("${rawMime}"). Se esperaba "audio/mpeg".`,
        );
      }
      const hasId3 =
        sizeBytes >= 3 &&
        file.buffer[0] === 0x49 &&
        file.buffer[1] === 0x44 &&
        file.buffer[2] === 0x33; // "ID3"
      const hasMpegSync =
        sizeBytes >= 2 &&
        file.buffer[0] === 0xff &&
        (file.buffer[1] & 0xe0) === 0xe0 &&
        (file.buffer[1] & 0x18) !== 0x08 &&
        (file.buffer[1] & 0x06) !== 0x00;

      if (!hasId3 && !hasMpegSync) {
        throw new BadRequestException(
          'El archivo .mp3 no contiene una cabecera ID3 ni un frame MPEG audio válido.',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: 'audio/mpeg',
        mediaCategory: 'audio',
        messageMediaType: MediaType.AUDIO,
        extension: '.mp3',
        sizeBytes,
      };
    }

    case '.mp4': {
      if (rawMime !== 'video/mp4') {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .mp4 ("${rawMime}"). Se esperaba "video/mp4".`,
        );
      }
      const hasFtyp =
        sizeBytes >= 12 &&
        file.buffer.subarray(4, 8).toString('ascii') === 'ftyp';
      if (!hasFtyp) {
        throw new BadRequestException(
          'El archivo .mp4 no contiene un átomo ISO Base Media (ftyp) válido.',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: 'video/mp4',
        mediaCategory: 'video',
        messageMediaType: MediaType.VIDEO,
        extension: '.mp4',
        sizeBytes,
      };
    }

    case '.jpg':
    case '.jpeg': {
      if (rawMime !== 'image/jpeg' && rawMime !== 'image/jpg') {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .jpeg/.jpg ("${rawMime}"). Se esperaba "image/jpeg".`,
        );
      }
      if (
        sizeBytes < 3 ||
        file.buffer[0] !== 0xff ||
        file.buffer[1] !== 0xd8 ||
        file.buffer[2] !== 0xff
      ) {
        throw new BadRequestException(
          'El archivo de imagen no contiene una cabecera JPEG válida (0xFFD8FF).',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: 'image/jpeg',
        mediaCategory: 'image',
        messageMediaType: MediaType.IMAGE,
        extension: ext as '.jpg' | '.jpeg',
        sizeBytes,
      };
    }

    case '.png': {
      if (rawMime !== 'image/png') {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .png ("${rawMime}"). Se esperaba "image/png".`,
        );
      }
      const isPng =
        sizeBytes >= 8 &&
        file.buffer[0] === 0x89 &&
        file.buffer[1] === 0x50 &&
        file.buffer[2] === 0x4e &&
        file.buffer[3] === 0x47 &&
        file.buffer[4] === 0x0d &&
        file.buffer[5] === 0x0a &&
        file.buffer[6] === 0x1a &&
        file.buffer[7] === 0x0a;
      if (!isPng) {
        throw new BadRequestException(
          'El archivo no contiene una cabecera PNG válida.',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: 'image/png',
        mediaCategory: 'image',
        messageMediaType: MediaType.IMAGE,
        extension: '.png',
        sizeBytes,
      };
    }

    case '.webp': {
      if (rawMime !== 'image/webp') {
        throw new BadRequestException(
          `Tipo MIME inválido para archivo .webp ("${rawMime}"). Se esperaba "image/webp".`,
        );
      }
      const isWebp =
        sizeBytes >= 12 &&
        file.buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        file.buffer.subarray(8, 12).toString('ascii') === 'WEBP';
      if (!isWebp) {
        throw new BadRequestException(
          'El archivo no contiene una cabecera WEBP válida (RIFF....WEBP).',
        );
      }
      return {
        buffer: file.buffer,
        filename: safeFilename,
        mimeType: 'image/webp',
        mediaCategory: 'image',
        messageMediaType: MediaType.IMAGE,
        extension: '.webp',
        sizeBytes,
      };
    }

    default:
      throw new BadRequestException(
        `Extensión de archivo no permitida ("${ext || 'sin extensión'}"). Formatos admitidos: .pdf, .docx, .xlsx, .txt, .mp3, .mp4, .jpg, .jpeg, .png, .webp.`,
      );
  }
}
