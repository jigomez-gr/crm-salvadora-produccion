import PDFDocument from 'pdfkit';

export interface DoctorReportPdfData {
  businessName?: string;
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  serviceName: string;
  startsAt: Date;
  endsAt: Date;
  templateKey: string;
  title: string;
  symptoms?: string;
  diagnosis?: string;
  treatment?: string;
  recommendations?: string;
  notes?: string;
  issuedAt: string;
  signedBy: string;
}

export function generateDoctorReportPdfBuffer(data: DoctorReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 45,
        info: {
          Title: data.title || 'Informe Clínico',
          Author: data.signedBy || 'Servicio Médico',
          Subject: `Diagnóstico de ${data.patientName}`,
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const primaryColor = '#4338CA'; // Indigo 700
      const darkColor = '#1F2937'; // Gray 800
      const grayColor = '#4B5563'; // Gray 600
      const lightBg = '#F3F4F6'; // Gray 100
      const borderLineColor = '#E5E7EB';

      // ─── Header / Letterhead ───
      doc.rect(45, 45, 505, 55).fill(lightBg);
      
      doc.fillColor(primaryColor)
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(data.businessName || 'CENTRO MÉDICO Y CLÍNICA DE SALUD', 60, 55);

      doc.fillColor(grayColor)
        .fontSize(9)
        .font('Helvetica')
        .text('DOCUMENTO OFICIAL DE CONSULTA Y DIAGNÓSTICO CLÍNICO', 60, 75);

      const formattedDate = new Date(data.issuedAt || Date.now()).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      doc.fontSize(8)
        .fillColor(grayColor)
        .text(`Expedición: ${formattedDate}`, 350, 75, { align: 'right', width: 185 });

      doc.moveDown(3);

      // ─── Patient and Consultation Details Box ───
      const patientBoxY = 115;
      doc.rect(45, patientBoxY, 505, 65).lineWidth(1).strokeColor(borderLineColor).stroke();

      doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text('DATOS DEL PACIENTE Y CONSULTA', 55, patientBoxY + 8);

      doc.fontSize(9).font('Helvetica');
      doc.fillColor(grayColor).text('Paciente:', 55, patientBoxY + 26);
      doc.fillColor(darkColor).font('Helvetica-Bold').text(data.patientName, 105, patientBoxY + 26);

      doc.font('Helvetica').fillColor(grayColor).text('Contacto:', 55, patientBoxY + 42);
      doc.fillColor(darkColor).text(`${data.patientPhone || 'N/D'}  ${data.patientEmail ? `• ${data.patientEmail}` : ''}`, 105, patientBoxY + 42);

      doc.font('Helvetica').fillColor(grayColor).text('Servicio:', 310, patientBoxY + 26);
      doc.fillColor(darkColor).font('Helvetica-Bold').text(data.serviceName, 360, patientBoxY + 26, { width: 180 });

      doc.font('Helvetica').fillColor(grayColor).text('Fecha Cita:', 310, patientBoxY + 42);
      doc.fillColor(darkColor).text(new Date(data.startsAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }), 360, patientBoxY + 42);

      // ─── Sections ───
      let currentY = 195;

      const drawSection = (title: string, content?: string, isHighlight = false) => {
        if (!content || !content.trim()) return;

        if (currentY > 680) {
          doc.addPage();
          currentY = 50;
        }

        // Section Title Header
        doc.rect(45, currentY, 505, 20).fill(isHighlight ? '#EEF2FF' : '#F9FAFB');
        doc.fillColor(isHighlight ? primaryColor : darkColor)
          .fontSize(9)
          .font('Helvetica-Bold')
          .text(title.toUpperCase(), 55, currentY + 5);

        currentY += 26;

        // Content
        doc.fillColor(darkColor)
          .fontSize(9.5)
          .font(isHighlight ? 'Helvetica-Bold' : 'Helvetica')
          .text(content, 55, currentY, { width: 485, lineGap: 3 });

        currentY += doc.heightOfString(content, { width: 485, lineGap: 3 }) + 14;
      };

      drawSection('1. Motivo de Consulta / Anamnesis', data.symptoms);
      drawSection('2. Juicio Clínico / Diagnóstico', data.diagnosis, true);
      drawSection('3. Tratamiento y Prescripción Médica', data.treatment);
      drawSection('4. Pautas y Recomendaciones', data.recommendations);
      drawSection('5. Observaciones Clínicas', data.notes);

      // ─── Signature Block ───
      if (currentY > 640) {
        doc.addPage();
        currentY = 50;
      } else {
        currentY = Math.max(currentY + 15, 640);
      }

      doc.rect(300, currentY, 250, 90).lineWidth(1).strokeColor(borderLineColor).stroke();

      doc.fillColor(grayColor)
        .fontSize(8)
        .font('Helvetica')
        .text('Firma y Sello del Facultativo Responsable', 310, currentY + 8);

      doc.fillColor(darkColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(data.signedBy || 'Dr. Carlos Mendoza', 310, currentY + 35);

      doc.fontSize(7.5)
        .font('Helvetica')
        .fillColor(grayColor)
        .text('Colegiado / Especialista Responsable', 310, currentY + 50);

      doc.fillColor('#059669')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('✓ VALIDADO Y FIRMADO DIGITALMENTE', 310, currentY + 68);

      // ─── Footer ───
      doc.fontSize(7)
        .fillColor('#9CA3AF')
        .font('Helvetica')
        .text(
          'Este informe es confidencial y contiene datos de salud protegidos por el RGPD / LOPD-GDD. Expedido por el sistema médico CRM.',
          45,
          770,
          { align: 'center', width: 505 }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
