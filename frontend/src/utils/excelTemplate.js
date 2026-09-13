import * as XLSX from 'xlsx';

/**
 * Génère et déclenche le téléchargement d'un modèle Excel (.xlsx)
 * avec les colonnes exactes attendues :
 * CODE | SOCIETE | EFFEC | ADRESSE | TEL | ACTIVITE | DATE ADHESION
 */
export function downloadEntreprisesTemplate() {
  const sampleData = [
    {
      'CODE': 'ENT-001',
      'SOCIETE': 'Société Industrielle du Nord',
      'EFFEC': 120,
      'ADRESSE': 'Zone Industrielle Charguia II, Ariana',
      'TEL': '71 234 567',
      'ACTIVITE': 'Industrie & Plasturgie',
      'DATE ADHESION': '2026-01-01',
    },
    {
      'CODE': 'ENT-002',
      'SOCIETE': 'Clinique Médicale Yasmine',
      'EFFEC': 85,
      'ADRESSE': 'Avenue Habib Bourguiba, Ariana',
      'TEL': '70 888 999',
      'ACTIVITE': 'Santé & Clinique',
      'DATE ADHESION': '2026-02-01',
    },
    {
      'CODE': 'ENT-003',
      'SOCIETE': 'Tech Solutions Maghreb',
      'EFFEC': 42,
      'ADRESSE': 'Pôle Technologique El Ghazala, Ariana',
      'TEL': '71 999 111',
      'ACTIVITE': 'Informatique & Services',
      'DATE ADHESION': '2026-01-15',
    },
    {
      'CODE': 'ENT-004',
      'SOCIETE': 'Transport & Logistique Express',
      'EFFEC': 60,
      'ADRESSE': 'Avenue de la République, Ariana',
      'TEL': '71 555 444',
      'ACTIVITE': 'Transport & Logistique',
      'DATE ADHESION': '2026-03-01',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);

  // Largeur optimale des colonnes
  worksheet['!cols'] = [
    { wch: 14 }, // CODE
    { wch: 32 }, // SOCIETE
    { wch: 12 }, // EFFEC
    { wch: 40 }, // ADRESSE
    { wch: 18 }, // TEL
    { wch: 28 }, // ACTIVITE
    { wch: 18 }, // DATE ADHESION
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Entreprises_Adherentes');

  // Téléchargement
  XLSX.writeFile(workbook, 'Modele_Import_Entreprises_GMT_Ariana.xlsx');
}
