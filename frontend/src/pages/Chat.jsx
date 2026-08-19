import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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

/* ═══════════════════════════════════════════════════════
   IA — Simulateur médical intelligent (sans clé API)
═══════════════════════════════════════════════════════ */
const AI_RESPONSES = [
  {
    keywords: ['bonjour', 'salut', 'hello', 'bonsoir'],
    response: "Bonjour ! Je suis votre assistant médical IA. Je peux vous aider à :\n• Rédiger des comptes-rendus\n• Répondre aux questions médicales courantes\n• Organiser les plannings\n• Analyser les symptômes (à titre indicatif)\n\nComment puis-je vous aider ?",
  },
  {
    keywords: ['compte-rendu', 'compte rendu', 'rapport', 'résumé', 'résumer'],
    response: "Voici un modèle de compte-rendu d'intervention :\n\n**Compte-rendu d'intervention**\n📅 Date : [DATE]\n👤 Patient : [NOM PRÉNOM]\n🩺 Médecin : [Dr. NOM]\n🔧 Technicien : [NOM]\n\n**Motif :** [Description]\n**Actes réalisés :** [Liste des actes]\n**Observations :** [Notes cliniques]\n**Suites à donner :** [Recommandations]\n\nSouhaitez-vous que je personnalise ce modèle ?",
  },
  {
    keywords: ['planning', 'planification', 'agenda', 'rendez-vous', 'rdv'],
    response: "Pour optimiser votre planning médical, je recommande :\n\n📋 **Bonnes pratiques :**\n• Réserver 15 min de tampon entre les interventions\n• Grouper les visites par zone géographique\n• Prévoir les urgences en fin de journée\n• Confirmer les rendez-vous 24h à l'avance\n\nVoulez-vous que j'analyse le planning actuel ?",
  },
  {
    keywords: ['symptôme', 'symptomes', 'douleur', 'fièvre', 'température'],
    response: "⚠️ **Note importante :** Je fournis des informations générales uniquement. Consultez toujours un médecin.\n\nSymptômes courants à surveiller :\n• Fièvre > 38.5°C → Consultation urgente\n• Douleur thoracique → Appel SAMU (15)\n• Difficultés respiratoires → Urgences\n\nQuel symptôme souhaitez-vous explorer ?",
  },
  {
    keywords: ['médicament', 'traitement', 'ordonnance', 'posologie', 'dose'],
    response: "💊 **Rappel posologie générale** (à titre indicatif) :\n\n• **Paracétamol** : 1g max 4x/jour, espacé de 6h\n• **Ibuprofène** : 400mg max 3x/jour avec repas\n• **Amoxicilline** : selon prescription médicale\n\n⚠️ Ces informations ne remplacent pas l'avis du médecin traitant ni l'ordonnance.",
  },
  {
    keywords: ['urgence', 'urgences', 'samu', 'appel', 'secours'],
    response: "🚨 **Numéros d'urgence Tunisie :**\n\n• **SAMU** : 190\n• **Police** : 197\n• **Pompiers** : 198\n• **Urgences médicales** : 71 578 000\n\nEn cas d'urgence vitale, composez le 190 immédiatement.",
  },
  {
    keywords: ['merci', 'thanks', 'parfait', 'super', 'excellent', 'bravo'],
    response: "Avec plaisir ! 😊 Je suis là pour vous aider à tout moment. N'hésitez pas à me poser d'autres questions.",
  },
  {
    keywords: ['aide', 'help', 'que peux-tu', 'fonctionnalité', 'quoi faire'],
    response: "Je peux vous aider avec :\n\n🩺 **Médical**\n• Informations sur les symptômes et traitements\n• Numéros d'urgence\n• Protocoles de soins\n\n📋 **Administratif**\n• Rédaction de comptes-rendus\n• Modèles de documents\n• Organisation du planning\n\n💬 **Général**\n• Répondre à vos questions\n• Fournir des conseils pratiques\n\nTapez votre question !",
  },
];

function getAIResponse(question) {
  const q = question.toLowerCase();
  for (const entry of AI_RESPONSES) {
    if (entry.keywords.some(k => q.includes(k))) return entry.response;
  }
  return `Je comprends votre question : "${question}"\n\nEn tant qu'assistant médical, je peux vous aider avec les interventions, plannings, comptes-rendus et informations médicales générales.\n\n💡 Essayez de me demander : un compte-rendu, des infos sur un symptôme, le planning, ou tapez "aide" pour voir toutes mes fonctionnalités.`;
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

  const isImage = data.mimetype?.startsWith('image/');

  async function handleOpen(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try { await downloadAndOpen(data.url, data.originalname, data.mimetype); }
    finally { setLoading(false); }
  }

  return (
    <div>
      {isImage ? (
        <div onClick={handleOpen} style={{ cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          <div style={{ maxWidth: 200, maxHeight: 160, borderRadius: 8, background: 'rgba(0,0,0,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
            {loading ? <span style={{ fontSize: 24 }}>⏳</span> : <span style={{ fontSize: 13, color: isMine ? '#fff' : 'var(--text-2)' }}>🖼 {data.originalname}</span>}
          </div>
        </div>
      ) : (
        <div onClick={handleOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isMine ? 'rgba(255,255,255,.2)' : 'var(--surface2)', padding: '8px 12px', borderRadius: 8, border: isMine ? 'none' : '1px solid var(--border)', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity .2s' }}>
          <span style={{ fontSize: 22 }}>{loading ? '⏳' : (data.icon || '📎')}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: isMine ? '#fff' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{data.originalname}</div>
            <div style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,.7)' : 'var(--text-3)' }}>{data.sizeDisplay} · {loading ? 'Ouverture…' : 'Cliquer pour ouvrir'}</div>
          </div>
        </div>
      )}
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

  const bottomRef    = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimer  = useRef(null);
  const inputRef     = useRef(null);

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

    if (aiMode) {
      // Message user dans le chat local
      const userMsg = {
        id: `local-${Date.now()}`,
        user_id: user?.id,
        nom: `${user?.prenom} ${user?.nom}`,
        role: user?.role,
        content: text.trim(),
        type: 'text',
        created_at: new Date().toISOString(),
        isLocal: true,
      };
      setMessages(p => [...p, userMsg]);
      const question = text.trim();
      setText('');
      setAiLoading(true);

      // Simuler un délai de réflexion IA
      setTimeout(() => {
        const answer = getAIResponse(question);
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
      }, 800 + Math.random() * 600);
      return;
    }

    // Message normal
    const payload = replyTo
      ? { content: text.trim(), replyTo: { id: replyTo.id, nom: replyTo.nom, content: replyTo.content } }
      : { content: text.trim() };

    emit('send_message', payload);
    emit('typing', false);
    setText('');
    setReplyTo(null);
    clearTimeout(typingTimer.current);
  }

  /* ── File upload ── */
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 10 * 1024 * 1024) { toast('Fichier trop volumineux (max 10 Mo)', 'error'); return; }
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true); setUploadProg(0);
    try {
      await axios.post('/api/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => setUploadProg(Math.round((e.loaded * 100) / e.total)),
      });
      toast(`Fichier envoyé : ${file.name}`, 'success');
    } catch (err) {
      toast(err.response?.data?.message || "Erreur lors de l'envoi", 'error');
    } finally { setUploading(false); setUploadProg(0); }
  }

  function handleDelete(id) { emit('delete_message', id); }

  /* ── Réaction emoji ── */
  function addReaction(msgId, emoji) {
    setReactions(prev => {
      const msgR = prev[msgId] || {};
      const count = msgR[emoji] || 0;
      return { ...prev, [msgId]: { ...msgR, [emoji]: count + 1 } };
    });
    setEmojiPickerFor(null);
  }

  /* ── Copier message ── */
  function copyMessage(content) {
    let text = content;
    try { const d = JSON.parse(content); if (d?.type === 'file') text = d.originalname; } catch {}
    navigator.clipboard.writeText(text).then(() => toast('Message copié !', 'success'));
  }

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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ══════════════════════════════════
          MAIN CHAT AREA
      ══════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 22 }}>💬</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Chat Équipe</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {onlineUsers.length} membre(s) en ligne · Documents partagés acceptés
            </div>
          </div>
          {/* Bouton recherche */}
          <button
            type="button"
            title="Rechercher dans les messages"
            onClick={() => { setSearchOpen(o => !o); setSearchQuery(''); }}
            style={{ background: searchOpen ? 'var(--primary)' : 'var(--border)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: searchOpen ? '#fff' : 'var(--text-2)', fontSize: 14, transition: 'all .15s' }}
          >🔎</button>
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
            const showHeader = !prevMsg || prevMsg.user_id !== msg.user_id;
            const isFile     = msg.type === 'file';
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
              <div key={msg.id}
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
                      padding: isFile ? '6px 8px' : '9px 13px',
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
                      {isFile
                        ? <FileMessage content={msg.content} isMine={mine} />
                        : msg.isAI
                          ? <MarkdownText text={msg.content} />
                          : (replyData ? (
                              (() => {
                                try {
                                  const p = JSON.parse(msg.content);
                                  return p.text || msg.content;
                                } catch { return msg.content; }
                              })()
                            ) : msg.content)
                      }
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
                        <button key={em} type="button" onClick={() => addReaction(msg.id, em)}
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
                      {Object.entries(msgRx).map(([em, cnt]) => (
                        <span key={em} onClick={() => addReaction(msg.id, em)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, padding: '2px 7px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none' }}>
                          {em} <span style={{ fontWeight: 700, fontSize: 11 }}>{cnt}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Heure */}
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                  </div>
                </div>
              </div>
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
          <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', borderLeft: '3px solid var(--primary)', paddingLeft: 8 }}>
              <strong>{replyTo.nom}</strong> : {replyTo.content?.slice(0, 80)}…
            </div>
            <button type="button" onClick={() => setReplyTo(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* ── Barre de saisie ── */}
        <form onSubmit={handleSend} style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Mode IA indicator */}
          {aiMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6366f1', padding: '4px 8px', background: '#6366f110', borderRadius: 6 }}>
              🤖 <strong>Mode IA activé</strong> — Posez votre question, l'assistant répondra
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {/* Attacher fichier */}
            <input ref={fileInputRef} type="file" style={{ display: 'none' }}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={handleFileChange} />
            <button type="button" className="btn btn-outline btn-icon"
              title="Joindre un fichier (max 10 Mo)"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || aiMode}
              style={{ flexShrink: 0, fontSize: 18, padding: '8px 10px' }}>📎</button>

            {/* Bouton IA */}
            <button type="button"
              title={aiMode ? "Désactiver l'assistant IA" : "Activer l'assistant IA"}
              onClick={() => { setAiMode(o => !o); setReplyTo(null); inputRef.current?.focus(); }}
              style={{
                flexShrink: 0, fontSize: 16, padding: '8px 10px',
                border: aiMode ? '2px solid #6366f1' : '1px solid var(--border)',
                borderRadius: 8, cursor: 'pointer',
                background: aiMode ? '#6366f115' : 'var(--surface)',
                color: aiMode ? '#6366f1' : 'var(--text-2)',
                transition: 'all .2s', fontWeight: aiMode ? 700 : 400,
              }}>
              🤖
            </button>

            {/* Champ texte */}
            <input
              ref={inputRef}
              className="input"
              value={text}
              onChange={handleInput}
              placeholder={aiMode ? "Posez votre question à l'IA médicale…" : "Votre message… (ou joindre un document avec 📎)"}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              style={{ flex: 1 }}
              disabled={uploading}
            />

            <button className="btn btn-primary" type="submit"
              disabled={!text.trim() || uploading}
              style={{ background: aiMode ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : undefined }}>
              {aiMode ? '🤖 Demander' : 'Envoyer ↗'}
            </button>
          </div>
        </form>
      </div>

      {/* ══════════════════════════════════
          PANNEAU LATÉRAL DROIT
      ══════════════════════════════════ */}
      <div style={{ width: 220, borderLeft: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto', flexShrink: 0 }}>

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
