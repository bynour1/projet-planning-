import * as XLSX from 'xlsx';

/**
 * Génère et déclenche le téléchargement d'un modèle Excel (.xlsx)
 * avec les colonnes attendues et des exemples concrets d'entreprises conventionnées.
 */
export function downloadEntreprisesTemplate() {
  const sampleData = [
    {
      'Nom Entreprise *': 'Société Industrielle du Nord',
      'Secteur': 'Industrie & Plasturgie',
      'Conventionné (Oui/Non)': 'Oui',
      'Date Début Convention': '2026-01-01',
      'Date Fin Convention': '2026-12-31',
      'Renouvelable (Oui/Non)': 'Oui',
      'Effectif Total': 120,
      'Visites Faites': 45,
      'Bilans Faits': 40,
      'Bilans Manquants': 5,
      'Téléphone': '71 234 567',
      'Email': 'contact@sind-nord.tn',
      'Adresse': 'Zone Industrielle Charguia II, Ariana',
      'Site Web': 'https://sind-nord.tn',
      'Description': 'Convention annuelle de médecine du travail - Visites périodiques',
    },
    {
      'Nom Entreprise *': 'Clinique Médicale Yasmine',
      'Secteur': 'Santé & Clinique',
      'Conventionné (Oui/Non)': 'Oui',
      'Date Début Convention': '2026-02-01',
      'Date Fin Convention': '2027-01-31',
      'Renouvelable (Oui/Non)': 'Oui',
      'Effectif Total': 85,
      'Visites Faites': 0,
      'Bilans Faits': 0,
      'Bilans Manquants': 0,
      'Téléphone': '70 888 999',
      'Email': 'rh@clinique-yasmine.tn',
      'Adresse': 'Avenue Habib Bourguiba, Ariana',
      'Site Web': '',
      'Description': 'Convention santé du personnel soignant et administratif',
    },
    {
      'Nom Entreprise *': 'Tech Solutions Maghreb',
      'Secteur': 'Informatique & Services',
      'Conventionné (Oui/Non)': 'Oui',
      'Date Début Convention': '2026-01-15',
      'Date Fin Convention': '2026-12-31',
      'Renouvelable (Oui/Non)': 'Oui',
      'Effectif Total': 42,
      'Visites Faites': 42,
      'Bilans Faits': 42,
      'Bilans Manquants': 0,
      'Téléphone': '71 999 111',
      'Email': 'admin@techsolutions.tn',
      'Adresse': 'Pôle Technologique El Ghazala, Ariana',
      'Site Web': 'https://techsolutions.tn',
      'Description': 'Tournée annuelle Clino Mobile complétée à 100%',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);

  // Largeur optimale des colonnes
  worksheet['!cols'] = [
    { wch: 30 }, // Nom
    { wch: 24 }, // Secteur
    { wch: 22 }, // Conventionné
    { wch: 22 }, // Date Début
    { wch: 20 }, // Date Fin
    { wch: 22 }, // Renouvelable
    { wch: 14 }, // Effectif
    { wch: 14 }, // Visites Faites
    { wch: 14 }, // Bilans Faits
    { wch: 16 }, // Bilans Manquants
    { wch: 16 }, // Téléphone
    { wch: 26 }, // Email
    { wch: 38 }, // Adresse
    { wch: 25 }, // Site Web
    { wch: 45 }, // Description
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Entreprises_Conventionnees');

  // Téléchargement
  XLSX.writeFile(workbook, 'Modele_Import_Entreprises_GMT_Ariana.xlsx');
}
