import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import archiver from 'archiver';
import { Appointment } from '../common/entities/appointment.entity';

export function cleanSafeFilename(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || 'B'}`;
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

export function formatDateOnlyMadrid(d?: Date | string | null): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTimeMadrid(d?: Date | string | null): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAppointmentStatus(status?: string | null): string {
  switch (status) {
    case 'scheduled':
      return 'Programada';
    case 'pending_approval':
      return 'Pendiente';
    case 'completed':
      return 'Completada';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status || 'Programada';
  }
}

export function formatModality(modality?: string | null): string {
  switch (modality) {
    case 'virtual':
      return 'Virtual (Cal.com)';
    case 'phone':
      return 'Telefónica';
    case 'in_person':
    default:
      return 'Presencial';
  }
}

export function formatPaymentStatus(status?: string | null): string {
  switch (status) {
    case 'paid':
      return 'Pagado';
    case 'pending':
    case 'unpaid':
      return 'Pendiente';
    case 'exempt':
      return 'Exento / Prueba';
    case 'refunded':
      return 'Reembolsado';
    default:
      return 'Pendiente';
  }
}

function sanitizeCsv(value: any): string {
  let s = String(value ?? '').trim();
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";,\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── 1. CSV GENERATOR ────────────────────────────────────────────────────────
export function generateAppointmentsCsv(
  items: Appointment[],
  filterInfo = '',
  reportTitle?: string,
): Buffer {
  const lines: string[] = [];
  const BOM = '\uFEFF';

  const headerTitle = reportTitle
    ? `CENTRO DE YOGA SALVADORA CONESA - ${reportTitle.toUpperCase()}`
    : `CENTRO DE YOGA SALVADORA CONESA - LISTADO OFICIAL DE CITAS`;
  lines.push(headerTitle);
  if (filterInfo) lines.push(`Filtros: ${sanitizeCsv(filterInfo)}`);
  
  const totalCount = items.length;
  const withAttachCount = items.filter((a) => a.patientAttachmentName).length;
  lines.push(
    `Resumen: Total Citas=${totalCount} | Con Documento Adjunto del Paciente=${withAttachCount} | Generado=${formatDateMadrid(new Date())}`,
  );
  lines.push('');

  // Strict rule: DO NOT include clinical diagnosis
  const headers = [
    'Fecha Cita',
    'Hora Inicio',
    'Hora Fin',
    'Alumno / Paciente',
    'Teléfono',
    'Email',
    'Servicio / Actividad',
    'Modalidad',
    'Estado Cita',
    'Precio (€)',
    'Estado Pago',
    'Método Pago',
    'Motivo / Observaciones',
    'Tiene Documento Adjunto',
    'Nombre Documento Adjunto',
    'Tamaño Documento Adjunto',
    'Fecha Subida Adjunto',
  ];
  lines.push(headers.map(sanitizeCsv).join(';'));

  for (const item of items) {
    const hasAttach = Boolean(item.patientAttachmentName);
    const row = [
      formatDateOnlyMadrid(item.startsAt),
      formatTimeMadrid(item.startsAt),
      formatTimeMadrid(item.endsAt),
      item.contact?.name || 'Sin asignar',
      item.contact?.phone || '-',
      item.contact?.email || '-',
      item.service || '-',
      formatModality(item.modality),
      formatAppointmentStatus(item.status),
      item.price ? `${parseFloat(item.price).toFixed(2).replace('.', ',')} €` : '0,00 €',
      formatPaymentStatus(item.paymentStatus),
      item.paymentMethod || '-',
      item.reason || '-',
      hasAttach ? 'SÍ' : 'NO',
      item.patientAttachmentName || '-',
      hasAttach ? formatBytes(item.patientAttachmentSize) : '-',
      formatDateMadrid(item.patientAttachmentUploadedAt),
    ];
    lines.push(row.map(sanitizeCsv).join(';'));
  }

  return Buffer.from(BOM + lines.join('\r\n'), 'utf-8');
}

// ─── 2. EXCEL XLSX GENERATOR ─────────────────────────────────────────────────
export async function generateAppointmentsXlsx(
  items: Appointment[],
  filterInfo = '',
  reportTitle?: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Salvadora Conesa CRM';
  workbook.lastModifiedBy = 'Salvadora Conesa CRM';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Citas y Agenda', {
    views: [{ showGridLines: true }],
  });

  const displayTitle = reportTitle
    ? reportTitle.toUpperCase()
    : 'LISTADO DE CITAS Y RESERVAS DE ALUMNOS';

  // 1. Título principal
  worksheet.mergeCells('A1:L1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `CENTRO DE YOGA SALVADORA CONESA · ${displayTitle}`;
  titleCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF800020' }, // Granate corporativo
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // 2. Subtítulo / Filtros
  worksheet.mergeCells('A2:L2');
  const subCell = worksheet.getCell('A2');
  subCell.value = `Filtros: ${filterInfo || 'Todas las citas visualizadas'} · Generado: ${formatDateMadrid(new Date())}`;
  subCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF4B5563' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  // 3. Tarjetas Resumen KPIs
  const totalCount = items.length;
  const scheduledCount = items.filter((a) => a.status === 'scheduled').length;
  const completedCount = items.filter((a) => a.status === 'completed').length;
  const withAttachCount = items.filter((a) => a.patientAttachmentName).length;

  worksheet.mergeCells('A4:C4');
  const kpiTotal = worksheet.getCell('A4');
  kpiTotal.value = `TOTAL CITAS: ${totalCount}`;
  kpiTotal.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F2937' } };
  kpiTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  kpiTotal.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('D4:F4');
  const kpiProg = worksheet.getCell('D4');
  kpiProg.value = `PROGRAMADAS: ${scheduledCount}`;
  kpiProg.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
  kpiProg.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  kpiProg.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('G4:I4');
  const kpiComp = worksheet.getCell('G4');
  kpiComp.value = `COMPLETADAS: ${completedCount}`;
  kpiComp.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF065F46' } };
  kpiComp.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  kpiComp.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('J4:L4');
  const kpiAttach = worksheet.getCell('J4');
  kpiAttach.value = `CON ADJUNTO PACIENTE: ${withAttachCount}`;
  kpiAttach.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF6B21A8' } };
  kpiAttach.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } };
  kpiAttach.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(4).height = 24;

  // 4. Encabezados de tabla
  const headerRowIdx = 6;
  const headers = [
    { header: 'Fecha y Hora', key: 'dateTime', width: 20 },
    { header: 'Alumno / Paciente', key: 'patient', width: 25 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'Servicio / Actividad', key: 'service', width: 28 },
    { header: 'Modalidad', key: 'modality', width: 16 },
    { header: 'Estado', key: 'status', width: 16 },
    { header: 'Precio (€)', key: 'price', width: 14 },
    { header: 'Estado Pago', key: 'paymentStatus', width: 16 },
    { header: 'Motivo', key: 'reason', width: 30 },
    { header: 'Documento Adjunto Paciente', key: 'attachmentName', width: 30 },
    { header: 'Tamaño Adjunto', key: 'attachmentSize', width: 16 },
    { header: 'Fecha Subida Adjunto', key: 'attachmentDate', width: 20 },
  ];

  worksheet.columns = headers;
  const headerRow = worksheet.getRow(headerRowIdx);
  headerRow.height = 24;

  headers.forEach((h, colIdx) => {
    const cell = headerRow.getCell(colIdx + 1);
    cell.value = h.header;
    cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B36' } };
    cell.alignment = { vertical: 'middle', horizontal: colIdx === 6 ? 'right' : 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF800020' } },
      bottom: { style: 'medium', color: { argb: 'FF800020' } },
    };
  });

  // 5. Filas de datos
  let currentRowIdx = 7;
  for (const item of items) {
    const priceNum = item.price ? parseFloat(item.price) : 0;
    const hasAttach = Boolean(item.patientAttachmentName);
    const row = worksheet.getRow(currentRowIdx);
    row.height = 20;

    const dtStr = `${formatDateOnlyMadrid(item.startsAt)} ${formatTimeMadrid(item.startsAt)} - ${formatTimeMadrid(item.endsAt)}`;
    row.getCell(1).value = dtStr;
    row.getCell(2).value = item.contact?.name || 'Sin asignar';
    row.getCell(3).value = item.contact?.phone || '-';
    row.getCell(4).value = item.service || '-';
    row.getCell(5).value = formatModality(item.modality);
    row.getCell(6).value = formatAppointmentStatus(item.status);

    const priceCell = row.getCell(7);
    priceCell.value = isNaN(priceNum) ? 0 : priceNum;
    priceCell.numFmt = '#,##0.00 "€"';
    priceCell.alignment = { horizontal: 'right' };

    row.getCell(8).value = formatPaymentStatus(item.paymentStatus);
    row.getCell(9).value = item.reason || '-';
    row.getCell(10).value = hasAttach ? item.patientAttachmentName : 'Sin adjuntos';
    row.getCell(11).value = hasAttach ? formatBytes(item.patientAttachmentSize) : '-';
    row.getCell(12).value = hasAttach ? formatDateMadrid(item.patientAttachmentUploadedAt) : '-';

    const isEven = currentRowIdx % 2 === 0;
    const bgColor = isEven ? 'FFF9FAFB' : 'FFFFFFFF';

    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 9 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      if (!cell.fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      }
      if (c === 6) {
        // Status color
        cell.font = { name: 'Arial', size: 9, bold: true };
        if (item.status === 'scheduled') cell.font.color = { argb: 'FF1D4ED8' };
        else if (item.status === 'completed') cell.font.color = { argb: 'FF059669' };
        else if (item.status === 'cancelled') cell.font.color = { argb: 'FFDC2626' };
        else cell.font.color = { argb: 'FFD97706' };
      }
      if (c === 10 && hasAttach) {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF7C3AED' } };
      }
    }

    currentRowIdx++;
  }

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(rawBuffer);
}

// ─── 3. PDF GENERATOR ────────────────────────────────────────────────────────
export function generateAppointmentsPdf(
  items: Appointment[],
  filterInfo = '',
  reportTitle?: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const displayTitle = reportTitle
        ? reportTitle.toUpperCase()
        : 'LISTADO OFICIAL DE CITAS Y RESERVAS';

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape', // 842 × 595 pt
        margin: 36,
        bufferPages: true,
        info: {
          Title: `${displayTitle} - Centro de Yoga Salvadora Conesa`,
          Author: 'Salvadora Conesa CRM',
          Subject: 'Listado oficial de citas y reservas',
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 842;
      const margin = 36;
      const printableWidth = pageWidth - margin * 2; // 770 pt

      const primaryColor = '#800020'; // Granate corporativo
      const darkColor = '#1F2937';
      const grayColor = '#4B5563';
      const borderLineColor = '#E5E7EB';

      const drawHeader = (isFirstPage: boolean) => {
        doc.rect(margin, margin, printableWidth, isFirstPage ? 56 : 34).fill('#FAF9F6');
        doc.rect(margin, margin, 6, isFirstPage ? 56 : 34).fill(primaryColor);

        doc.fillColor(primaryColor)
          .fontSize(isFirstPage ? 13 : 10)
          .font('Helvetica-Bold')
          .text('CENTRO DE YOGA SALVADORA CONESA · FUENLABRADA', margin + 14, margin + 9);

        doc.fillColor(darkColor)
          .fontSize(isFirstPage ? 10 : 8.5)
          .font('Helvetica')
          .text(
            isFirstPage ? displayTitle : `${displayTitle} (Continuación)`,
            margin + 14,
            margin + (isFirstPage ? 26 : 21),
          );

        const dateStr = formatDateMadrid(new Date());
        doc.fillColor(grayColor)
          .fontSize(7.5)
          .text(`Expedido: ${dateStr}`, margin + printableWidth - 180, margin + 10, {
            align: 'right',
            width: 170,
          });

        if (isFirstPage && filterInfo) {
          doc.fontSize(7.5)
            .fillColor(grayColor)
            .text(`Filtros: ${filterInfo}`, margin + 14, margin + 41, { width: printableWidth - 28 });
        }
      };

      // 1. Header primera página
      drawHeader(true);

      // 2. Tarjetas Resumen KPIs
      let startY = margin + 64;
      const cardWidth = (printableWidth - 30) / 4;

      const totalCount = items.length;
      const scheduledCount = items.filter((a) => a.status === 'scheduled').length;
      const completedCount = items.filter((a) => a.status === 'completed').length;
      const withAttachCount = items.filter((a) => a.patientAttachmentName).length;

      // Tarjeta Total
      doc.rect(margin, startY, cardWidth, 38).fill('#F3F4F6');
      doc.rect(margin, startY, cardWidth, 38).lineWidth(1).strokeColor('#E5E7EB').stroke();
      doc.fillColor('#374151').fontSize(7).font('Helvetica-Bold').text('TOTAL CITAS', margin + 8, startY + 6);
      doc.fillColor('#1F2937').fontSize(12).text(String(totalCount), margin + 8, startY + 18);

      // Tarjeta Programadas
      doc.rect(margin + cardWidth + 10, startY, cardWidth, 38).fill('#EFF6FF');
      doc.rect(margin + cardWidth + 10, startY, cardWidth, 38).lineWidth(1).strokeColor('#BFDBFE').stroke();
      doc.fillColor('#1E40AF').fontSize(7).font('Helvetica-Bold').text('PROGRAMADAS', margin + cardWidth + 18, startY + 6);
      doc.fillColor('#1D4ED8').fontSize(12).text(String(scheduledCount), margin + cardWidth + 18, startY + 18);

      // Tarjeta Completadas
      doc.rect(margin + (cardWidth + 10) * 2, startY, cardWidth, 38).fill('#ECFDF5');
      doc.rect(margin + (cardWidth + 10) * 2, startY, cardWidth, 38).lineWidth(1).strokeColor('#A7F3D0').stroke();
      doc.fillColor('#065F46').fontSize(7).font('Helvetica-Bold').text('COMPLETADAS', margin + (cardWidth + 10) * 2 + 8, startY + 6);
      doc.fillColor('#047857').fontSize(12).text(String(completedCount), margin + (cardWidth + 10) * 2 + 8, startY + 18);

      // Tarjeta Con Adjunto
      doc.rect(margin + (cardWidth + 10) * 3, startY, cardWidth, 38).fill('#FAF5FF');
      doc.rect(margin + (cardWidth + 10) * 3, startY, cardWidth, 38).lineWidth(1).strokeColor('#E9D5FF').stroke();
      doc.fillColor('#6B21A8').fontSize(7).font('Helvetica-Bold').text('CON ADJUNTO PACIENTE', margin + (cardWidth + 10) * 3 + 8, startY + 6);
      doc.fillColor('#7E22CE').fontSize(12).text(String(withAttachCount), margin + (cardWidth + 10) * 3 + 8, startY + 18);

      startY += 46;

      // 3. Estructura de Columnas (Total 770 pt):
      // Fecha: 95, Paciente: 115, Teléfono: 70, Servicio: 110, Modalidad: 60, Estado: 65, Precio: 55, Adjunto: 200
      const columns = [
        { title: 'FECHA Y HORA', width: 95, align: 'left' },
        { title: 'PACIENTE / ALUMNO', width: 115, align: 'left' },
        { title: 'TELÉFONO', width: 70, align: 'left' },
        { title: 'SERVICIO', width: 110, align: 'left' },
        { title: 'MODALIDAD', width: 60, align: 'left' },
        { title: 'ESTADO', width: 65, align: 'left' },
        { title: 'PRECIO', width: 55, align: 'right' },
        { title: 'DOC. ADJUNTO DEL PACIENTE', width: 200, align: 'left' },
      ];

      const drawTableHeader = (y: number) => {
        doc.rect(margin, y, printableWidth, 18).fill(primaryColor);
        let curX = margin;
        for (const col of columns) {
          doc.fillColor('#FFFFFF')
            .fontSize(7)
            .font('Helvetica-Bold')
            .text(col.title, curX + 4, y + 5, { width: col.width - 8, align: col.align as any });
          curX += col.width;
        }
      };

      drawTableHeader(startY);
      startY += 19;

      const rowHeight = 20;
      let currentY = startY;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (currentY + rowHeight > 540) {
          doc.addPage();
          drawHeader(false);
          currentY = margin + 42;
          drawTableHeader(currentY);
          currentY += 19;
        }

        const isEven = i % 2 === 0;
        doc.rect(margin, currentY, printableWidth, rowHeight).fill(isEven ? '#FFFFFF' : '#F9FAFB');
        doc.rect(margin, currentY, printableWidth, rowHeight).lineWidth(0.5).strokeColor(borderLineColor).stroke();

        const dtStr = `${formatDateOnlyMadrid(item.startsAt)} ${formatTimeMadrid(item.startsAt)}`;
        const priceNum = item.price ? parseFloat(item.price) : 0;
        const priceStr = `${(isNaN(priceNum) ? 0 : priceNum).toFixed(2)} €`;
        const hasAttach = Boolean(item.patientAttachmentName);
        const attachStr = hasAttach
          ? `📎 ${item.patientAttachmentName} (${formatBytes(item.patientAttachmentSize)})`
          : 'Sin adjuntos';

        let curX = margin;

        // Fecha
        doc.fillColor(darkColor).fontSize(7).font('Helvetica')
          .text(dtStr, curX + 4, currentY + 5, { width: 87, ellipsis: true });
        curX += 95;

        // Paciente
        doc.fillColor(darkColor).fontSize(7).font('Helvetica-Bold')
          .text(item.contact?.name || 'Sin asignar', curX + 4, currentY + 5, { width: 107, ellipsis: true });
        curX += 115;

        // Teléfono
        doc.fillColor(grayColor).fontSize(7).font('Helvetica')
          .text(item.contact?.phone || '-', curX + 4, currentY + 5, { width: 62, ellipsis: true });
        curX += 70;

        // Servicio
        doc.fillColor(darkColor).fontSize(7).font('Helvetica')
          .text(item.service || '-', curX + 4, currentY + 5, { width: 102, ellipsis: true });
        curX += 110;

        // Modalidad
        doc.fillColor(grayColor).fontSize(6.5).font('Helvetica')
          .text(formatModality(item.modality), curX + 4, currentY + 5, { width: 52, ellipsis: true });
        curX += 60;

        // Estado
        let statusColor = '#374151';
        if (item.status === 'scheduled') statusColor = '#1D4ED8';
        else if (item.status === 'completed') statusColor = '#059669';
        else if (item.status === 'cancelled') statusColor = '#DC2626';
        else if (item.status === 'pending_approval') statusColor = '#D97706';

        doc.fillColor(statusColor).fontSize(7).font('Helvetica-Bold')
          .text(formatAppointmentStatus(item.status), curX + 4, currentY + 5, { width: 57, ellipsis: true });
        curX += 65;

        // Precio
        doc.fillColor(darkColor).fontSize(7).font('Helvetica')
          .text(priceStr, curX + 4, currentY + 5, { width: 47, align: 'right' });
        curX += 55;

        // Adjunto paciente (NO clinical diagnosis!)
        doc.fillColor(hasAttach ? '#7C3AED' : '#9CA3AF').fontSize(6.8).font(hasAttach ? 'Helvetica-Bold' : 'Helvetica')
          .text(attachStr, curX + 4, currentY + 5, { width: 192, ellipsis: true });

        currentY += rowHeight;
      }

      // Numeración de páginas
      const range = doc.bufferedPageRange();
      for (let p = 0; p < range.count; p++) {
        doc.switchToPage(p);
        doc.fillColor('#9CA3AF')
          .fontSize(7)
          .font('Helvetica')
          .text(
            `Página ${p + 1} de ${range.count} · Centro de Yoga Salvadora Conesa (Documento Oficial)`,
            margin,
            595 - 24,
            { align: 'center', width: printableWidth },
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── 4. ZIP GENERATOR (REPORTS + PATIENT ATTACHMENT DOCUMENTS) ───────────────
export async function generateAppointmentsZip(
  items: Appointment[],
  filterInfo = '',
  reportTitle?: string,
): Promise<Buffer> {
  const baseName = cleanSafeFilename(reportTitle || 'Listado_Citas');
  const dateSuffix = new Date().toISOString().slice(0, 10);

  const [pdfBuf, xlsxBuf] = await Promise.all([
    generateAppointmentsPdf(items, filterInfo, reportTitle),
    generateAppointmentsXlsx(items, filterInfo, reportTitle),
  ]);
  const csvBuf = generateAppointmentsCsv(items, filterInfo, reportTitle);

  return new Promise((resolve, reject) => {
    const zip = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    zip.on('data', (c: Buffer) => chunks.push(c));
    zip.on('end', () => resolve(Buffer.concat(chunks)));
    zip.on('error', reject);

    // 1. Agregar los 3 informes al archivo ZIP
    zip.append(pdfBuf, { name: `${baseName}_${dateSuffix}.pdf` });
    zip.append(xlsxBuf, { name: `${baseName}_${dateSuffix}.xlsx` });
    zip.append(csvBuf, { name: `${baseName}_${dateSuffix}.csv` });

    // 2. Extraer y empaquetar los documentos adjuntos de los pacientes (si los hubiese)
    const seenNames = new Set<string>();
    let attachmentsCount = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      if (item.patientAttachmentData && Buffer.isBuffer(item.patientAttachmentData)) {
        attachmentsCount++;
        const datePart = item.startsAt
          ? new Date(item.startsAt).toISOString().slice(0, 10)
          : 'fecha';
        const contactPart = cleanSafeFilename(item.contact?.name || 'paciente');
        const rawFileName = item.patientAttachmentName || `adjunto_${idx + 1}`;
        let finalFileName = `${datePart}_${contactPart}_${cleanSafeFilename(rawFileName)}`;

        if (seenNames.has(finalFileName)) {
          finalFileName = `${datePart}_${contactPart}_${idx + 1}_${cleanSafeFilename(rawFileName)}`;
        }
        seenNames.add(finalFileName);

        zip.append(item.patientAttachmentData, {
          name: `adjuntos_pacientes/${finalFileName}`,
        });
      }
    }

    // Si no hubo adjuntos binarios, agregar un archivo informativo dentro del zip
    if (attachmentsCount === 0) {
      zip.append(
        Buffer.from(
          'Ninguna de las citas consultadas en este informe contenía documentos adjuntos del paciente subidos al sistema.',
          'utf-8',
        ),
        { name: 'adjuntos_pacientes/LEEME_SIN_ADJUNTOS.txt' },
      );
    }

    zip.finalize();
  });
}
