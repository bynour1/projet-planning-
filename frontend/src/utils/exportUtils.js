import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export function exportToPDF(data, columns, title) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(`GMT Ariana — ${new Date().toLocaleDateString('fr-FR')}`, 14, 22);
  autoTable(doc, {
    head: [columns.map(c => c.header)],
    body: data.map(row => columns.map(c => row[c.key] || '')),
    startY: 28,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 58, 138] },
  });
  doc.save(`${title.replace(/[^a-z0-9]/gi,'_')}_${new Date().toISOString().slice(0,10)}.pdf`);
}

export function exportToExcel(data, columns, filename) {
  const ws = XLSX.utils.json_to_sheet(data.map(row => {
    const obj = {};
    columns.forEach(c => { obj[c.header] = row[c.key] || ''; });
    return obj;
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Données');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

export function exportToICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GMT Ariana//Planning Medical//FR',
    'CALSCALE:GREGORIAN',
  ];
  events.forEach(ev => {
    const dateStr = (ev.date || '').replace(/-/g,'');
    const start = ev.heure_debut ? `${dateStr}T${ev.heure_debut.replace(':','')}00` : dateStr;
    const end = ev.heure_fin ? `${dateStr}T${ev.heure_fin.replace(':','')}00` : dateStr;
    lines.push(
      'BEGIN:VEVENT',
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${ev.titre || 'Intervention GMT Ariana'}`,
      ev.adresse ? `LOCATION:${ev.adresse}` : '',
      `DESCRIPTION:Médecin: ${ev.medecin_nom||''} - Technicien: ${ev.technicien_nom||''}`,
      `UID:gmt-${ev.id}@ariana`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GMT_Ariana_Planning_${new Date().toISOString().slice(0,10)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function googleCalendarLink(event) {
  const base = 'https://calendar.google.com/calendar/r/eventedit?';
  const d = (event.date||'').replace(/-/g,'');
  const start = event.heure_debut ? `${d}T${event.heure_debut.replace(':','')}00` : d;
  const end = event.heure_fin ? `${d}T${event.heure_fin.replace(':','')}00` : d;
  const params = new URLSearchParams({
    text: event.titre || 'Intervention GMT Ariana',
    dates: `${start}/${end}`,
    details: `Médecin: ${event.medecin_nom||''} | Technicien: ${event.technicien_nom||''}`,
    location: event.adresse || '',
  });
  return base + params.toString();
}
