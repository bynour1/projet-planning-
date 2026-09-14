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

      // Footer on all pages
      const footerY = pageHeight - 8;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(14, footerY - 2.5, pageWidth - 14, footerY - 2.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${hookData.pageNumber}`, pageWidth - 14, footerY + 1.5, { align: 'right' });
    },
  });

  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function sanitizeForPDF(str) {
  if (!str) return '';
  return String(str)
    .replace(/🚗/g, '[Clino] ')
    .replace(/👨‍⚕️|👨‍⚕/g, '[Dr.] ')
    .replace(/🔧/g, '[Tech.] ')
    .replace(/📋|📅|⏰|📍|💬|🏢|🔍|🏷️|✉️|📱/g, '')
    .replace(/•/g, '-')
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDoctorName(nom = '', prenom = '') {
  let cleanNom = (nom || '').replace(/^dr\.?\s*/i, '').trim();
  let cleanPrenom = (prenom || '').replace(/^dr\.?\s*/i, '').trim();
  if (cleanPrenom && cleanNom.toLowerCase().startsWith(cleanPrenom.toLowerCase())) {
    cleanNom = cleanNom.slice(cleanPrenom.length).trim();
  }
  const parts = [cleanPrenom, cleanNom].filter(Boolean);
  return parts.join(' ').trim();
}

export function parseSafeDayInfo(day) {
  let dayKey = '';
  let dayNameDisplay = '';
  let dateDisplay = '';

  if (day instanceof Date) {
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const dateNum = String(day.getDate()).padStart(2, '0');
    dayKey = `${year}-${month}-${dateNum}`;
    const dayName = day.toLocaleDateString('fr-FR', { weekday: 'long' });
    dayNameDisplay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    dateDisplay = `${dateNum}/${month}`;
  } else {
    dayKey = String(day).slice(0, 10);
    const [y, m, d] = dayKey.split('-').map(Number);
    const safeDate = new Date(y, (m || 1) - 1, d || 1);
    const dayName = safeDate.toLocaleDateString('fr-FR', { weekday: 'long' });
    dayNameDisplay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    dateDisplay = safeDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  return { dayKey, dayNameDisplay, dateDisplay, label: `${dayNameDisplay}\n${dateDisplay}` };
}

function formatStaffHeaderName(d, isTechnician) {
  if (!d) return isTechnician ? 'TECHNICIEN' : 'MÉDECIN';
  if (isTechnician) {
    const p = (d.prenom || '').trim();
    const n = (d.nom || '').trim();
    const full = [p, n].filter(Boolean).join(' ');
    return (full || 'TECHNICIEN').toUpperCase();
  }
  const full = cleanDoctorName(d.nom, d.prenom);
  return full ? `DR. ${full.toUpperCase()}` : 'DR.';
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
    sanitizeForPDF(subtitle || (isTechnician ? 'Planning Technique Opérationnel - Techniciens & Jours de travail' : 'Planning Médical Opérationnel - Médecins & Jours de travail')),
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
  doc.text(sanitizeForPDF(title), pageWidth - 14, 15, { align: 'right' });

  // Columns: Jours / Dates + Staff names
  const allStaffColumns = activeStaff.map(d => sanitizeForPDF(formatStaffHeaderName(d, isTechnician)));
  if (hasUnassigned) {
    allStaffColumns.push(isTechnician ? 'SANS TECHNICIEN' : 'AUTRE / NON ASSIGNÉ');
  }

  const head = [['JOUR / DATE', ...allStaffColumns]];

  // Rows: each day in days
  const body = days.map(day => {
    const { dayKey, dayNameDisplay, dateDisplay } = parseSafeDayInfo(day);
    const dayFormatted = `${dayNameDisplay}\n${dateDisplay}`;

    const rowCells = [dayFormatted];

    activeStaff.forEach(staff => {
      const { pEvents = [], clEvents = [] } = eventGetter(staff, dayKey);
      const cellLines = [];
      pEvents.forEach(p => {
        const time = p.heure_debut ? `${p.heure_debut}${p.heure_fin ? '-' + p.heure_fin : ''}` : '';
        const clinoTag = (p.is_clino || p.clino_id) ? '[Clino] ' : '';
        const titlePart = p.titre || 'Visite';
        const locPart = p.adresse ? ` (${p.adresse})` : '';
        const counterpartPart = isTechnician
          ? (p.medecin_nom ? ` [Dr. ${cleanDoctorName(p.medecin_nom)}]` : '')
          : (p.technicien_nom ? ` [Tech. ${p.technicien_nom}]` : '');
        cellLines.push(sanitizeForPDF(`- ${time ? time + ' ' : ''}${clinoTag}${titlePart}${locPart}${counterpartPart}`));
      });
      clEvents.forEach(c => {
        const time = c.heure ? String(c.heure).slice(0, 5) : '';
        const addr = c.adresse || 'Tournée Clino';
        const counterpart = isTechnician
          ? ((c.medecin_full || c.medecin_nom) ? ` [Dr. ${cleanDoctorName(c.medecin_full || c.medecin_nom)}]` : '')
          : ((c.technicien_full || c.technicien_nom) ? ` [Tech. ${c.technicien_full || c.technicien_nom}]` : '');
        cellLines.push(sanitizeForPDF(`- [Clino] ${time ? time + ' ' : ''}${addr}${counterpart}`));
      });
      rowCells.push(cellLines.join('\n') || '-');
    });

    if (hasUnassigned) {
      const { pEvents = [], clEvents = [] } = eventGetter(null, dayKey);
      const cellLines = [];
      pEvents.forEach(p => cellLines.push(sanitizeForPDF(`- ${p.heure_debut ? p.heure_debut + ' ' : ''}${p.titre || 'Visite'}`)));
      clEvents.forEach(c => cellLines.push(sanitizeForPDF(`- [Clino] ${c.adresse || 'Tournée'}`)));
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
      fontSize: 7.6,
      cellPadding: 2.5,
      textColor: [15, 23, 42],
      lineColor: [148, 163, 184],
      lineWidth: 0.15,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: isTechnician ? [19, 78, 74] : [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    },
    didDrawPage: (hookData) => {
      const footerY = pageHeight - 6;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.line(8, footerY - 2, pageWidth - 8, footerY - 2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${hookData.pageNumber}`, pageWidth - 8, footerY + 1.5, { align: 'right' });
    }
  });

  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportMatrixToExcel({
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

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const allStaffColumns = activeStaff.map(d => formatStaffHeaderName(d, isTechnician));
  if (hasUnassigned) {
    allStaffColumns.push(isTechnician ? 'SANS TECHNICIEN' : 'AUTRE / NON ASSIGNÉ');
  }

  const aoa = [
    ["GROUPEMENT DE MÉDECINE DU TRAVAIL DE L'ARIANA"],
    [subtitle || (isTechnician ? 'Planning Technique Opérationnel - Techniciens & Jours de travail' : 'Planning Médical Opérationnel - Médecins & Jours de travail')],
    [`Date d'édition : ${dateStr} à ${timeStr} · ${title}`],
    [], // empty spacer
    ['JOUR / DATE', ...allStaffColumns]
  ];

  days.forEach(day => {
    const { dayKey, dayNameDisplay, dateDisplay } = parseSafeDayInfo(day);

    const row = [`${dayNameDisplay}\n${dateDisplay}`];

    activeStaff.forEach(staff => {
      const { pEvents = [], clEvents = [] } = eventGetter(staff, dayKey);
      const cellLines = [];
      pEvents.forEach(p => {
        const time = p.heure_debut ? `${p.heure_debut}${p.heure_fin ? '-' + p.heure_fin : ''} ` : '';
        const clinoTag = (p.is_clino || p.clino_id) ? '[Clino] ' : '';
        const titlePart = p.titre || 'Visite';
        const locPart = p.adresse ? ` (${p.adresse})` : '';
        const counterpartPart = isTechnician
          ? (p.medecin_nom ? ` [Dr. ${cleanDoctorName(p.medecin_nom)}]` : '')
          : (p.technicien_nom ? ` [Tech. ${p.technicien_nom}]` : '');
        cellLines.push(`• ${time}${clinoTag}${titlePart}${locPart}${counterpartPart}`);
      });
      clEvents.forEach(c => {
        const time = c.heure ? `${String(c.heure).slice(0, 5)} ` : '';
        const addr = c.adresse || 'Tournée Clino';
        const counterpart = isTechnician
          ? ((c.medecin_full || c.medecin_nom) ? ` [Dr. ${cleanDoctorName(c.medecin_full || c.medecin_nom)}]` : '')
          : ((c.technicien_full || c.technicien_nom) ? ` [Tech. ${c.technicien_full || c.technicien_nom}]` : '');
        cellLines.push(`• [Clino] ${time}${addr}${counterpart}`);
      });
      row.push(cellLines.join('\n') || '—');
    });

    if (hasUnassigned) {
      const { pEvents = [], clEvents = [] } = eventGetter(null, dayKey);
      const cellLines = [];
      pEvents.forEach(p => cellLines.push(`• ${p.heure_debut ? p.heure_debut + ' ' : ''}${p.titre || 'Visite'}`));
      clEvents.forEach(c => cellLines.push(`• [Clino] ${c.adresse || 'Tournée'}`));
      row.push(cellLines.join('\n') || '—');
    }

    aoa.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 20 }, ...allStaffColumns.map(() => ({ wch: 34 }))];
  ws['!pageSetup'] = { orientation: 'landscape', paperSize: 9 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planning');
  XLSX.writeFile(wb, `${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportMatrixToWord({
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

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const allStaffColumns = activeStaff.map(d => formatStaffHeaderName(d, isTechnician));
  if (hasUnassigned) {
    allStaffColumns.push(isTechnician ? 'SANS TECHNICIEN' : 'AUTRE / NON ASSIGNÉ');
  }

  const tableHeaders = ['JOUR / DATE', ...allStaffColumns]
    .map(h => `<th style="background-color: ${isTechnician ? '#134e4a' : '#0f172a'}; color: #ffffff; padding: 8px 6px; border: 1px solid #334155; text-align: center; font-size: 8.5pt; font-weight: bold; text-transform: uppercase; vertical-align: middle;">${h}</th>`)
    .join('');

  const tableRows = days.map((day, idx) => {
    const { dayKey, dayNameDisplay, dateDisplay } = parseSafeDayInfo(day);

    const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const dayCell = `
      <td style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 4px; text-align: center; vertical-align: middle; width: 90px;">
        <div style="font-weight: 800; color: #0f172a; font-size: 9pt; text-transform: capitalize;">${dayNameDisplay}</div>
        <div style="font-size: 8pt; font-weight: 700; color: #0284c7; margin-top: 2px;">${dateDisplay}</div>
      </td>
    `;

    const staffCells = activeStaff.map(staff => {
      const { pEvents = [], clEvents = [] } = eventGetter(staff, dayKey);
      if (!pEvents.length && !clEvents.length) {
        return `<td style="border: 1px solid #cbd5e1; padding: 4px; vertical-align: middle; text-align: center; color: #94a3b8; font-size: 8.5pt; background-color: ${rowBg};">—</td>`;
      }

      const itemsHtml = [];
      pEvents.forEach(p => {
        const time = p.heure_debut ? `${p.heure_debut}${p.heure_fin ? '-' + p.heure_fin : ''}` : '';
        const clinoTag = (p.is_clino || p.clino_id) ? '<span style="background-color: #e0f2fe; color: #0369a1; padding: 1px 3px; font-size: 7pt; font-weight: bold; border-radius: 2px; margin-right: 2px;">🚗 Clino</span>' : '';
        const titlePart = p.titre || 'Visite';
        const locPart = p.adresse ? `<div style="font-size: 7.5pt; color: #0284c7; margin-top: 1px;">📍 ${p.adresse}</div>` : '';
        const counterpartPart = isTechnician
          ? (p.medecin_nom ? `<div style="font-size: 7.5pt; color: #059669; margin-top: 1px;">👨‍⚕️ Dr. ${cleanDoctorName(p.medecin_nom)}</div>` : '')
          : (p.technicien_nom ? `<div style="font-size: 7.5pt; color: #d97706; margin-top: 1px;">🔧 Tech. ${p.technicien_nom}</div>` : '');

        itemsHtml.push(`
          <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-left: 3px solid #0284c7; padding: 4px 5px; margin-bottom: 3px; text-align: left;">
            <div style="font-weight: bold; font-size: 8pt; color: #0f172a; line-height: 1.2;">
              ${time ? `<span style="color: #0284c7; margin-right: 2px;">⏰ ${time}</span>` : ''}
              ${clinoTag}
              <span>${titlePart}</span>
            </div>
            ${locPart}
            ${counterpartPart}
          </div>
        `);
      });

      clEvents.forEach(c => {
        const time = c.heure ? String(c.heure).slice(0, 5) : '';
        const addr = c.adresse || 'Tournée Clino';
        const counterpart = isTechnician
          ? ((c.medecin_full || c.medecin_nom) ? `<div style="font-size: 7.5pt; color: #059669; margin-top: 1px;">👨‍⚕️ Dr. ${cleanDoctorName(c.medecin_full || c.medecin_nom)}</div>` : '')
          : ((c.technicien_full || c.technicien_nom) ? `<div style="font-size: 7.5pt; color: #d97706; margin-top: 1px;">🔧 Tech. ${c.technicien_full || c.technicien_nom}</div>` : '');

        itemsHtml.push(`
          <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-left: 3px solid #10b981; padding: 4px 5px; margin-bottom: 3px; text-align: left;">
            <div style="font-weight: bold; font-size: 8pt; color: #0f172a; line-height: 1.2;">
              <span style="background-color: #ecfdf5; color: #059669; padding: 1px 3px; font-size: 7pt; font-weight: bold; border-radius: 2px; margin-right: 2px;">🚗 Clino</span>
              ${time ? `<span style="color: #059669; margin-right: 2px;">⏰ ${time}</span>` : ''}
              <span>${addr}</span>
            </div>
            ${counterpart}
          </div>
        `);
      });

      return `<td style="border: 1px solid #cbd5e1; padding: 4px; vertical-align: top; background-color: ${rowBg};">${itemsHtml.join('')}</td>`;
    });

    let unassignedCell = '';
    if (hasUnassigned) {
      const { pEvents = [], clEvents = [] } = eventGetter(null, dayKey);
      if (!pEvents.length && !clEvents.length) {
        unassignedCell = `<td style="border: 1px solid #cbd5e1; padding: 4px; vertical-align: middle; text-align: center; color: #94a3b8; font-size: 8.5pt; background-color: ${rowBg};">—</td>`;
      } else {
        const itemsHtml = [];
        pEvents.forEach(p => itemsHtml.push(`<div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-left: 3px solid #64748b; padding: 3px 4px; margin-bottom: 3px; font-size: 7.5pt;">${p.heure_debut ? '[' + p.heure_debut + '] ' : ''}${p.titre || 'Visite'}</div>`));
        clEvents.forEach(c => itemsHtml.push(`<div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-left: 3px solid #64748b; padding: 3px 4px; margin-bottom: 3px; font-size: 7.5pt;">[Clino] ${c.adresse || 'Tournée'}</div>`));
        unassignedCell = `<td style="border: 1px solid #cbd5e1; padding: 4px; vertical-align: top; background-color: ${rowBg};">${itemsHtml.join('')}</td>`;
      }
    }

    return `<tr>${dayCell}${staffCells.join('')}${unassignedCell}</tr>`;
  }).join('');

  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page Section1 {
          size: 29.7cm 21.0cm;
          margin: 0.8cm 0.8cm 0.8cm 0.8cm;
          mso-page-orientation: landscape;
        }
        div.Section1 { page: Section1; }
        body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; background-color: #ffffff; font-size: 8.5pt; }
        table.matrix-table { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
        table.matrix-table th, table.matrix-table td { word-wrap: break-word; overflow-wrap: break-word; }
      </style>
    </head>
    <body>
      <div class="Section1">
        <!-- TOP HEADER BAR (Navy) -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; background-color: #0f172a; border-bottom: 3px solid ${isTechnician ? '#0d9488' : '#0284c7'};">
          <tr>
            <td style="padding: 10px 14px; text-align: left; vertical-align: middle;">
              <div style="font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11pt; font-weight: bold; color: #ffffff; letter-spacing: 0.5px;">GROUPEMENT DE MÉDECINE DU TRAVAIL DE L'ARIANA</div>
              <div style="font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 8pt; color: ${isTechnician ? '#99f6e4' : '#bae6fd'}; margin-top: 2px;">${subtitle || (isTechnician ? 'Planning Technique Opérationnel - Techniciens & Jours de travail' : 'Planning Médical Opérationnel - Médecins & Jours de travail')}</div>
            </td>
            <td style="padding: 10px 14px; text-align: right; vertical-align: middle;">
              <div style="font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 7.5pt; color: #e2e8f0;">Date d'édition : ${dateStr} à ${timeStr}</div>
              <div style="font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 7.5pt; font-weight: bold; color: #ffffff; margin-top: 2px;">${title}</div>
            </td>
          </tr>
        </table>

        <!-- MAIN MATRIX TABLE -->
        <table class="matrix-table" border="1" style="border-collapse: collapse; width: 100%; border: 1px solid #cbd5e1;">
          <thead>
            <tr>${tableHeaders}</tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
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

