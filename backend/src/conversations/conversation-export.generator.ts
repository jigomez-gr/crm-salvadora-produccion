import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import archiver from 'archiver';
import { Conversation } from '../common/entities/conversation.entity';
import { Message, MessageDirection } from '../common/entities/message.entity';
import { ThreadSummary } from './messages.service';

export function formatChannelName(channel?: string | null, threadId?: string | null): string {
  const ch = (channel || '').toLowerCase();
  const th = (threadId || '').toLowerCase();

  if (ch === 'whatsapp' || th.includes('whatsapp') || (!ch && th.includes(':+'))) {
    return 'WhatsApp';
  }
  if (ch === 'widget' || th.includes('widget') || th.includes('landing')) {
    return 'Web Landing';
  }
  if (ch === 'call' || th.startsWith('call:')) {
    return 'Llamada telefónica (VAPI)';
  }
  if (ch === 'sms' || th.startsWith('sms:')) {
    return 'Mensaje SMS (Zadarma)';
  }
  if (ch === 'email' || th.includes('email')) {
    return 'Correo electrónico (Email)';
  }
  if (ch === 'playground' || th.includes('playground')) {
    return 'Playground (Pruebas)';
  }
  return channel ? channel.toUpperCase() : 'General';
}

export function formatDirectionName(direction?: string | null): string {
  if (direction === MessageDirection.INBOUND || direction === 'inbound') {
    return 'Entrante (Cliente)';
  }
  if (direction === MessageDirection.OUTBOUND || direction === 'outbound') {
    return 'Saliente (Clínica / Agente IA)';
  }
  return direction || '-';
}

export function formatDateMadrid(d?: Date | string | null): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function cleanSafeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

export function getConversationBaseFilename(conversation: Conversation): string {
  const channel = formatChannelName(conversation.channel, conversation.threadId).replace(/\s+/g, '_');
  const name = conversation.contact?.name || conversation.threadId.replace(/[^a-zA-Z0-9]/g, '_');
  const safeName = cleanSafeFilename(name);
  const dateSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `Conversacion_${cleanSafeFilename(channel)}_${safeName}_${dateSuffix}`;
}

export function decodeDataUrlBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const meta = dataUrl.slice(5, commaIdx);
  const isBase64 = meta.includes(';base64');
  const mimeType = meta.split(';')[0] || 'application/octet-stream';
  const dataStr = dataUrl.slice(commaIdx + 1);
  const buffer = Buffer.from(dataStr, isBase64 ? 'base64' : 'utf-8');
  return { buffer, mimeType };
}

// ─── 1. EXPORT TO CSV ────────────────────────────────────────────────────────
export function generateConversationCsv(
  conversation: Conversation,
  messages: Message[],
  options?: { reportTitle?: string; filterInfo?: string },
): string {
  const BOM = '\uFEFF';
  const lines: string[] = [];

  const contactName = conversation.contact?.name || 'No especificado';
  const contactPhone = conversation.contact?.phone || '-';
  const contactEmail = conversation.contact?.email || '-';
  const channelName = formatChannelName(conversation.channel, conversation.threadId);
  const title = options?.reportTitle || 'HISTORIAL DE CONVERSACIÓN';
  const filterInfo = options?.filterInfo || 'Historial completo';

  // Metadata comments
  lines.push(`# ${title}`);
  lines.push(`# Contacto / Interlocutor: ${contactName}`);
  lines.push(`# Teléfono: ${contactPhone}`);
  lines.push(`# Correo electrónico: ${contactEmail}`);
  lines.push(`# Tipo / Canal: ${channelName}`);
  lines.push(`# Identificador de Hilo: ${conversation.threadId}`);
  lines.push(`# Filtro / Periodo: ${filterInfo}`);
  lines.push(`# Total de mensajes: ${messages.length}`);
  lines.push(`# Fecha de exportación: ${formatDateMadrid(new Date())}`);
  lines.push('');

  // Headers
  lines.push('Nº;Fecha y Hora;Tipo/Canal;Dirección;Remitente;Mensaje;Archivos Adjuntos');

  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  sorted.forEach((m, idx) => {
    const num = idx + 1;
    const dateStr = formatDateMadrid(m.createdAt);
    const channel = formatChannelName(m.channel || conversation.channel, m.threadId || conversation.threadId);
    const direction = formatDirectionName(m.direction);
    const sender =
      m.direction === MessageDirection.INBOUND
        ? contactName
        : 'Clínica / Agente IA';
    const cleanBody = (m.body || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
    const attachmentInfo = m.mediaFilename
      ? `[${m.mediaType || 'archivo'}: ${m.mediaFilename}]`
      : m.mediaType
      ? `[Adjunto: ${m.mediaType}]`
      : '';

    lines.push(
      `${num};"${dateStr}";"${channel}";"${direction}";"${sender}";"${cleanBody}";"${attachmentInfo}"`,
    );
  });

  return BOM + lines.join('\r\n');
}

// ─── 2. EXPORT TO XLSX ───────────────────────────────────────────────────────
export async function generateConversationXlsx(
  conversation: Conversation,
  messages: Message[],
  options?: { reportTitle?: string; filterInfo?: string },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CRM Escuela de Yoga Salvadora Conesa';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Conversación', {
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  const contactName = conversation.contact?.name || 'No especificado';
  const contactPhone = conversation.contact?.phone || '-';
  const contactEmail = conversation.contact?.email || '-';
  const channelName = formatChannelName(conversation.channel, conversation.threadId);
  const title = options?.reportTitle || 'HISTORIAL DETALLADO DE CONVERSACIÓN';
  const filterInfo = options?.filterInfo || 'Historial completo';

  // 1. Título corporativo
  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title.toUpperCase();
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF800020' }, // Granate corporativo
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 32;

  // 2. Subtítulo / Metadata
  worksheet.mergeCells('A2:G2');
  const subCell = worksheet.getCell('A2');
  subCell.value = `Canal: ${channelName} | Contacto: ${contactName} (${contactPhone} · ${contactEmail}) | Filtro: ${filterInfo}`;
  subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF374151' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  // 3. Fila de KPIs / Resumen
  worksheet.mergeCells('A4:B4');
  const kpiTotal = worksheet.getCell('A4');
  kpiTotal.value = `TOTAL MENSAJES: ${messages.length}`;
  kpiTotal.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
  kpiTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  kpiTotal.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('C4:D4');
  const kpiChannel = worksheet.getCell('C4');
  kpiChannel.value = `CANAL: ${channelName.toUpperCase()}`;
  kpiChannel.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF065F46' } };
  kpiChannel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  kpiChannel.alignment = { vertical: 'middle', horizontal: 'center' };

  const inCount = messages.filter((m) => m.direction === MessageDirection.INBOUND).length;
  const outCount = messages.filter((m) => m.direction === MessageDirection.OUTBOUND).length;
  worksheet.mergeCells('E4:G4');
  const kpiDir = worksheet.getCell('E4');
  kpiDir.value = `ENTRANTES: ${inCount} | SALIENTES: ${outCount}`;
  kpiDir.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF92400E' } };
  kpiDir.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  kpiDir.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(4).height = 24;

  // 4. Cabeceras de tabla
  const headerRowIdx = 6;
  const columns = [
    { header: 'Nº', key: 'num', width: 6 },
    { header: 'Fecha y Hora', key: 'date', width: 20 },
    { header: 'Tipo / Canal', key: 'channel', width: 20 },
    { header: 'Dirección', key: 'direction', width: 18 },
    { header: 'Remitente', key: 'sender', width: 24 },
    { header: 'Mensaje', key: 'body', width: 55 },
    { header: 'Archivos Adjuntos', key: 'attachment', width: 32 },
  ];

  worksheet.getRow(headerRowIdx).values = columns.map((c) => c.header);
  worksheet.getRow(headerRowIdx).height = 24;
  worksheet.getRow(headerRowIdx).eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A0E17' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      bottom: { style: 'medium', color: { argb: 'FF4B5563' } },
      left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      right: { style: 'thin', color: { argb: 'FF9CA3AF' } },
    };
  });

  const sorted = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  sorted.forEach((m, idx) => {
    const rowIdx = headerRowIdx + 1 + idx;
    const num = idx + 1;
    const dateStr = formatDateMadrid(m.createdAt);
    const channel = formatChannelName(m.channel || conversation.channel, m.threadId || conversation.threadId);
    const direction = formatDirectionName(m.direction);
    const sender =
      m.direction === MessageDirection.INBOUND
        ? contactName
        : 'Clínica / Agente IA';
    const attachmentInfo = m.mediaFilename
      ? `${m.mediaFilename} (${m.mediaType || 'archivo'})`
      : m.mediaType
      ? `Adjunto: ${m.mediaType}`
      : '-';

    const row = worksheet.getRow(rowIdx);
    row.values = [num, dateStr, channel, direction, sender, m.body || '', attachmentInfo];
    row.alignment = { vertical: 'top', wrapText: true };

    const isEven = idx % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 9, color: { argb: 'FF111827' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF9FAFB' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 4) {
        cell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
      }
    });
  });

  // Anchos de columna
  columns.forEach((col, i) => {
    worksheet.getColumn(i + 1).width = col.width;
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ─── 3. EXPORT TO PDF ────────────────────────────────────────────────────────
export function generateConversationPdf(
  conversation: Conversation,
  messages: Message[],
  options?: { reportTitle?: string; filterInfo?: string },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      bufferPages: true,
      info: {
        Title: options?.reportTitle || 'Historial de Conversación',
        Author: 'CRM Escuela de Yoga Salvadora Conesa',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contactName = conversation.contact?.name || 'No especificado';
    const contactPhone = conversation.contact?.phone || '-';
    const contactEmail = conversation.contact?.email || '-';
    const channelName = formatChannelName(conversation.channel, conversation.threadId);
    const title = options?.reportTitle || 'HISTORIAL DE CONVERSACIÓN';
    const filterInfo = options?.filterInfo || 'Historial completo';

    // 1. Cabecera con fondo granate corporativo #800020
    doc.rect(36, 36, 523, 50).fill('#800020');
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(title, 46, 48, { align: 'center', width: 503 });

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#E5E7EB')
      .text(
        `Canal: ${channelName} · Contacto: ${contactName} · Generado el ${formatDateMadrid(new Date())}`,
        46,
        68,
        { align: 'center', width: 503 },
      );

    // 2. Ficha de Información de la conversación
    let y = 96;
    doc.rect(36, y, 523, 62).fillAndStroke('#F9FAFB', '#E5E7EB');
    doc.fillColor('#1F2937').font('Helvetica-Bold').fontSize(9);

    doc.text('Contacto / Alumno:', 46, y + 8);
    doc.font('Helvetica').text(contactName, 150, y + 8);

    doc.font('Helvetica-Bold').text('Teléfono:', 46, y + 22);
    doc.font('Helvetica').text(contactPhone, 150, y + 22);

    doc.font('Helvetica-Bold').text('Email:', 46, y + 36);
    doc.font('Helvetica').text(contactEmail, 150, y + 36);

    doc.font('Helvetica-Bold').text('Tipo / Canal:', 310, y + 8);
    doc.font('Helvetica').fillColor('#800020').text(channelName, 400, y + 8);

    doc.fillColor('#1F2937').font('Helvetica-Bold').text('Total Mensajes:', 310, y + 22);
    doc.font('Helvetica').text(`${messages.length}`, 400, y + 22);

    doc.font('Helvetica-Bold').text('Periodo:', 310, y + 36);
    doc.font('Helvetica').text(filterInfo, 400, y + 36, { width: 150 });

    y += 74;

    // 3. Encabezados de la tabla
    const colWidths = { num: 24, date: 85, channel: 75, sender: 85, body: 254 };
    const colX = {
      num: 36,
      date: 36 + colWidths.num,
      channel: 36 + colWidths.num + colWidths.date,
      sender: 36 + colWidths.num + colWidths.date + colWidths.channel,
      body: 36 + colWidths.num + colWidths.date + colWidths.channel + colWidths.sender,
    };

    const drawTableHeader = (curY: number) => {
      doc.rect(36, curY, 523, 20).fill('#4A0E17');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      doc.text('Nº', colX.num + 4, curY + 6);
      doc.text('Fecha / Hora', colX.date + 4, curY + 6);
      doc.text('Tipo / Canal', colX.channel + 4, curY + 6);
      doc.text('Remitente', colX.sender + 4, curY + 6);
      doc.text('Mensaje / Contenido', colX.body + 4, curY + 6);
      return curY + 20;
    };

    y = drawTableHeader(y);

    const sorted = [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    sorted.forEach((m, idx) => {
      const num = String(idx + 1);
      const dateStr = formatDateMadrid(m.createdAt);
      const channel = formatChannelName(m.channel || conversation.channel, m.threadId || conversation.threadId);
      const isOut =
        m.direction === MessageDirection.OUTBOUND ||
        (m.direction as any) === 'outbound';
      const sender = isOut ? 'Clínica / IA' : contactName;
      let bodyText = m.body || '';
      if (m.mediaFilename) {
        bodyText += `\n[Adjunto: ${m.mediaFilename}]`;
      } else if (m.mediaType) {
        bodyText += `\n[Adjunto: ${m.mediaType}]`;
      }

      doc.font('Helvetica').fontSize(8);
      const bodyHeight = doc.heightOfString(bodyText, { width: colWidths.body - 8 });
      const rowHeight = Math.max(22, bodyHeight + 8);

      // Salto de página si excede el límite
      if (y + rowHeight > doc.page.height - 40) {
        doc.addPage();
        y = 36;
        y = drawTableHeader(y);
      }

      // Fondo alternado
      if (idx % 2 === 1) {
        doc.rect(36, y, 523, rowHeight).fill('#F9FAFB');
      }

      // Bordes
      doc.rect(36, y, 523, rowHeight).strokeColor('#E5E7EB').stroke();

      doc.fillColor('#111827').font('Helvetica').fontSize(8);
      doc.text(num, colX.num + 4, y + 4, { width: colWidths.num - 6 });
      doc.text(dateStr, colX.date + 4, y + 4, { width: colWidths.date - 6 });
      doc.fillColor(isOut ? '#1E3A8A' : '#065F46').text(channel, colX.channel + 4, y + 4, { width: colWidths.channel - 6 });
      doc.fillColor('#374151').font('Helvetica-Bold').text(sender, colX.sender + 4, y + 4, { width: colWidths.sender - 6 });
      doc.fillColor('#111827').font('Helvetica').text(bodyText, colX.body + 4, y + 4, { width: colWidths.body - 8 });

      y += rowHeight;
    });

    // Numeración de páginas
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#9CA3AF')
        .text(
          `Página ${i + 1} de ${totalPages} · Escuela de Yoga Salvadora Conesa`,
          36,
          doc.page.height - 25,
          { align: 'center', width: 523 },
        );
    }

    doc.end();
  });
}

// ─── 4. EXPORT TO ZIP (WITH EXPORTS AND ATTACHED DOCUMENTS) ──────────────────
export async function generateConversationZip(
  conversation: Conversation,
  messages: Message[],
  options?: {
    zipFilename?: string;
    reportTitle?: string;
    filterInfo?: string;
    extraFiles?: Array<{ name: string; buffer: Buffer }>;
    agentConfig?: any;
  },
): Promise<Buffer> {
  const baseName = cleanSafeFilename(
    options?.zipFilename || getConversationBaseFilename(conversation),
  );

  const [pdfBuf, xlsxBuf] = await Promise.all([
    generateConversationPdf(conversation, messages, options),
    generateConversationXlsx(conversation, messages, options),
  ]);
  const csvStr = generateConversationCsv(conversation, messages, options);
  const csvBuf = Buffer.from(csvStr, 'utf-8');

  return new Promise((resolve, reject) => {
    const zip = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    zip.on('data', (c: Buffer) => chunks.push(c));
    zip.on('end', () => resolve(Buffer.concat(chunks)));
    zip.on('error', reject);

    // 1. Agregar transcripciones de la conversación
    zip.append(pdfBuf, { name: `${baseName}.pdf` });
    zip.append(xlsxBuf, { name: `${baseName}.xlsx` });
    zip.append(csvBuf, { name: `${baseName}.csv` });

    // 2. Adjuntos de la conversación
    const seenFilenames = new Set<string>();
    messages.forEach((m, idx) => {
      if (m.mediaUrl && m.mediaUrl.startsWith('data:')) {
        const decoded = decodeDataUrlBuffer(m.mediaUrl);
        if (decoded) {
          let origName = m.mediaFilename || `adjunto_${idx + 1}`;
          if (seenFilenames.has(origName)) {
            origName = `${idx + 1}_${origName}`;
          }
          seenFilenames.add(origName);
          zip.append(decoded.buffer, { name: `adjuntos/${origName}` });
        }
      }
    });

    // 3. Archivos adicionales
    if (options?.extraFiles) {
      options.extraFiles.forEach((ef) => {
        zip.append(ef.buffer, { name: ef.name });
      });
    }

    zip.finalize();
  });
}

// ─── 5. EXPORT CONVERSATION LIST (CSV / XLSX / PDF) ─────────────────────────
export function generateConversationListCsv(
  threads: ThreadSummary[],
  filterInfo?: string,
): string {
  const header = [
    'Fecha',
    'Canal',
    'Contacto',
    'Teléfono',
    'Email',
    'Estado',
    'Modo',
    'Último Mensaje',
  ];

  const rows = threads.map((t) => {
    const dateRef = t.lastMessage?.createdAt || t.createdAt;
    const fecha = formatDateMadrid(dateRef);
    const canal = formatChannelName(t.channel, t.threadId);
    const contacto = t.contact?.name || '-';
    const telefono = t.contact?.phone || '-';
    const email = t.contact?.email || '-';
    const estado = t.unreadCount > 0 ? `Sin leer (${t.unreadCount})` : 'Leído';
    const modo = t.handoff ? 'Intervención manual (Humano)' : 'Agente IA';
    const ultimoMsg = (t.lastMessage?.body || '').replace(/\r?\n/g, ' ').trim();

    return [fecha, canal, contacto, telefono, email, estado, modo, ultimoMsg]
      .map((cell) => {
        const escaped = String(cell ?? '').replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(',');
  });

  const banner = filterInfo ? `# Filtros: ${filterInfo}\n` : '';
  return '\uFEFF' + banner + header.map((h) => `"${h}"`).join(',') + '\n' + rows.join('\n');
}

export async function generateConversationListXlsx(
  threads: ThreadSummary[],
  filterInfo?: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Escuela de Yoga Salvadora Conesa CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Conversaciones', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  });

  // Título
  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Listado de Conversaciones';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1F2937' } };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 24;

  // Subtítulo con filtros y fecha
  sheet.mergeCells('A2:H2');
  const subCell = sheet.getCell('A2');
  subCell.value = `Filtros: ${filterInfo || 'Todas las conversaciones'} | Total: ${threads.length} | Generado: ${formatDateMadrid(new Date())}`;
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF6B7280' } };
  sheet.getRow(2).height = 18;

  sheet.addRow([]); // Fila 3 vacía

  // Cabecera tabla
  const headerRow = sheet.addRow([
    'Fecha',
    'Canal',
    'Contacto',
    'Teléfono',
    'Email',
    'Estado',
    'Modo',
    'Último Mensaje',
  ]);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' }, // Indigo brand
    };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF3730A3' } },
      bottom: { style: 'medium', color: { argb: 'FF3730A3' } },
    };
  });

  // Filas de datos
  threads.forEach((t, idx) => {
    const dateRef = t.lastMessage?.createdAt || t.createdAt;
    const fecha = formatDateMadrid(dateRef);
    const canal = formatChannelName(t.channel, t.threadId);
    const contacto = t.contact?.name || '-';
    const telefono = t.contact?.phone || '-';
    const email = t.contact?.email || '-';
    const estado = t.unreadCount > 0 ? `Sin leer (${t.unreadCount})` : 'Leído';
    const modo = t.handoff ? 'Intervención manual' : 'Agente IA';
    const ultimoMsg = (t.lastMessage?.body || '').replace(/\r?\n/g, ' ').trim();

    const row = sheet.addRow([
      fecha,
      canal,
      contacto,
      telefono,
      email,
      estado,
      modo,
      ultimoMsg,
    ]);
    row.height = 20;

    const isEven = idx % 2 === 0;
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }
      if (colNum === 1 || colNum === 2 || colNum === 6 || colNum === 7) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  sheet.columns = [
    { width: 20 }, // Fecha
    { width: 18 }, // Canal
    { width: 25 }, // Contacto
    { width: 18 }, // Teléfono
    { width: 25 }, // Email
    { width: 14 }, // Estado
    { width: 20 }, // Modo
    { width: 50 }, // Último Mensaje
  ];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function generateConversationListPdf(
  threads: ThreadSummary[],
  filterInfo?: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 72; // 36 * 2

    // Header
    doc.rect(36, 36, contentWidth, 42).fill('#4F46E5');
    doc
      .fillColor('#FFFFFF')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('LISTADO DE CONVERSACIONES', 48, 45);

    doc
      .fillColor('#E0E7FF')
      .fontSize(8)
      .font('Helvetica')
      .text(
        `Filtros: ${filterInfo || 'Todas las conversaciones'} | Total: ${threads.length} | Generado: ${formatDateMadrid(new Date())}`,
        48,
        62,
      );

    let y = 90;
    const colWidths = {
      fecha: 95,
      canal: 80,
      contacto: 120,
      telefono: 85,
      estado: 65,
      ultimoMsg: contentWidth - 445,
    };
    const colX = {
      fecha: 36,
      canal: 36 + 95,
      contacto: 36 + 95 + 80,
      telefono: 36 + 95 + 80 + 120,
      estado: 36 + 95 + 80 + 120 + 85,
      ultimoMsg: 36 + 95 + 80 + 120 + 85 + 65,
    };

    const drawHeader = (currY: number) => {
      doc.rect(36, currY, contentWidth, 20).fill('#F3F4F6');
      doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8);
      doc.text('FECHA', colX.fecha + 4, currY + 6);
      doc.text('CANAL', colX.canal + 4, currY + 6);
      doc.text('CONTACTO', colX.contacto + 4, currY + 6);
      doc.text('TELÉFONO', colX.telefono + 4, currY + 6);
      doc.text('ESTADO', colX.estado + 4, currY + 6);
      doc.text('ÚLTIMO MENSAJE', colX.ultimoMsg + 4, currY + 6);
      return currY + 22;
    };

    y = drawHeader(y);

    threads.forEach((t, idx) => {
      if (y + 24 > doc.page.height - 40) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
        y = drawHeader(36);
      }

      const isEven = idx % 2 === 0;
      if (isEven) {
        doc.rect(36, y, contentWidth, 18).fill('#F9FAFB');
      }

      const dateRef = t.lastMessage?.createdAt || t.createdAt;
      const fecha = formatDateMadrid(dateRef);
      const canal = formatChannelName(t.channel, t.threadId);
      const contacto = t.contact?.name || '-';
      const telefono = t.contact?.phone || '-';
      const estado = t.unreadCount > 0 ? `Sin leer (${t.unreadCount})` : 'Leído';
      const msg = (t.lastMessage?.body || '').replace(/\r?\n/g, ' ').slice(0, 75);

      doc.fillColor('#111827').font('Helvetica').fontSize(7.5);
      doc.text(fecha, colX.fecha + 4, y + 5, { width: colWidths.fecha - 8, lineBreak: false });
      doc.text(canal, colX.canal + 4, y + 5, { width: colWidths.canal - 8, lineBreak: false });
      doc.text(contacto, colX.contacto + 4, y + 5, { width: colWidths.contacto - 8, lineBreak: false });
      doc.text(telefono, colX.telefono + 4, y + 5, { width: colWidths.telefono - 8, lineBreak: false });
      doc.text(estado, colX.estado + 4, y + 5, { width: colWidths.estado - 8, lineBreak: false });
      doc.text(msg, colX.ultimoMsg + 4, y + 5, { width: colWidths.ultimoMsg - 8, lineBreak: false });

      y += 18;
    });

    // Numeración
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#9CA3AF')
        .text(
          `Página ${i + 1} de ${totalPages} · Escuela de Yoga Salvadora Conesa`,
          36,
          doc.page.height - 25,
          { align: 'center', width: contentWidth },
        );
    }

    doc.end();
  });
}

