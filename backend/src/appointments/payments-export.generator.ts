import PDFDocument from 'pdfkit';
import * as ExcelJS from 'exceljs';
import { Appointment } from '../common/entities/appointment.entity';

export interface PaymentsSummaryData {
  totalCount: number;
  paidCount: number;
  pendingCount: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
}

function formatCurrency(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

function formatDateMadrid(d?: Date | string | null): string {
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

function formatPaymentStatus(status?: string | null): string {
  switch (status) {
    case 'paid':
      return 'Pagado';
    case 'pending':
      return 'Pendiente';
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

function formatPaymentMethod(method?: string | null): string {
  switch (method) {
    case 'cash':
      return 'Efectivo (en mano)';
    case 'bizum':
      return 'Bizum';
    case 'card_in_person':
      return 'Tarjeta (TPV centro)';
    case 'stripe':
      return 'Stripe Online';
    case 'transfer':
      return 'Transferencia';
    case 'other':
      return 'Otro';
    default:
      return '-';
  }
}

function sanitizeCsv(value: any): string {
  let s = String(value ?? '').trim();
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";,\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Genera el archivo CSV con BOM UTF-8 y separador punto y coma (estándar para Excel en español).
 */
export function generatePaymentsCsv(
  items: Appointment[],
  summary: PaymentsSummaryData,
  filterInfo = '',
  reportTitle?: string,
): Buffer {
  const lines: string[] = [];

  // BOM para que Excel en Windows/Mac abra los caracteres españoles sin corromper tildes
  const BOM = '\uFEFF';

  // Metadatos iniciales
  const headerTitle = reportTitle
    ? `CENTRO DE YOGA SALVADORA CONESA - ${reportTitle.toUpperCase()}`
    : `CENTRO DE YOGA SALVADORA CONESA - INFORME DE COBROS Y CITAS`;
  lines.push(headerTitle);
  if (filterInfo) lines.push(`Filtros: ${sanitizeCsv(filterInfo)}`);
  lines.push(
    `Resumen: Total Cobrado=${formatCurrency(summary.totalPaidAmount)} (${summary.paidCount} citas) | Pendiente=${formatCurrency(summary.totalPendingAmount)} (${summary.pendingCount} citas) | Total=${summary.totalCount} citas`,
  );
  lines.push('');

  // Encabezados
  const headers = [
    'Alumno / Contacto',
    'Teléfono',
    'Email',
    'Servicio / Actividad',
    'Fecha Cita',
    'Importe (€)',
    'Estado de Pago',
    'Método de Pago',
    'Fecha Cobro',
    'Registrado Por',
    'Notas de Cobro',
  ];
  lines.push(headers.map(sanitizeCsv).join(';'));

  // Filas
  for (const item of items) {
    const contactName = item.contact?.name || 'Sin contacto';
    const contactPhone = item.contact?.phone || '';
    const contactEmail = item.contact?.email || '';
    const serviceName = item.service || '-';
    const startsAt = formatDateMadrid(item.startsAt);
    const priceNum = item.price ? parseFloat(item.price) : 0;
    const paidNum = item.paidAmount ? parseFloat(item.paidAmount) : priceNum;
    const finalAmount = item.paymentStatus === 'paid' ? paidNum : priceNum;
    const amountStr = (isNaN(finalAmount) ? 0 : finalAmount).toFixed(2).replace('.', ',');
    const statusStr = formatPaymentStatus(item.paymentStatus);
    const methodStr = formatPaymentMethod(item.paymentMethod);
    const paidAtStr = formatDateMadrid(item.paidAt);
    const recordedBy = item.paymentRecordedBy || '';
    const notes = item.paymentNotes || item.notes || '';

    const row = [
      contactName,
      contactPhone,
      contactEmail,
      serviceName,
      startsAt,
      amountStr,
      statusStr,
      methodStr,
      paidAtStr,
      recordedBy,
      notes,
    ];
    lines.push(row.map(sanitizeCsv).join(';'));
  }

  // Fila final de totales
  lines.push('');
  lines.push(
    [
      'TOTALES',
      '',
      '',
      '',
      `${summary.totalCount} citas`,
      summary.totalPaidAmount.toFixed(2).replace('.', ','),
      `Cobrado: ${formatCurrency(summary.totalPaidAmount)}`,
      `Pendiente: ${formatCurrency(summary.totalPendingAmount)}`,
      '',
      '',
      '',
    ]
      .map(sanitizeCsv)
      .join(';'),
  );

  return Buffer.from(BOM + lines.join('\r\n'), 'utf8');
}

/**
 * Genera el archivo Excel (.xlsx) nativo con formato visual profesional y estilos corporativos.
 */
export async function generatePaymentsXlsx(
  items: Appointment[],
  summary: PaymentsSummaryData,
  filterInfo = '',
  reportTitle?: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Centro de Yoga Salvadora Conesa';
  workbook.lastModifiedBy = 'Centro de Yoga Salvadora Conesa CRM';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Cobros y Citas', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ state: 'frozen', ySplit: 7 }],
  });

  // 1. Título principal corporativo
  worksheet.mergeCells('A1:K1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = reportTitle
    ? `CENTRO DE YOGA SALVADORA CONESA - ${reportTitle.toUpperCase()}`
    : 'CENTRO DE YOGA SALVADORA CONESA - PAGOS Y COBROS DE CITAS';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF800020' }, // Granate corporativo #800020
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // 2. Subtítulo / Filtros
  worksheet.mergeCells('A2:K2');
  const subCell = worksheet.getCell('A2');
  subCell.value = `Filtros aplicados: ${filterInfo || 'Periodo completo'} · Generado el ${formatDateMadrid(new Date())}`;
  subCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF4B5563' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 18;

  // 3. Fila de tarjetas de resumen
  worksheet.mergeCells('A4:C4');
  const kpiPaid = worksheet.getCell('A4');
  kpiPaid.value = `TOTAL COBRADO: ${formatCurrency(summary.totalPaidAmount)} (${summary.paidCount} citas)`;
  kpiPaid.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF065F46' } };
  kpiPaid.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  kpiPaid.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('E4:G4');
  const kpiPending = worksheet.getCell('E4');
  kpiPending.value = `PENDIENTE DE COBRO: ${formatCurrency(summary.totalPendingAmount)} (${summary.pendingCount} citas)`;
  kpiPending.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF92400E' } };
  kpiPending.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  kpiPending.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells('I4:K4');
  const kpiTotal = worksheet.getCell('I4');
  kpiTotal.value = `CITAS FILTRADAS: ${summary.totalCount} citas`;
  kpiTotal.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F2937' } };
  kpiTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  kpiTotal.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(4).height = 24;

  // 4. Encabezados de tabla
  const headerRowIdx = 7;
  const headers = [
    { header: 'Alumno / Contacto', key: 'name', width: 26 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Servicio / Actividad', key: 'service', width: 30 },
    { header: 'Fecha Cita', key: 'startsAt', width: 18 },
    { header: 'Importe (€)', key: 'amount', width: 14 },
    { header: 'Estado Pago', key: 'status', width: 16 },
    { header: 'Método Pago', key: 'method', width: 22 },
    { header: 'Fecha Cobro', key: 'paidAt', width: 18 },
    { header: 'Registrado Por', key: 'recordedBy', width: 20 },
    { header: 'Notas', key: 'notes', width: 32 },
  ];

  worksheet.columns = headers;
  const headerRow = worksheet.getRow(headerRowIdx);
  headerRow.height = 24;

  headers.forEach((h, colIdx) => {
    const cell = headerRow.getCell(colIdx + 1);
    cell.value = h.header;
    cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B36' } };
    cell.alignment = { vertical: 'middle', horizontal: colIdx === 5 ? 'right' : 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF800020' } },
      bottom: { style: 'medium', color: { argb: 'FF800020' } },
    };
  });

  // 5. Filas de datos
  let currentRowIdx = 8;
  for (const item of items) {
    const priceNum = item.price ? parseFloat(item.price) : 0;
    const paidNum = item.paidAmount ? parseFloat(item.paidAmount) : priceNum;
    const finalAmount = item.paymentStatus === 'paid' ? paidNum : priceNum;
    const isPaid = item.paymentStatus === 'paid';
    const isExempt = item.paymentStatus === 'exempt';

    const row = worksheet.getRow(currentRowIdx);
    row.height = 20;

    row.getCell(1).value = item.contact?.name || 'Sin contacto';
    row.getCell(2).value = item.contact?.phone || '-';
    row.getCell(3).value = item.contact?.email || '-';
    row.getCell(4).value = item.service || '-';
    row.getCell(5).value = formatDateMadrid(item.startsAt);
    
    // Importe numérico
    const amountCell = row.getCell(6);
    amountCell.value = isNaN(finalAmount) ? 0 : finalAmount;
    amountCell.numFmt = '#,##0.00 "€"';
    amountCell.alignment = { horizontal: 'right' };

    row.getCell(7).value = formatPaymentStatus(item.paymentStatus);
    row.getCell(8).value = formatPaymentMethod(item.paymentMethod);
    row.getCell(9).value = formatDateMadrid(item.paidAt);
    row.getCell(10).value = item.paymentRecordedBy || '-';
    row.getCell(11).value = item.paymentNotes || item.notes || '-';

    // Colores y fuentes de fila
    const isEven = currentRowIdx % 2 === 0;
    const bgColor = isEven ? 'FFF9FAFB' : 'FFFFFFFF';

    for (let c = 1; c <= 11; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 9 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      if (c === 7) {
        // Estado con color
        cell.font = { name: 'Arial', size: 9, bold: true };
        if (isPaid) cell.font.color = { argb: 'FF059669' };
        else if (isExempt) cell.font.color = { argb: 'FF4B5563' };
        else cell.font.color = { argb: 'FFD97706' };
      }
      if (!cell.fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      }
    }

    currentRowIdx++;
  }

  // 6. Fila de Total final
  const totalRow = worksheet.getRow(currentRowIdx);
  totalRow.height = 26;
  totalRow.getCell(1).value = 'TOTALES GENERALES';
  totalRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F2937' } };
  totalRow.getCell(4).value = `${summary.totalCount} citas`;
  totalRow.getCell(4).font = { name: 'Arial', size: 9.5, bold: true };
  
  const totalAmountCell = totalRow.getCell(6);
  totalAmountCell.value = summary.totalPaidAmount;
  totalAmountCell.numFmt = '#,##0.00 "€"';
  totalAmountCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF065F46' } };
  totalAmountCell.alignment = { horizontal: 'right' };

  totalRow.getCell(7).value = `Cobrado: ${formatCurrency(summary.totalPaidAmount)}`;
  totalRow.getCell(8).value = `Pendiente: ${formatCurrency(summary.totalPendingAmount)}`;

  for (let c = 1; c <= 11; c++) {
    const cell = totalRow.getCell(c);
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF800020' } },
      bottom: { style: 'double', color: { argb: 'FF800020' } },
    };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  }

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(rawBuffer);
}

/**
 * Genera el archivo PDF oficial en A4 apaisado (Landscape), con diseño ejecutivo,
 * cabecera del Centro de Yoga Salvadora Conesa, resumen financiero y tabla detallada.
 */
export function generatePaymentsPdf(
  items: Appointment[],
  summary: PaymentsSummaryData,
  filterInfo = '',
  reportTitle?: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const displayTitle = reportTitle
        ? reportTitle.toUpperCase()
        : 'INFORME OFICIAL DE COBROS Y CITAS REGISTRADAS';

      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape', // 842 × 595 puntos
        margin: 36,
        bufferPages: true,
        info: {
          Title: `${displayTitle} - Centro de Yoga Salvadora Conesa`,
          Author: 'Salvadora Conesa',
          Subject: 'Informe oficial de pagos de alumnos y citas',
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

      const primaryColor = '#800020'; // Granate
      const darkColor = '#1F2937';
      const grayColor = '#4B5563';
      const borderLineColor = '#E5E7EB';

      // Función para pintar la cabecera en cada página
      const drawHeader = (isFirstPage: boolean) => {
        // Barra superior
        doc.rect(margin, margin, printableWidth, isFirstPage ? 60 : 36).fill('#FAF9F6');
        doc.rect(margin, margin, 6, isFirstPage ? 60 : 36).fill(primaryColor);

        doc.fillColor(primaryColor)
          .fontSize(isFirstPage ? 14 : 11)
          .font('Helvetica-Bold')
          .text('CENTRO DE YOGA SALVADORA CONESA · FUENLABRADA', margin + 16, margin + 10);

        doc.fillColor(darkColor)
          .fontSize(isFirstPage ? 10 : 8.5)
          .font('Helvetica')
          .text(
            isFirstPage
              ? displayTitle
              : `${displayTitle} (Continuación)`,
            margin + 16,
            margin + (isFirstPage ? 28 : 22),
          );

        const dateStr = formatDateMadrid(new Date());
        doc.fillColor(grayColor)
          .fontSize(7.5)
          .text(`Expedido: ${dateStr}`, margin + printableWidth - 180, margin + 12, {
            align: 'right',
            width: 170,
          });

        if (isFirstPage && filterInfo) {
          doc.fontSize(7.5)
            .fillColor(grayColor)
            .text(`Filtros: ${filterInfo}`, margin + 16, margin + 44, { width: printableWidth - 32 });
        }
      };

      // 1. Dibujar Cabecera Primera Página
      drawHeader(true);

      // 2. Tarjetas de Resumen (KPIs) en la primera página
      let startY = margin + 70;

      // Caja Cobrado
      const cardWidth = (printableWidth - 20) / 3;
      doc.rect(margin, startY, cardWidth, 42).fill('#ECFDF5');
      doc.rect(margin, startY, cardWidth, 42).lineWidth(1).strokeColor('#A7F3D0').stroke();
      doc.fillColor('#065F46').fontSize(7.5).font('Helvetica-Bold').text('TOTAL COBRADO', margin + 10, startY + 8);
      doc.fillColor('#047857').fontSize(13).text(formatCurrency(summary.totalPaidAmount), margin + 10, startY + 20);
      doc.fontSize(7).font('Helvetica').text(`(${summary.paidCount} citas cobradas)`, margin + 120, startY + 24);

      // Caja Pendiente
      doc.rect(margin + cardWidth + 10, startY, cardWidth, 42).fill('#FFFBEB');
      doc.rect(margin + cardWidth + 10, startY, cardWidth, 42).lineWidth(1).strokeColor('#FDE68A').stroke();
      doc.fillColor('#92400E').fontSize(7.5).font('Helvetica-Bold').text('PENDIENTE DE COBRO', margin + cardWidth + 20, startY + 8);
      doc.fillColor('#B45309').fontSize(13).text(formatCurrency(summary.totalPendingAmount), margin + cardWidth + 20, startY + 20);
      doc.fontSize(7).font('Helvetica').text(`(${summary.pendingCount} citas pendientes)`, margin + cardWidth + 140, startY + 24);

      // Caja Total Citas
      doc.rect(margin + (cardWidth + 10) * 2, startY, cardWidth, 42).fill('#F3F4F6');
      doc.rect(margin + (cardWidth + 10) * 2, startY, cardWidth, 42).lineWidth(1).strokeColor('#E5E7EB').stroke();
      doc.fillColor('#374151').fontSize(7.5).font('Helvetica-Bold').text('CITAS SELECCIONADAS', margin + (cardWidth + 10) * 2 + 10, startY + 8);
      doc.fillColor('#1F2937').fontSize(13).text(String(summary.totalCount), margin + (cardWidth + 10) * 2 + 10, startY + 20);
      doc.fontSize(7).font('Helvetica').text('citas en el periodo', margin + (cardWidth + 10) * 2 + 50, startY + 24);

      startY += 52;

      // 3. Estructura de Columnas de la Tabla
      // Total 770 pt:
      // Alumno: 125, Teléfono: 65, Servicio: 135, Fecha Cita: 90, Importe: 55, Estado: 65, Método: 85, Notas: 150
      const columns = [
        { title: 'ALUMNO / CONTACTO', width: 125, align: 'left' },
        { title: 'TELÉFONO', width: 65, align: 'left' },
        { title: 'SERVICIO / ACTIVIDAD', width: 135, align: 'left' },
        { title: 'FECHA CITA', width: 90, align: 'left' },
        { title: 'IMPORTE', width: 55, align: 'right' },
        { title: 'ESTADO', width: 65, align: 'left' },
        { title: 'MÉTODO COBRO', width: 85, align: 'left' },
        { title: 'REGISTRADO / NOTAS', width: 150, align: 'left' },
      ];

      const drawTableHeader = (y: number) => {
        doc.rect(margin, y, printableWidth, 18).fill(primaryColor);
        let curX = margin;
        for (const col of columns) {
          doc.fillColor('#FFFFFF')
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .text(col.title, curX + 4, y + 5, { width: col.width - 8, align: col.align as any });
          curX += col.width;
        }
      };

      drawTableHeader(startY);
      startY += 19;

      // 4. Filas de datos
      const rowHeight = 20;
      let currentY = startY;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Comprobar si cabe en la página actual o hace falta salto
        if (currentY + rowHeight > 540) {
          doc.addPage();
          drawHeader(false);
          currentY = margin + 45;
          drawTableHeader(currentY);
          currentY += 19;
        }

        const isEven = i % 2 === 0;
        doc.rect(margin, currentY, printableWidth, rowHeight).fill(isEven ? '#FFFFFF' : '#F9FAFB');
        doc.rect(margin, currentY, printableWidth, rowHeight).lineWidth(0.5).strokeColor(borderLineColor).stroke();

        const priceNum = item.price ? parseFloat(item.price) : 0;
        const paidNum = item.paidAmount ? parseFloat(item.paidAmount) : priceNum;
        const finalAmount = item.paymentStatus === 'paid' ? paidNum : priceNum;
        const amountStr = `${(isNaN(finalAmount) ? 0 : finalAmount).toFixed(2)} €`;

        let curX = margin;

        // Alumno
        doc.fillColor(darkColor).fontSize(7.5).font('Helvetica-Bold')
          .text(item.contact?.name || 'Sin contacto', curX + 4, currentY + 5, {
            width: columns[0].width - 8,
            ellipsis: true,
          });
        curX += columns[0].width;

        // Teléfono
        doc.fillColor(grayColor).fontSize(7).font('Helvetica')
          .text(item.contact?.phone || '-', curX + 2, currentY + 5, {
            width: columns[1].width - 4,
            ellipsis: true,
          });
        curX += columns[1].width;

        // Servicio
        doc.fillColor(darkColor).fontSize(7.5).font('Helvetica')
          .text(item.service || '-', curX + 4, currentY + 5, {
            width: columns[2].width - 8,
            ellipsis: true,
          });
        curX += columns[2].width;

        // Fecha Cita
        doc.fillColor(grayColor).fontSize(7).font('Helvetica')
          .text(formatDateMadrid(item.startsAt), curX + 4, currentY + 5, {
            width: columns[3].width - 8,
          });
        curX += columns[3].width;

        // Importe
        doc.fillColor(darkColor).fontSize(7.5).font('Helvetica-Bold')
          .text(amountStr, curX + 4, currentY + 5, {
            width: columns[4].width - 8,
            align: 'right',
          });
        curX += columns[4].width;

        // Estado
        const statusLabel = formatPaymentStatus(item.paymentStatus);
        const statusColor = item.paymentStatus === 'paid' ? '#047857' : item.paymentStatus === 'exempt' ? '#4B5563' : '#B45309';
        doc.fillColor(statusColor).fontSize(7).font('Helvetica-Bold')
          .text(statusLabel, curX + 4, currentY + 5, {
            width: columns[5].width - 8,
          });
        curX += columns[5].width;

        // Método
        doc.fillColor(grayColor).fontSize(7).font('Helvetica')
          .text(formatPaymentMethod(item.paymentMethod), curX + 4, currentY + 5, {
            width: columns[6].width - 8,
            ellipsis: true,
          });
        curX += columns[6].width;

        // Notas / Registrado
        const noteText = [item.paymentRecordedBy ? `[${item.paymentRecordedBy}]` : '', item.paymentNotes || item.notes || '']
          .filter(Boolean)
          .join(' ');
        doc.fillColor(grayColor).fontSize(6.5).font('Helvetica')
          .text(noteText || '-', curX + 4, currentY + 5, {
            width: columns[7].width - 8,
            ellipsis: true,
          });

        currentY += rowHeight;
      }

      // Fila final de totales si cabe, si no siguiente página
      if (currentY + 22 > 540) {
        doc.addPage();
        drawHeader(false);
        currentY = margin + 45;
      }

      doc.rect(margin, currentY, printableWidth, 22).fill('#F3F4F6');
      doc.rect(margin, currentY, printableWidth, 22).lineWidth(1).strokeColor(primaryColor).stroke();

      doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold')
        .text('TOTALES COBRADOS Y CITAS:', margin + 10, currentY + 7);

      doc.fillColor(darkColor).fontSize(8).font('Helvetica-Bold')
        .text(`${summary.totalCount} citas`, margin + 125 + 65, currentY + 7);

      doc.fillColor('#047857').fontSize(8.5).font('Helvetica-Bold')
        .text(formatCurrency(summary.totalPaidAmount), margin + 125 + 65 + 135 + 90, currentY + 7, {
          width: 55,
          align: 'right',
        });

      doc.fillColor(grayColor).fontSize(7.5).font('Helvetica')
        .text(`Cobrado: ${formatCurrency(summary.totalPaidAmount)}  |  Pendiente: ${formatCurrency(summary.totalPendingAmount)}`, margin + 475, currentY + 7);

      // Numeración de páginas en el pie de página
      const pages = doc.bufferedPageRange();
      for (let p = 0; p < pages.count; p++) {
        doc.switchToPage(p);
        doc.fontSize(7).fillColor('#9CA3AF').font('Helvetica')
          .text(
            `Página ${p + 1} de ${pages.count} · Centro de Yoga Salvadora Conesa (Calle Pelayos, 1 · Fuenlabrada) · CRM Oficial`,
            margin,
            560,
            { align: 'center', width: printableWidth },
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
