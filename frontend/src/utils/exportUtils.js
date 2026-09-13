import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export function exportToPDF(data, columns, title = 'Planning GMT Ariana') {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Top header bar (Navy)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Accent line under header (Cyan)
  doc.setFillColor(2, 132, 199); // sky-600
  doc.rect(0, 22, pageWidth, 1.2, 'F');

  // Brand Header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text("GROUPEMENT DE MEDECINE DU TRAVAIL DE L'ARIANA", 14, 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(186, 230, 253); // sky-200
  doc.text('GMT Ariana - Planning des Interventions & Tournees Clino Mobile', 14, 16.5);

  // Metadata block (Right aligned)
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240); // slate-200
  doc.text(`Date d'edition : ${dateStr} a ${timeStr}`, pageWidth - 14, 9.5, { align: 'right' });
  doc.text(`Total : ${data.length} intervention${data.length > 1 ? 's' : ''}`, pageWidth - 14, 16.5, { align: 'right' });

  // Sub-header title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(String(title).toUpperCase(), 14, 29);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Document officiel d\'organisation interne et de planification operationnelle', pageWidth - 14, 29, { align: 'right' });

  // AutoTable
  autoTable(doc, {
    head: [columns.map(c => String(c.header).toUpperCase())],
    body: data.map(row => columns.map(c => {
      const val = row[c.key];
      if (val === undefined || val === null || val === '') return '-';
      return String(val);
    })),
    startY: 33,
    margin: { left: 14, right: 14, top: 22, bottom: 16 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 62, fontStyle: 'bold' },
      3: { cellWidth: 45 },
      4: { cellWidth: 42 },
      5: { cellWidth: 52 },
    },
    didDrawPage: (hookData) => {
      // Header for page > 1
      if (hookData.pageNumber > 1) {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 11, 'F');
        doc.setFillColor(2, 132, 199);
        doc.rect(0, 11, pageWidth, 0.8, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text("GMT Ariana - Planning des Interventions & Tournees Clino Mobile", 14, 7.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(186, 230, 253);
        doc.text(`Page ${hookData.pageNumber}`, pageWidth - 14, 7.5, { align: 'right' });
      }

      // Professional Footer on all pages
      const footerY = pageHeight - 8;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(14, footerY - 2.5, pageWidth - 14, footerY - 2.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("Groupement de Medecine du Travail de l'Ariana - Usage Interne", 14, footerY + 1.5);

      doc.text("Document Confidentiel - Soumis au secret professionnel", pageWidth / 2, footerY + 1.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${hookData.pageNumber}`, pageWidth - 14, footerY + 1.5, { align: 'right' });
    },
  });

  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportMatrixToPDF({
  days,
  doctorsList,
  staffList,
  staffRole = 'medecin',
  hasUnassigned,
  getDoctorEvents,
  getStaffEvents,
  title = 'Planning GMT Ariana',
  subtitle = '',
}) {
  const activeStaff = staffList || doctorsList || [];
  const eventGetter = getStaffEvents || getDoctorEvents || (() => ({ pEvents: [], clEvents: [] }));
  const isTechnician = staffRole === 'technicien';

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Top header bar (Navy)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 20, 'F');

  // Accent line under header (Cyan/Emerald)
  doc.setFillColor(isTechnician ? 13 : 2, isTechnician ? 148 : 132, isTechnician ? 136 : 199);
  doc.rect(0, 20, pageWidth, 1.2, 'F');

  // Brand Header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text("GROUPEMENT DE MEDECINE DU TRAVAIL DE L'ARIANA", 14, 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(186, 230, 253);
  doc.text(
    subtitle || (isTechnician ? 'Planning Technique Opérationnel - Techniciens & Jours de travail' : 'Planning Médical Opérationnel - Médecins & Jours de travail'),
    14,
    15
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Date d'édition : ${dateStr} à ${timeStr}`, pageWidth - 14, 8, { align: 'right' });
  doc.text(`${title}`, pageWidth - 14, 15, { align: 'right' });

  // Columns: Jours / Dates + Staff names
  const allStaffColumns = activeStaff.map(d => {
    if (isTechnician) {
      const name = d.nom ? (d.prenom ? `${d.prenom} ${d.nom}` : d.nom) : 'Technicien';
      return name.toUpperCase();
    }
    const name = d.nom ? (d.prenom ? `Dr. ${d.prenom} ${d.nom}` : (d.nom.startsWith('Dr.') ? d.nom : `Dr. ${d.nom}`)) : 'Dr.';
    return name.toUpperCase();
  });
  if (hasUnassigned) {
    allStaffColumns.push(isTechnician ? 'SANS TECHNICIEN' : 'AUTRE / NON ASSIGNÉ');
  }

  const head = [['JOUR / DATE', ...allStaffColumns]];

  // Rows: each day in days
  const body = days.map(day => {
    const dayKey = typeof day === 'string' ? day : (day.toISOString ? day.toISOString().slice(0, 10) : String(day));
    let dayFormatted = dayKey;
    try {
      const parsed = new Date(dayKey + 'T00:00:00');
      const dayName = parsed.toLocaleDateString('fr-FR', { weekday: 'long' });
      const capDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      dayFormatted = `${capDayName}\n${parsed.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`;
    } catch {
      dayFormatted = dayKey;
    }

    const rowCells = [dayFormatted];

    activeStaff.forEach(staff => {
      const { pEvents = [], clEvents = [] } = eventGetter(staff, dayKey);
      const cellLines = [];
      pEvents.forEach(p => {
        const time = p.heure_debut ? `${p.heure_debut}${p.heure_fin ? '-' + p.heure_fin : ''}` : '';
        const clinoTag = (p.is_clino || p.clino_id) ? '[🚗 Clino] ' : '';
        const titlePart = p.titre || 'Visite';
        const locPart = p.adresse ? ` (${p.adresse})` : '';
        const counterpartPart = isTechnician
          ? (p.medecin_nom ? ` [👨‍⚕️ ${p.medecin_nom}]` : '')
          : (p.technicien_nom ? ` [🔧 ${p.technicien_nom}]` : '');
        cellLines.push(`• ${time ? time + ' ' : ''}${clinoTag}${titlePart}${locPart}${counterpartPart}`);
      });
      clEvents.forEach(c => {
        const time = c.heure ? String(c.heure).slice(0, 5) : '';
        const addr = c.adresse || 'Tournée Clino';
        const counterpart = isTechnician
          ? ((c.medecin_full || c.medecin_nom) ? ` [👨‍⚕️ ${c.medecin_full || c.medecin_nom}]` : '')
          : ((c.technicien_full || c.technicien_nom) ? ` [🔧 ${c.technicien_full || c.technicien_nom}]` : '');
        cellLines.push(`• [🚗 Clino] ${time ? time + ' ' : ''}${addr}${counterpart}`);
      });
      rowCells.push(cellLines.join('\n') || '-');
    });

    if (hasUnassigned) {
      const { pEvents = [], clEvents = [] } = eventGetter(null, dayKey);
      const cellLines = [];
      pEvents.forEach(p => cellLines.push(`• ${p.heure_debut ? p.heure_debut + ' ' : ''}${p.titre || 'Visite'}`));
      clEvents.forEach(c => cellLines.push(`• [🚗 Clino] ${c.adresse || 'Tournée'}`));
      rowCells.push(cellLines.join('\n') || '-');
    }

    return rowCells;
  });

  autoTable(doc, {
    head,
    body,
    startY: 25,
    margin: { left: 8, right: 8, top: 22, bottom: 12 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 6.8,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.1,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: isTechnician ? [19, 78, 74] : [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 7.2,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 26, fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    },
    didDrawPage: (hookData) => {
      const footerY = pageHeight - 6;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(8, footerY - 2, pageWidth - 8, footerY - 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Groupement de Medecine du Travail de l'Ariana - Usage Interne Confidentiel", 8, footerY + 1.5);
      doc.text(`Page ${hookData.pageNumber}`, pageWidth - 8, footerY + 1.5, { align: 'right' });
    }
  });

  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportToExcel(data, columns, filename) {
  const ws = XLSX.utils.json_to_sheet(data.map(row => {
    const obj = {};
    columns.forEach(c => { obj[c.header] = row[c.key] || ''; });
    return obj;
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Données');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportToWord(data, columns, title = 'Document GMT Ariana') {
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const tableHeaders = columns.map(c => `<th style="background-color: #0f172a; color: #ffffff; padding: 8px 10px; border: 1px solid #cbd5e1; text-align: left; font-size: 11px;">${c.header}</th>`).join('');
  const tableRows = data.map((row, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const cells = columns.map(c => {
      const val = row[c.key] !== undefined && row[c.key] !== null && row[c.key] !== '' ? row[c.key] : '—';
      return `<td style="padding: 7px 10px; border: 1px solid #cbd5e1; font-size: 10.5px; color: #334155;">${val}</td>`;
    }).join('');
    return `<tr style="background-color: ${bg};">${cells}</tr>`;
  }).join('');

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <style>
        body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; margin: 24px; color: #1e293b; line-height: 1.4; }
        .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px; }
        h1 { color: #0f172a; font-size: 16pt; margin: 0 0 4px 0; font-weight: bold; }
        .subtitle { color: #0284c7; font-size: 11pt; font-weight: bold; margin: 0 0 6px 0; }
        .meta { font-size: 9pt; color: #64748b; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        .footer { margin-top: 24px; font-size: 8pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>GROUPEMENT DE MÉDECINE DU TRAVAIL DE L'ARIANA</h1>
        <div class="subtitle">${title}</div>
        <div class="meta">Date d'édition : ${dateStr} à ${timeStr} · Total enregistrements : <strong>${data.length}</strong></div>
      </div>
      <table>
        <thead><tr>${tableHeaders}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">
        Document Confidentiel — Groupement de Médecine du Travail de l'Ariana · Usage Interne Professionnel
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GMT Ariana//Planning Medical//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:GMT Ariana Planning',
  ];
  const nowStr = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  events.forEach((ev, idx) => {
    const rawDate = ev.date ? String(ev.date).slice(0, 10) : '';
    const dateStr = rawDate.replace(/-/g, '');
    if (!dateStr) return;

    const hStart = ev.heure_debut || (ev.heure ? String(ev.heure).slice(0, 5) : '08:00');
    const hEnd   = ev.heure_fin || hStart;
    const start  = `${dateStr}T${hStart.replace(':', '').slice(0, 4)}00`;
    const end    = `${dateStr}T${hEnd.replace(':', '').slice(0, 4)}00`;
    const typeLabel = ev.type_label || (ev._t === 'cl' ? '🚗 Clino Mobile' : '📋 Programme');
    const summary = `${typeLabel} - ${ev.titre || ev.adresse || 'Intervention'}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:gmt-${ev._t || 'ev'}-${ev.id || idx}@ariana`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${summary.replace(/[\r\n]/g, ' ')}`,
      ev.adresse && ev.adresse !== '—' ? `LOCATION:${ev.adresse.replace(/[\r\n]/g, ' ')}` : '',
      `DESCRIPTION:Type: ${typeLabel} \\nMedecin: ${ev.medecin_nom || 'Non assigné'} \\nTechnicien: ${ev.technicien_nom || 'Non assigné'}${ev.commentaire ? ' \\nNote: ' + ev.commentaire : ''}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GMT_Ariana_Planning_${new Date().toISOString().slice(0, 10)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarLink(event) {
  const base = 'https://calendar.google.com/calendar/r/eventedit?';
  const d = (event.date || '').replace(/-/g, '');
  const hStart = event.heure_debut || (event.heure ? String(event.heure).slice(0, 5) : '08:00');
  const hEnd = event.heure_fin || hStart;
  const start = `${d}T${hStart.replace(':', '').slice(0, 4)}00`;
  const end = `${d}T${hEnd.replace(':', '').slice(0, 4)}00`;
  const typeLabel = event.type_label || (event._t === 'cl' ? '🚗 Clino Mobile' : '📋 Programme');
  const params = new URLSearchParams({
    text: `${typeLabel} - ${event.titre || event.adresse || 'Intervention GMT Ariana'}`,
    dates: `${start}/${end}`,
    details: `Médecin: ${event.medecin_nom || event.medecin_full || 'Non assigné'} | Technicien: ${event.technicien_nom || event.technicien_full || 'Non assigné'}${event.commentaire ? ' | Note: ' + event.commentaire : ''}`,
    location: event.adresse || '',
  });
  return base + params.toString();
}

