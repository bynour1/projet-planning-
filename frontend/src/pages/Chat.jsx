import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import AudioMessage from '../components/AudioMessage';
import ImageMessage from '../components/ImageMessage';
import CameraCaptureModal from '../components/CameraCaptureModal';
import LocationMessage from '../components/LocationMessage';

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function roleColor(role) {
  if (role === 'administrateur') return '#0ea5e9';
  if (role === 'medecin')        return '#10b981';
  return '#8b5cf6';
}
function roleBadge(role) {
  return { administrateur: 'Admin', medecin: 'Médecin', technicien: 'Tech.' }[role] || role;
}
function getInitials(nom) {
  return (nom || '').split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

async function downloadAndOpen(url, originalname, mimetype) {
  try {
    const res    = await axios.get(url, { responseType: 'blob' });
    const blob   = new Blob([res.data], { type: mimetype || res.data.type });
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    if (mimetype?.startsWith('image/') || mimetype === 'application/pdf') {
      a.target = '_blank'; a.rel = 'noreferrer';
    } else { a.download = originalname; }
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(blobUrl); document.body.removeChild(a); }, 2000);
  } catch { alert("Impossible d'ouvrir le fichier."); }
}

function formatMessageDate(dateStr) {
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (!d || isNaN(d.getTime())) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - msgDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return format(d, 'EEEE d MMMM', { locale: fr });
    return format(d, 'EEEE d MMMM yyyy', { locale: fr });
  } catch {
    return String(dateStr || '').slice(0, 10);
  }
}

function isDifferentDay(d1, d2) {
  if (!d1) return true;
  if (!d2) return false;
  try {
    return String(d1).slice(0, 10) !== String(d2).slice(0, 10);
  } catch {
    return true;
  }
}

/* ═══════════════════════════════════════════════════════
   IA — Simulateur médical intelligent (sans clé API)
═══════════════════════════════════════════════════════ */
const AI_RESPONSES = [
  // ─── Salutations ───
  {
    keywords: ['bonjour', 'salut', 'hello', 'bonsoir', 'coucou', 'salem', 'salam'],
    response: "Bonjour ! 👋 Je suis l'assistant IA médical de **GMT Ariana Santé au Travail**.\n\nJe peux vous assister en temps réel pour :\n• 💊 **Médicaments & Posologies** (Doliprane, Spasfon, Ibuprofène, etc.)\n• 📋 **Comptes-rendus & Fiches d'aptitude** médicales\n• 🩺 **Visites de médecine du travail** (embauche, périodique, reprise)\n• 🏢 **Entreprises conventionnées & suivi des effectifs**\n• 🚗 **Unité Clino Mobile & Examens** (ECG, visiotest, audiométrie)\n• 🚨 **Protocoles d'urgence et numéros SAMU (190)**\n\nComment puis-je vous aider aujourd'hui ?",
  },

  // ─── Médicaments spécifiques ───
  {
    keywords: ['doliprane', 'dolipranne', 'paracetamol', 'paracetamol', 'efferalgan', 'dafalgan', 'panadol', 'perfalgan'],
    response: "💊 **Doliprane (Paracétamol)** :\n\n• **Classe thérapeutique :** Antalgique (contre la douleur) et antipyrétique (contre la fièvre).\n• **Indications :** Soulage les douleurs légères à modérées (maux de tête, douleurs dentaires, courbatures, états grippaux, règles douloureuses) et fait baisser la fièvre.\n• **Posologie Adulte :**\n  - **500 mg à 1 g par prise**, à renouveler toutes les **4 à 6 heures** si nécessaire.\n  - **Dose maximale quotidienne :** Ne jamais dépasser **3 g par jour** (ou 4 g/jour uniquement sur avis médical formel).\n• **Précautions & Contre-indications :**\n  - ⚠️ Contre-indiqué en cas d'insuffisance hépatique sévère (maladie grave du foie) ou d'allergie au paracétamol.\n  - ⚠️ Risque grave de toxicité pour le foie en cas de surdosage.\n  - ⚠️ Ne pas cumuler avec d'autres médicaments contenant déjà du paracétamol (ex: Fervex, Actifed).",
  },
  {
    keywords: ['ibuprofene', 'ibuprofène', 'advil', 'nurofen', 'antarene', 'antarène', 'profenid', 'profénid', 'ketoprofene', 'kétoprofène', 'ains'],
    response: "💊 **Ibuprofène / AINS (Anti-inflammatoire non stéroïdien)** :\n\n• **Classe :** AINS, antalgique et antipyrétique.\n• **Indications :** Traitement des douleurs inflammatoires (articulaires, lombalgies, tendinites, céphalées, douleurs dentaires) et fièvre.\n• **Posologie Adulte :** 200 mg à 400 mg par prise **au cours d'un repas**, max 1200 mg par 24h. Espacez les prises d'au moins 6 heures.\n• **Contre-indications majeures :**\n  - ⚠️ Ulcère de l'estomac ou antécédent d'hémorragie digestive.\n  - ⚠️ Insuffisance rénale, hépatique ou cardiaque sévère.\n  - ⚠️ Grossesse (contre-indiqué formellement à partir du 6ème mois).\n  - ⚠️ Ne jamais associer deux AINS en même temps (ex: Ibuprofène + Aspirine ou Voltarène).",
  },
  {
    keywords: ['spasfon', 'phloroglucinol', 'spasme', 'maux de ventre', 'ventre'],
    response: "💊 **Spasfon (Phloroglucinol)** :\n\n• **Classe :** Antispasmodique musculotrope.\n• **Indications :** Traitement symptomatique des douleurs spasmodiques du tube digestif (maux de ventre, coliques), des voies biliaires et urinaires (coliques néphrétiques) et gynécologiques (règles douloureuses).\n• **Posologie Adulte :** 2 comprimés ou 2 lyocs par prise au moment des crises, jusqu'à 3 fois par jour (max 6 cp/jour).\n• **Tolérance :** Bien toléré, sans effet atropinique.",
  },
  {
    keywords: ['amoxicilline', 'amoxicilline', 'augmentin', 'clamoxyl', 'antibiotique', 'antibiotiques', 'infection'],
    response: "💊 **Amoxicilline / Augmentin (Antibiotique Bêta-lactamine)** :\n\n• **Classe :** Antibiotique de la famille des pénicillines.\n• **Indications :** Traitement des infections bactériennes confirmées (angines bactériennes, sinusites, otites, bronchites, infections dentaires et urinaires).\n• **Règles d'utilisation :**\n  - ⚠️ Inefficace contre les virus (grippe, rhume, bronchite virale simple).\n  - ⚠️ Prescription médicale stricte requise.\n  - ⚠️ Toujours terminer la durée complète prescrite même en cas d'amélioration rapide pour éviter les résistances bactériennes.\n  - ⚠️ Contre-indiqué en cas d'allergie connue aux pénicillines.",
  },
  {
    keywords: ['aspirine', 'aspegic', 'aspégic', 'kardegic', 'kardégic', 'acetylsalicylique'],
    response: "💊 **Aspirine (Acide acétylsalicylique)** :\n\n• **Classe :** AINS, antalgique, antipyrétique et antiagrégant plaquettaire.\n• **Indications :** Douleurs et fièvre (à dose antalgique 500mg-1g) ou prévention cardiovasculaire (à faible dose 75-160mg sous forme Kardégic).\n• **Précautions :** Risque de saignement, ulcère gastrique. Contre-indiqué en cas d'hémophilie ou d'ulcère évolutif.",
  },
  {
    keywords: ['solupred', 'prednisolone', 'cortancyl', 'corticoide', 'corticoïde', 'corticoides'],
    response: "💊 **Solupred / Prednisolone (Corticoïde par voie orale)** :\n\n• **Classe :** Anti-inflammatoire stéroïdien puissant.\n• **Indications :** Traitement des affections inflammatoires sévères (crises d'asthme, réactions allergiques aiguës, sinusites aiguës sévères, poussées articulaires).\n• **Conseils de prise :** À prendre le matin au petit-déjeuner pour respecter le rythme hormonal naturel et limiter les troubles du sommeil.",
  },
  {
    keywords: ['ventoline', 'salbutamol', 'asthme', 'bronchodilatateur'],
    response: "🫁 **Ventoline (Salbutamol)** :\n\n• **Classe :** Bronchodilatateur bêta-2 mimétique d'action rapide.\n• **Indications :** Traitement d'urgence des crises d'asthme et des épisodes de gêne respiratoire obstructive.\n• **Utilisation :** 1 à 2 bouffées par inhalation. En cas de crise sévère ne cédant pas sous 10 minutes, renouveler et appeler le SAMU (190).",
  },
  {
    keywords: ['medicament', 'médicament', 'traitement', 'ordonnance', 'posologie', 'dose'],
    response: "💊 **Guide Général des Médicaments Courants :**\n\n• **Anti-douleur / Fièvre :** Paracétamol (Doliprane) en 1ère intention (500mg-1g, max 3-4g/j).\n• **Anti-inflammatoire :** Ibuprofène (200-400mg au cours des repas).\n• **Antispasmodique :** Spasfon (2 cp par prise si douleurs abdominales).\n• **Antibiotiques / Corticoïdes :** Strictement sur prescription médicale.\n\n*N'hésitez pas à me demander des précisions sur un médicament spécifique (ex: Doliprane, Spasfon, Ibuprofène).* 🩺",
  },

  // ─── Médecine du Travail & Visites ───
  {
    keywords: ['compte-rendu', 'compte rendu', 'rapport', 'résumé', 'résumer', 'fiche', 'aptitude', 'inaptitude'],
    response: "Voici la structure standard d'une **Fiche d'Aptitude / Compte-rendu Médical du Travail** :\n\n**Fiche Médicale d'Aptitude**\n🏢 **Entreprise** : [Nom de l'entreprise conventionnée]\n👤 **Salarié** : [Nom & Prénom] — Poste : [Intitulé du poste]\n🩺 **Médecin examinateur** : [Dr. Nom]\n📅 **Date** : [Date du jour]\n\n**Type d'examen :**\n[ ] Visite d'embauche  [ ] Visite périodique  [ ] Visite de reprise  [ ] Visite spontanée\n\n**Examens complémentaires réalisés :**\n• Visiotest / Acuité visuelle : Normal\n• Audiométrie : Normal\n• ECG de repos : Sans anomalie\n• Bandelette urinaire : Négative\n\n**Conclusion Médicale :**\n✅ **APTE** au poste de travail sans restriction\n*(ou Apte avec aménagements / Inapte temporaire)*",
  },
  {
    keywords: ['visite', 'embauche', 'périodique', 'reprise', 'spontanée'],
    response: "📋 **Protocole des Visites Médicales du Travail** :\n\n1. **Visite d'embauche** : Obligatoire avant l'embauche ou avant la fin de la période d'essai pour vérifier l'adéquation au poste.\n2. **Visite périodique** : Surveillance annuelle ou biennale selon les risques professionnels (bruit, produits chimiques, travail de nuit).\n3. **Visite de reprise** : Après un arrêt de travail pour accident du travail ou maladie > 21 jours.\n4. **Visite occasionnelle / spontanée** : À la demande du salarié ou de l'employeur.",
  },
  {
    keywords: ['entreprise', 'convention', 'conventionné', 'conventionnée', 'société', 'adhérent', 'contrat'],
    response: "🏢 **Gestion des Entreprises Conventionnées** :\n\n• **Suivi des effectifs** : Planification des visites périodiques annuelles par groupe d'employés.\n• **Fiche d'entreprise** : Évaluation des risques professionnels et des postes à risque.\n• **Interventions sur site** : Déplacement de l'équipe médicale ou de l'unité mobile Clino sur les locaux de l'entreprise.\n• **Rapports annuels** : Synthèse d'activité remise à la direction de l'entreprise partenaire.",
  },
  {
    keywords: ['clino', 'camion', 'mobile', 'tournée', 'chauffeur'],
    response: "🚗 **Unité Médicale Clino Mobile** :\n\nL'unité mobile est équipée pour réaliser les examens sur site d'entreprise :\n• 👁️ **Visiotest** (acuité, champ visuel, vision des couleurs)\n• 👂 **Audiométrie en cabine insonorisée** (dépistage de surdité professionnelle)\n• ❤️ **Électrocardiogramme (ECG)**\n• 🫁 **Spirométrie / EFR** (capacité respiratoire)\n\n*Pensez à vérifier l'alimentation électrique et la stabilité du véhicule avant le début des consultations.*",
  },
  {
    keywords: ['ecg', 'visiotest', 'audiométrie', 'spirométrie', 'examen', 'audiometrie', 'radio'],
    response: "🩺 **Examens Complémentaires en Santé au Travail** :\n\n• **ECG** : Recommandé pour les postes de sécurité, chauffeurs, travaux en hauteur et surveillance cardiovasculaire.\n• **Audiogramme** : Indispensable pour exposition au bruit > 85 dB(A).\n• **Visiotest** : Contrôle vision de près/loin, phories et stéréoscopie (travail sur écran, conduite d'engins).\n• **Spirométrie** : Suivi des salariés exposés aux poussières, solvants, fumées.",
  },
  {
    keywords: ['planning', 'planification', 'agenda', 'rendez-vous', 'rdv', 'horaire', 'retard'],
    response: "📅 **Organisation Optimale du Planning Médical** :\n\n• **Durée standard** : 15 à 20 min par consultation de médecine du travail.\n• **Regroupement** : Programmer les visites d'une même entreprise sur des demi-journées dédiées pour limiter les temps d'attente.\n• **Tampon** : Prévoir 30 minutes de battement en milieu de matinée pour les urgences ou retards.\n• **Rappels** : Confirmer la liste des salariés 48h à l'avance avec le DRH de l'entreprise.",
  },

  // ─── Symptômes & Urgences ───
  {
    keywords: ['symptôme', 'symptomes', 'douleur', 'fièvre', 'toux', 'mal de tete', 'céphalée', 'tension', 'fatigue', 'malaise'],
    response: "⚠️ **Rappel Déontologique :** Informations à titre indicatif, ne remplace pas un examen clinique approfondi.\n\n🔍 **Signes d'alerte en milieu professionnel :**\n• **Douleur thoracique constrictive** → Risque coronarien aigu → SAMU 190\n• **Déficit neurologique brutal (AVC)** → FAST (Visage, Bras, Parole) → Urgence absolue 190\n• **Céphalée aiguë + HTA sévère** → Repos immédiat, prise de tension\n• **Malaise vagal / Hypoglycémie** → Allonger jambes surélevées, resucrage si conscient",
  },
  {
    keywords: ['urgence', 'urgences', 'samu', 'secours', '190', 'police', 'pompier', '198', '197', 'blessure', 'accident'],
    response: "🚨 **Numéros d'Urgence & Secours (Tunisie)** :\n\n• 🚑 **SAMU** : **190**\n• 🚒 **Protection Civile / Pompiers** : **198**\n• 🚓 **Police Secours** : **197**\n• 🏥 **Centre Anti-Poisons** : **71 335 500**\n• 🏥 **Urgences Ariana** : **71 715 000**\n\n**Protocole immédiat en cas d'accident sur site :**\n1. Protéger la victime et les témoins (supprimer le danger)\n2. Alerter le SAMU (190) en précisant la localisation exacte et l'état de conscience\n3. Secourir selon gestes de premiers secours (PLS si inconscient qui respire).",
  },
  {
    keywords: ['merci', 'thanks', 'parfait', 'super', 'excellent', 'bravo', 'top'],
    response: "Je vous en prie ! 😊 Toujours à votre disposition pour vous assister dans vos missions médicales et administratives. N'hésitez pas !",
  },
  {
    keywords: ['aide', 'help', 'que peux-tu', 'fonctionnalité', 'commandes', 'menu', 'quoi faire'],
    response: "🤖 **Guide de l'Assistant IA Médical :**\n\nVous pouvez me demander n'importe quand :\n\n• 💊 *« C'est quoi Doliprane ? »* ou *« Posologie Ibuprofène »*\n• 📋 *« Modèle de Fiche d'aptitude »* ou *« Compte-rendu »*\n• 🩺 *« Visite d'embauche »* ou *« Visite de reprise »*\n• 🏢 *« Entreprises conventionnées »*\n• 🚗 *« Clino Mobile et examens »* (ECG, audio, visiotest)\n• 🚨 *« Urgences et numéros SAMU »*\n• 📅 *« Optimisation planning »*\n\n💡 *Astuce : Vous pouvez aussi taper `@ia votre question` dans la zone de texte à tout moment !*",
  },
];

function normalizeStr(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAIResponse(question) {
  const normQ = normalizeStr(question);
  
  // 1. Direct match in keyword database
  for (const entry of AI_RESPONSES) {
    if (entry.keywords.some(k => {
      const normK = normalizeStr(k);
      return normQ.includes(normK) || (normK.length >= 4 && normQ.replace(/([a-z])\1+/g, '$1').includes(normK.replace(/([a-z])\1+/g, '$1')));
    })) {
      return entry.response;
    }
  }

  // 2. Intelligent dynamic fallback for questions about medications or symptoms
  if (normQ.includes('c est quoi') || normQ.includes('qu est ce que') || normQ.includes('a quoi sert') || normQ.includes('comment prendre') || normQ.includes('definition')) {
    const subject = question.replace(/(c'est quoi|qu'est-ce que|a quoi sert|comment prendre|définition de|definition de|parle moi de)\s*/gi, '').trim();
    return `ℹ️ **Information Médicale sur : ${subject || question}**\n\n• **Conseil :** Pour toute utilisation de médicament ou analyse d'un symptôme (${subject || 'terme recherché'}), veillez à vérifier la posologie adaptée auprès du médecin du travail ou de votre pharmacien.\n• **Règle générale :** Ne dépassez jamais les doses prescrites et signalez toute allergie ou antécédent médical.\n\n💡 Pour voir les fiches complètes déjà disponibles, demandez-moi : *Doliprane*, *Ibuprofène*, *Spasfon*, *Amoxicilline*, *Fiche d'aptitude*, *Clino Mobile*, ou tapez **"aide"**.`;
  }

  return `Je comprends votre question : "${question}"\n\nEn tant qu'assistant IA médical de **GMT Ariana**, je suis spécialisé en médecine du travail, pharmacologie courante (Doliprane, Ibuprofène, etc.), examens cliniques et protocoles d'entreprises conventionnées.\n\n💡 Essayez de me demander : *C'est quoi Doliprane ?*, *un modèle de compte-rendu*, *des informations sur une visite d'embauche*, ou tapez **"aide"** pour voir toutes mes capacités.`;
}

/* ═══════════════════════════════════════════════════════
   EMOJI REACTIONS
═══════════════════════════════════════════════════════ */
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🔥'];

/* ═══════════════════════════════════════════════════════
   FILE MESSAGE
═══════════════════════════════════════════════════════ */
function FileMessage({ content, isMine }) {
  const [loading, setLoading] = React.useState(false);
  let data = null;
  try { data = JSON.parse(content); } catch { return <span>{content}</span>; }
  if (!data || data.type !== 'file') return <span>{content}</span>;

  const isAudio = data.mimetype?.startsWith('audio/') || data.originalname?.endsWith('.webm') || data.originalname?.endsWith('.ogg') || data.originalname?.endsWith('.wav') || data.originalname?.endsWith('.mp3') || data.originalname?.endsWith('.m4a');
  const isImage = data.mimetype?.startsWith('image/') || data.originalname?.match(/\.(jpg|jpeg|png|gif|webp|heic)$/i);

  if (isAudio) {
    return <AudioMessage url={data.url} originalname={data.originalname} sizeDisplay={data.sizeDisplay} isMine={isMine} />;
  }

  if (isImage) {
    return <ImageMessage url={data.url} originalname={data.originalname} isMine={isMine} />;
  }

  async function handleOpen(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try { await downloadAndOpen(data.url, data.originalname, data.mimetype); }
    finally { setLoading(false); }
  }

  return (
    <div onClick={handleOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isMine ? 'rgba(255,255,255,.2)' : 'var(--surface2)', padding: '8px 12px', borderRadius: 8, border: isMine ? 'none' : '1px solid var(--border)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity .2s' }}>
      <span style={{ fontSize: 22 }}>{loading ? '⏳' : (data.icon || '📎')}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isMine ? '#fff' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{data.originalname}</div>
        <div style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,.7)' : 'var(--text-3)' }}>{data.sizeDisplay} · {loading ? 'Ouverture…' : 'Cliquer pour ouvrir'}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   RENDER MARKDOWN SIMPLE (pour réponses IA)
═══════════════════════════════════════════════════════ */
function MarkdownText({ text }) {
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.6 }}>
      {lines.map((line, i) => {
        const bold = line.replace(/\*\*(.+?)\*\*/g, (_, m) => `<strong>${m}</strong>`);
        if (line.startsWith('• ') || line.startsWith('- ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
              <span style={{ opacity: 0.6 }}>•</span>
              <span dangerouslySetInnerHTML={{ __html: bold.replace(/^[•\-] /, '') }} />
            </div>
          );
        }
        if (line === '') return <div key={i} style={{ height: 6 }} />;
        return <div key={i} dangerouslySetInnerHTML={{ __html: bold }} />;
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN CHAT COMPONENT
═══════════════════════════════════════════════════════ */
export default function Chat({ toast }) {
  const { user }                  = useAuth();
  const { emit, on, onlineUsers } = useSocket();
  const isAdmin = user?.role === 'administrateur';

  const [messages,    setMessages]    = useState([]);
  const [text,        setText]        = useState('');
  const [typingUsers, setTyping]      = useState([]);
  const [uploading,   setUploading]   = useState(false);
  const [uploadProg,  setUploadProg]  = useState(0);

  // IA
  const [aiMode,      setAiMode]      = useState(false);
  const [aiLoading,   setAiLoading]   = useState(false);

  // Réactions { msgId: { emoji: count } }
  const [reactions,   setReactions]   = useState({});
  // Hover sur un message pour afficher les options
  const [hoveredMsg,  setHoveredMsg]  = useState(null);

  // Reply
  const [replyTo,     setReplyTo]     = useState(null); // { id, nom, content }

  // Recherche
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen,  setSearchOpen]  = useState(false);

  // Message épinglé
  const [pinnedMsg,   setPinnedMsg]   = useState(null);

  // Emoji picker visible
  const [emojiPickerFor, setEmojiPickerFor] = useState(null);

  // Caméra, Vocal & Localisation
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isRecording,     setIsRecording]     = useState(false);
  const [recSeconds,      setRecSeconds]      = useState(0);
  const [locating,        setLocating]        = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const bottomRef         = useRef(null);
  const fileInputRef      = useRef(null);
  const cameraInputRef    = useRef(null);
  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const recTimerRef       = useRef(null);
  const typingTimer       = useRef(null);
  const inputRef          = useRef(null);

  /* ── Load history ── */
  useEffect(() => {
    axios.get('/api/chat/messages?limit=100')
      .then(r => setMessages(r.data))
      .catch(() => toast('Erreur chargement', 'error'));
  }, []);

  /* ── Socket events ── */
  useEffect(() => {
    const offNew  = on('new_message',     msg => setMessages(p => [...p, msg]));
    const offDel  = on('message_deleted', id  => setMessages(p => p.filter(m => m.id !== id)));
    const offType = on('user_typing', ({ userId, nom, isTyping }) => {
      if (userId === user?.id) return;
      setTyping(p => isTyping
        ? [...p.filter(u => u.userId !== userId), { userId, nom }]
        : p.filter(u => u.userId !== userId)
      );
    });
    return () => { offNew?.(); offDel?.(); offType?.(); };
  }, [on, user]);

  /* ── Auto scroll ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  /* ── Input ── */
  function handleInput(e) {
    setText(e.target.value);
    if (!aiMode) {
      emit('typing', true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => emit('typing', false), 1500);
    }
  }

  /* ── Envoyer ── */
  async function handleSend(e) {
    e?.preventDefault();
    if (!text.trim()) return;

    const raw = text.trim();
    const isAiTrigger = aiMode || /^(@ia|@ai|\/ia|\/ai|\/assistant)\b/i.test(raw);

    if (isAiTrigger) {
      const cleanQuestion = raw.replace(/^(@ia|@ai|\/ia|\/ai|\/assistant)\s*/i, '') || raw;
      // Message user dans le chat local
      const userMsg = {
        id: `local-${Date.now()}`,
        user_id: user?.id,
        nom: `${user?.prenom} ${user?.nom}`,
        role: user?.role,
        content: cleanQuestion,
        type: 'text',
        created_at: new Date().toISOString(),
        isLocal: true,
      };
      setMessages(p => [...p, userMsg]);
      setText('');
      setAiLoading(true);

      // Simuler un délai de réflexion IA
      setTimeout(() => {
        const answer = getAIResponse(cleanQuestion);
        const aiMsg = {
          id: `ai-${Date.now()}`,
          user_id: 'ai',
          nom: 'Assistant IA',
          role: 'ia',
          content: answer,
          type: 'text',
          created_at: new Date().toISOString(),
          isAI: true,
        };
        setMessages(p => [...p, aiMsg]);
        setAiLoading(false);
      }, 400);
      return;
    }

    // Message normal
    const payload = replyTo
      ? { content: raw, replyTo: { id: replyTo.id, nom: replyTo.nom, content: replyTo.content } }
      : { content: raw };

    emit('send_message', payload);
    emit('typing', false);
    setText('');
    setReplyTo(null);
    clearTimeout(typingTimer.current);
  }

  /* ── File / Media upload direct ── */
  async function uploadDirectFile(file, successLabel = 'Fichier envoyé') {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast('Fichier trop volumineux (max 15 Mo)', 'error'); return; }
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true); setUploadProg(0);
    try {
      await axios.post('/api/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => setUploadProg(Math.round((e.loaded * 100) / (e.total || 1))),
      });
      toast(`${successLabel} ✓`, 'success');
    } catch (err) {
      toast(err.response?.data?.message || "Erreur lors de l'envoi", 'error');
    } finally { setUploading(false); setUploadProg(0); }
  }

  /* ── File input change handler ── */
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await uploadDirectFile(file, `Fichier envoyé : ${file.name}`);
  }

  /* ── Caméra Capture Handler ── */
  async function handleCameraCapture(file) {
    await uploadDirectFile(file, 'Photo envoyée');
  }

  /* ── Voice Recording Logic ── */
  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => {
        setRecSeconds(s => s + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio recording error:', err);
      toast("Impossible d'accéder au microphone. Autorisez l'accès dans le navigateur.", 'error');
    }
  }

  function cancelVoiceRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    }
    clearInterval(recTimerRef.current);
    setIsRecording(false);
    setRecSeconds(0);
    audioChunksRef.current = [];
  }

  async function stopAndSendVoiceRecording() {
    if (!mediaRecorderRef.current) return;
    clearInterval(recTimerRef.current);

    mediaRecorderRef.current.onstop = async () => {
      const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([audioBlob], `vocal_${Date.now()}.${ext}`, { type: mimeType });

      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }

      setIsRecording(false);
      setRecSeconds(0);
      audioChunksRef.current = [];

      await uploadDirectFile(file, 'Message vocal envoyé');
    };

    mediaRecorderRef.current.stop();
  }

  /* ── Partager Position GPS ── */
  async function handleShareLocation() {
    if (!navigator.geolocation) {
      toast("La géolocalisation n'est pas supportée par votre navigateur", 'error');
      return;
    }
    setLocating(true);
    toast('Récupération de votre position GPS…', 'info');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        let address = '';
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
            headers: { 'Accept-Language': 'fr' }
          });
          const geoData = await res.json();
          address = geoData.display_name?.split(',').slice(0, 3).join(', ') || '';
        } catch {
          address = `Position GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        }

        const payload = {
          type: 'location',
          lat,
          lng,
          accuracy,
          address: address || `Coordonnées : ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          timestamp: new Date().toISOString(),
        };

        emit('send_message', {
          content: JSON.stringify(payload),
          type: 'location',
        });

        setLocating(false);
        toast('Position GPS partagée ✓', 'success');
      },
      (err) => {
        console.error('Geolocation error:', err);
        setLocating(false);
        toast("Impossible d'obtenir la position GPS. Vérifiez les autorisations de votre appareil.", 'error');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  }

  function handleDelete(id) { emit('delete_message', id); }

  /* ── Réaction emoji (Ajout / Retrait toggle) ── */
  function toggleReaction(msgId, emoji) {
    setReactions(prev => {
      const msgR = { ...(prev[msgId] || {}) };
      const currentCount = typeof msgR[emoji] === 'number' ? msgR[emoji] : 0;
      const isMine = msgR[`_me_${emoji}`] === true;

      if (isMine) {
        // Retirer ma réaction
        const newCount = currentCount - 1;
        if (newCount <= 0) {
          delete msgR[emoji];
        } else {
          msgR[emoji] = newCount;
        }
        delete msgR[`_me_${emoji}`];
      } else {
        // Ajouter ma réaction
        msgR[emoji] = currentCount + 1;
        msgR[`_me_${emoji}`] = true;
      }

      if (Object.keys(msgR).length === 0) {
        const copy = { ...prev };
        delete copy[msgId];
        return copy;
      }
      return { ...prev, [msgId]: msgR };
    });
    setEmojiPickerFor(null);
  }

  /* ── Copier message ── */
  function copyMessage(content) {
    let text = content;
    try {
      const d = JSON.parse(content);
      if (d?.type === 'file') text = d.originalname;
      else if (d?.type === 'location') text = d.address || `${d.lat}, ${d.lng}`;
    } catch {}
    navigator.clipboard.writeText(text).then(() => toast('Message copié !', 'success'));
  }

  /* ── Mobile panel state ── */
  const [showInfo, setShowInfo] = useState(false);

  /* ── Épingler message (admin) ── */
  function pinMessage(msg) {
    setPinnedMsg(pinnedMsg?.id === msg.id ? null : msg);
  }

  /* ── Filtrer messages ── */
  const filteredMessages = searchQuery.trim()
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const isMine = (msg) => msg.user_id === user?.id;

  /* ─────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────── */
  return (
    <div className="chat-container">

      {/* ══════════════════════════════════
          MAIN CHAT AREA
      ══════════════════════════════════ */}
      <div className="chat-main">

        {/* ── Executive Header ── */}
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          borderTop: '3px solid #0284c7',
          background: 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            boxShadow: '0 2px 8px rgba(2,132,199,0.25)',
            flexShrink: 0
          }}>
            💬
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>Chat Équipe</span>
              <span style={{
                background: '#10b98118',
                color: '#10b981',
                fontSize: 11,
                fontWeight: 700,
                padding: '1px 8px',
                borderRadius: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                {onlineUsers.length} en ligne
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
              Messagerie d'équipe sécurisée · Documents & Assistant Médical IA (@ia)
            </div>
          </div>
          {/* Bouton recherche */}
          <button
            type="button"
            title="Rechercher dans les messages"
            onClick={() => { setSearchOpen(o => !o); setSearchQuery(''); }}
            style={{ background: searchOpen ? 'var(--primary)' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: searchOpen ? '#fff' : 'var(--text-2)', fontSize: 13, transition: 'all .15s' }}
          >🔎</button>
          {/* Bouton Infos / Membres / IA sur mobile */}
          <button
            type="button"
            onClick={() => setShowInfo(o => !o)}
            className="btn btn-outline btn-sm"
            style={{ padding: '5px 9px', fontSize: 12, borderRadius: 8 }}
            title="Membres en ligne & Assistant IA"
          >
            {showInfo ? '✕' : '👥 Infos'}
          </button>
        </div>

        {/* ── Barre de recherche ── */}
        {searchOpen && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              autoFocus
              className="input"
              placeholder="Rechercher dans les messages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '6px 12px', fontSize: 13 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {searchQuery ? `${filteredMessages.length} résultat(s)` : ''}
            </span>
            <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ── Message épinglé ── */}
        {pinnedMsg && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg,#fef9c3,#fefce8)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📌</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>Message épinglé · {pinnedMsg.nom}</span>
              <div style={{ fontSize: 12, color: '#78350f', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pinnedMsg.content?.slice(0, 100)}
              </div>
            </div>
            {isAdmin && (
              <button type="button" onClick={() => setPinnedMsg(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 14 }}>✕</button>
            )}
          </div>
        )}

        {/* ── Messages ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filteredMessages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">{searchQuery ? '🔎' : '💬'}</div>
              <p>{searchQuery ? 'Aucun message trouvé' : 'Commencez la conversation'}</p>
            </div>
          )}

          {filteredMessages.map((msg, i) => {
            const mine       = isMine(msg);
            const color      = msg.isAI ? '#6366f1' : roleColor(msg.role);
            const prevMsg    = i > 0 ? filteredMessages[i - 1] : null;
            const isNewDay   = !prevMsg || isDifferentDay(msg.created_at, prevMsg.created_at);
            const showHeader = isNewDay || !prevMsg || prevMsg.user_id !== msg.user_id;
            const isFile     = msg.type === 'file';
            const isLocation = msg.type === 'location' || (typeof msg.content === 'string' && msg.content.includes('"type":"location"'));
            const msgRx      = reactions[msg.id] || {};
            const hasRx      = Object.keys(msgRx).length > 0;

            // Parse reply
            let replyData = null;
            try {
              const parsed = JSON.parse(msg.content);
              if (parsed?.replyTo) replyData = parsed.replyTo;
            } catch {}

            // Highlight si recherche
            const highlight = searchQuery && msg.content?.toLowerCase().includes(searchQuery.toLowerCase());

            return (
              <React.Fragment key={msg.id}>
                {/* Séparateur de date */}
                {isNewDay && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '16px 0 10px',
                    position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: '8%',
                      right: '8%',
                      height: 1,
                      background: 'var(--border)',
                      opacity: 0.7,
                    }} />
                    <span style={{
                      position: 'relative',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-2)',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 12px',
                      borderRadius: 16,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      textTransform: 'capitalize',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}>
                      📅 {formatMessageDate(msg.created_at)}
                    </span>
                  </div>
                )}

                <div
                  style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end', marginBottom: hasRx ? 20 : 4, position: 'relative', outline: highlight ? '2px solid #fbbf24' : 'none', borderRadius: 12, padding: highlight ? '2px 4px' : 0 }}
                  onMouseEnter={() => setHoveredMsg(msg.id)}
                  onMouseLeave={() => { setHoveredMsg(null); setEmojiPickerFor(null); }}
                >
                  {/* Avatar */}
                  {!mine && showHeader && (
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: color + '22', color, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {msg.isAI ? '🤖' : getInitials(msg.nom)}
                    </div>
                  )}
                  {!mine && !showHeader && <div style={{ width: 30, flexShrink: 0 }} />}

                  <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', gap: 2, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    {/* Nom */}
                    {showHeader && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color }}>
                          {msg.isAI ? '🤖 Assistant IA' : (mine ? 'Vous' : msg.nom)}
                        </span>
                        {!msg.isAI && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, background: color + '22', color }}>
                            {roleBadge(msg.role)}
                          </span>
                        )}
                        {msg.isAI && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, background: '#6366f122', color: '#6366f1' }}>
                            IA
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexDirection: mine ? 'row-reverse' : 'row' }}>
                      {/* Bulle */}
                      <div style={{
                        padding: (isFile || isLocation) ? '6px 8px' : '9px 13px',
                        borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: msg.isAI
                          ? 'linear-gradient(135deg,#6366f115,#8b5cf615)'
                          : mine ? 'var(--primary)' : 'var(--surface)',
                        color: mine && !msg.isAI ? '#fff' : 'var(--text)',
                        border: msg.isAI ? '1px solid #6366f130' : mine ? 'none' : '1px solid var(--border)',
                        fontSize: 14, lineHeight: 1.5, boxShadow: 'var(--shadow)', maxWidth: 340,
                      }}>
                        {/* Citation (reply) */}
                        {replyData && (
                          <div style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, marginBottom: 6, background: mine ? 'rgba(255,255,255,.2)' : 'var(--surface2)', borderLeft: '3px solid ' + (mine ? 'rgba(255,255,255,.5)' : 'var(--primary)'), color: mine ? 'rgba(255,255,255,.8)' : 'var(--text-2)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ↩ <strong>{replyData.nom}</strong> : {replyData.content?.slice(0, 60)}
                          </div>
                        )}

                        {/* Contenu */}
                        {isFile ? (
                          <FileMessage content={msg.content} isMine={mine} />
                        ) : isLocation ? (
                          <LocationMessage content={msg.content} isMine={mine} />
                        ) : msg.isAI ? (
                          <MarkdownText text={msg.content} />
                        ) : (replyData ? (
                          (() => {
                            try {
                              const p = JSON.parse(msg.content);
                              return p.text || msg.content;
                            } catch { return msg.content; }
                          })()
                        ) : msg.content)}
                      </div>

                      {/* Actions contextuelles au hover */}
                      {hoveredMsg === msg.id && (
                        <div style={{ display: 'flex', flexDirection: mine ? 'row' : 'row-reverse', gap: 2, alignItems: 'center', opacity: 1, transition: 'opacity .15s' }}>
                          {/* Emoji picker trigger */}
                          <button type="button" title="Réagir"
                            onClick={() => setEmojiPickerFor(p => p === msg.id ? null : msg.id)}
                            style={actionBtnStyle}>😀</button>
                          {/* Reply */}
                          {!msg.isAI && (
                            <button type="button" title="Répondre"
                              onClick={() => { setReplyTo({ id: msg.id, nom: msg.nom || 'Vous', content: msg.content }); inputRef.current?.focus(); }}
                              style={actionBtnStyle}>↩</button>
                          )}
                          {/* Copy */}
                          <button type="button" title="Copier"
                            onClick={() => copyMessage(msg.content)}
                            style={actionBtnStyle}>📋</button>
                          {/* Pin (admin only) */}
                          {isAdmin && !msg.isAI && (
                            <button type="button" title={pinnedMsg?.id === msg.id ? 'Désépingler' : 'Épingler'}
                              onClick={() => pinMessage(msg)}
                              style={{ ...actionBtnStyle, color: pinnedMsg?.id === msg.id ? '#f59e0b' : undefined }}>📌</button>
                          )}
                          {/* Delete */}
                          {(mine || isAdmin) && !msg.isAI && (
                            <button type="button" title="Supprimer"
                              onClick={() => handleDelete(msg.id)}
                              style={{ ...actionBtnStyle, color: 'var(--danger)' }}>✕</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Emoji Picker */}
                    {emojiPickerFor === msg.id && (
                      <div style={{ display: 'flex', gap: 4, padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,.15)', zIndex: 100 }}>
                        {QUICK_EMOJIS.map(em => (
                          <button key={em} type="button" onClick={() => toggleReaction(msg.id, em)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '2px 3px', borderRadius: 6, transition: 'transform .1s' }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                          >{em}</button>
                        ))}
                      </div>
                    )}

                    {/* Réactions affichées */}
                    {hasRx && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                        {Object.entries(msgRx)
                          .filter(([k]) => !k.startsWith('_'))
                          .map(([em, cnt]) => {
                            if (!cnt || cnt <= 0) return null;
                            const isMineReaction = msgRx[`_me_${em}`] === true;
                            return (
                              <span
                                key={em}
                                onClick={() => toggleReaction(msg.id, em)}
                                title={isMineReaction ? "Cliquer pour retirer votre réaction" : "Cliquer pour réagir"}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12,
                                  padding: '2px 7px', borderRadius: 12,
                                  background: isMineReaction ? '#e0f2fe' : 'var(--surface)',
                                  border: isMineReaction ? '1px solid #0ea5e9' : '1px solid var(--border)',
                                  cursor: 'pointer', userSelect: 'none', transition: 'all .15s ease'
                                }}
                              >
                                {em} <span style={{ fontWeight: 700, fontSize: 11, color: isMineReaction ? '#0284c7' : 'inherit' }}>{cnt}</span>
                              </span>
                            );
                          })}
                      </div>
                    )}

                    {/* Heure avec infobulle date complète */}
                    <div
                      style={{ fontSize: 10, color: 'var(--text-3)', cursor: 'default' }}
                      title={format(new Date(msg.created_at), 'EEEE d MMMM yyyy à HH:mm', { locale: fr })}
                    >
                      {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {/* Indicateur IA qui "réfléchit" */}
          {aiLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#6366f122', color: '#6366f1', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🤖</div>
              <div style={{ display: 'flex', gap: 3, padding: '10px 14px', background: 'var(--surface)', borderRadius: '14px 14px 14px 4px', border: '1px solid #6366f130' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', animation: `bounce 1s ${i * 0.2}s infinite` }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>L'IA réfléchit…</span>
            </div>
          )}

          {/* Typing */}
          {typingUsers.length > 0 && !aiMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 3, padding: '8px 12px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animation: `bounce 1s ${i * .2}s infinite` }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {typingUsers.map(u => u.nom).join(', ')} écrit…
              </span>
            </div>
          )}

          {/* Upload progress */}
          {uploading && (
            <div style={{ padding: '10px 14px', background: 'var(--primary-lt)', borderRadius: 10, border: '1px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: 'var(--primary-dk)' }}>
                <span>📤 Envoi du fichier…</span><span>{uploadProg}%</span>
              </div>
              <div style={{ background: 'var(--border)', borderRadius: 4, height: 6 }}>
                <div style={{ width: `${uploadProg}%`, background: 'var(--primary)', height: '100%', borderRadius: 4, transition: 'width .2s' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Reply preview ── */}
        {replyTo && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeIn 0.15s ease' }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', borderLeft: '3px solid var(--primary)', paddingLeft: 10 }}>
              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{replyTo.nom}</span> : {replyTo.content?.slice(0, 70)}…
            </div>
            <button type="button" onClick={() => setReplyTo(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ── Barre de saisie moderne ── */}
        <form onSubmit={handleSend} style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)', position: 'relative' }}>
          {/* Mode IA indicator */}
          {aiMode && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#6366f1', padding: '4px 10px', background: '#6366f112', borderRadius: 8, marginBottom: 6 }}>
              <span>🤖 <strong>Mode Assistant IA activé</strong></span>
              <button type="button" onClick={() => setAiMode(false)} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Désactiver</button>
            </div>
          )}

          {/* Hidden file & camera inputs */}
          <input ref={fileInputRef} type="file" style={{ display: 'none' }}
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            onChange={handleFileChange} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={handleFileChange} />

          {/* Action Menu Popover (Tray) */}
          {actionsMenuOpen && !isRecording && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setActionsMenuOpen(false)} />
              <div style={{
                position: 'absolute',
                bottom: '100%',
                left: 12,
                marginBottom: 8,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '12px 14px',
                boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
                display: 'flex',
                gap: 14,
                zIndex: 95,
                animation: 'fadeIn 0.15s ease',
              }}>
                {/* Camera Tile */}
                <button type="button" onClick={() => { setActionsMenuOpen(false); setCameraModalOpen(true); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#0284c7,#0ea5e9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 3px 8px rgba(2,132,199,0.3)' }}>
                    📷
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Photo</span>
                </button>

                {/* Document Tile */}
                <button type="button" onClick={() => { setActionsMenuOpen(false); fileInputRef.current?.click(); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#a855f7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 3px 8px rgba(139,92,246,0.3)' }}>
                    📁
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Fichier</span>
                </button>

                {/* Location Tile */}
                <button type="button" onClick={() => { setActionsMenuOpen(false); handleShareLocation(); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 3px 8px rgba(16,185,129,0.3)' }}>
                    📍
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>GPS</span>
                </button>

                {/* AI Assistant Tile */}
                <button type="button" onClick={() => { setActionsMenuOpen(false); setAiMode(o => !o); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: aiMode ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--surface2)', color: aiMode ? '#fff' : '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, border: '1px solid #6366f135', boxShadow: aiMode ? '0 3px 8px rgba(99,102,241,0.3)' : 'none' }}>
                    🤖
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>IA {aiMode ? '✓' : ''}</span>
                </button>
              </div>
            </>
          )}

          {/* Main Input Row */}
          {isRecording ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 14px',
              background: '#fef2f2',
              borderRadius: 24,
              border: '1px solid #fecaca',
              gap: 10,
              minHeight: 44,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', background: '#ef4444',
                  animation: 'pulse 1s infinite'
                }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: '#b91c1c' }}>
                  {Math.floor(recSeconds / 60)}:{(recSeconds % 60) < 10 ? '0' : ''}{recSeconds % 60}
                </span>
                <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                  Enregistrement vocal…
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={cancelVoiceRecording}
                  style={{ color: '#64748b', fontSize: 12, padding: '4px 8px' }}
                >
                  🗑️ Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={stopAndSendVoiceRecording}
                  style={{ background: '#ef4444', borderColor: '#ef4444', borderRadius: 20, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  🚀 Envoyer
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Plus Actions Button */}
              <button
                type="button"
                onClick={() => setActionsMenuOpen(o => !o)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  border: 'none',
                  background: actionsMenuOpen ? 'var(--primary)' : 'var(--surface2)',
                  color: actionsMenuOpen ? '#fff' : 'var(--text)',
                  fontSize: 20,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all .15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
                title="Ajouter photo, fichier, GPS, IA"
              >
                {actionsMenuOpen ? '✕' : '➕'}
              </button>

              {/* Text Input Capsule */}
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                background: 'var(--surface2)',
                borderRadius: 24,
                padding: '2px 14px',
                border: '1px solid var(--border)',
                minHeight: 40,
              }}>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={handleInput}
                  placeholder={aiMode ? "Posez votre question à l'IA…" : "Votre message…"}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text)',
                    fontSize: 14,
                    padding: '8px 0',
                  }}
                  disabled={uploading}
                />
              </div>

              {/* Right Action: Quick Actions & Send Button */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {!text.trim() && (
                  <>
                    <button
                      type="button"
                      onClick={startVoiceRecording}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        border: 'none',
                        background: '#fef2f2',
                        color: '#ef4444',
                        fontSize: 18,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 1px 3px rgba(239,68,68,0.15)',
                      }}
                      title="Enregistrer un message vocal"
                      aria-label="Enregistrer vocal"
                    >
                      🎙️
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraModalOpen(true)}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        border: 'none',
                        background: '#f0f9ff',
                        color: '#0284c7',
                        fontSize: 18,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 1px 3px rgba(2,132,199,0.15)',
                      }}
                      title="Prendre une photo"
                      aria-label="Prendre photo"
                    >
                      📷
                    </button>
                  </>
                )}
                <button
                  type="submit"
                  disabled={!text.trim() || uploading}
                  aria-label="Envoyer"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: 'none',
                    background: !text.trim() || uploading ? 'var(--border)' : (aiMode ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#0284c7,#0ea5e9)'),
                    color: !text.trim() || uploading ? 'var(--text-3)' : '#fff',
                    fontSize: 17,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: !text.trim() || uploading ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                    boxShadow: text.trim() && !uploading ? '0 3px 10px rgba(2,132,199,0.35)' : 'none',
                    transition: 'all .15s',
                  }}
                  title="Envoyer"
                >
                  🚀
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* ══════════════════════════════════
          PANNEAU LATÉRAL DROIT (Off-canvas Drawer)
      ══════════════════════════════════ */}
      {showInfo && (
        <div className="sidebar-backdrop" onClick={() => setShowInfo(false)} />
      )}
      <div className={`chat-sidebar-panel${showInfo ? ' open' : ''}`}>

        {/* Header panneau sur mobile */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>Détails & Membres</div>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowInfo(false)} style={{ fontSize: 16, padding: '2px 6px' }}>✕</button>
        </div>

        {/* En ligne */}
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            En ligne · {onlineUsers.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {onlineUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: roleColor(u.role) + '22', color: roleColor(u.role), fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(u.prenom?.[0] || '').toUpperCase()}{(u.nom?.[0] || '').toUpperCase()}
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, background: '#22c55e', borderRadius: '50%', border: '1.5px solid white' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{u.prenom} {u.nom}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'capitalize' }}>{u.role}</div>
                </div>
              </div>
            ))}
            {onlineUsers.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 8 }}>Aucun utilisateur en ligne</div>
            )}
          </div>
        </div>

        {/* Assistant IA — info */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: aiMode ? '#6366f108' : 'transparent' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#6366f1', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            🤖 Assistant IA
          </div>
          <button type="button"
            onClick={() => { setAiMode(o => !o); inputRef.current?.focus(); }}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              background: aiMode ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'var(--surface2)',
              color: aiMode ? '#fff' : 'var(--text-2)',
              border: aiMode ? 'none' : '1px solid var(--border)',
              fontWeight: 700, fontSize: 12, transition: 'all .2s',
            }}>
            {aiMode ? '✓ IA activée — Cliquer pour désactiver' : '⚡ Activer l\'assistant IA'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
            Posez des questions médicales, demandez un compte-rendu, des informations sur les traitements…
          </div>
        </div>

        {/* Documents acceptés */}
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>📎 Documents acceptés</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.8 }}>
            <div>🖼 Images (JPG, PNG, GIF)</div>
            <div>📄 PDF</div>
            <div>📝 Word (DOC, DOCX)</div>
            <div>📊 Excel (XLS, XLSX)</div>
            <div>📃 Texte (TXT, CSV)</div>
            <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--text-2)' }}>Max : 10 Mo</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(1.2)} }
      `}</style>
    </div>
  );
}

/* ── Style partagé pour les boutons d'action ── */
const actionBtnStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '3px 6px',
  cursor: 'pointer',
  fontSize: 13,
  color: 'var(--text-2)',
  transition: 'all .1s',
  lineHeight: 1,
};
