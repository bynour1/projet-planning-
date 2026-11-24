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

const IconSearch = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconSend = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const IconCamera = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
);

const IconMic = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

const IconChat = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconPin = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24V17z"/>
  </svg>
);

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
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: isMine ? '#fff' : 'var(--primary)' }}>
        {loading ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        )}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isMine ? '#fff' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{data.originalname}</div>
        <div style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,.7)' : 'var(--text-3)' }}>{data.sizeDisplay} · {loading ? 'Ouverture…' : 'Cliquer pour ouvrir'}</div>
      </div>
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
  const [userDirectory,   setUserDirectory]   = useState({});

  const bottomRef         = useRef(null);
  const fileInputRef      = useRef(null);
  const cameraInputRef    = useRef(null);
  const mediaRecorderRef  = useRef(null);
  const audioChunksRef    = useRef([]);
  const recTimerRef       = useRef(null);
  const typingTimer       = useRef(null);
  const inputRef          = useRef(null);

  /* ── Load history & Users Directory ── */
  useEffect(() => {
    axios.get('/api/chat/messages?limit=100')
      .then(r => setMessages(r.data))
      .catch(() => toast('Erreur chargement', 'error'));

    axios.get('/api/users')
      .then(r => {
        const map = {};
        (r.data || []).forEach(u => { map[u.id] = u; });
        setUserDirectory(map);
      })
      .catch(() => {});
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
    emit('typing', true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emit('typing', false), 1500);
  }

  /* ── Envoyer ── */
  async function handleSend(e) {
    e?.preventDefault();
    if (!text.trim()) return;

    const raw = text.trim();
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
            background: 'var(--primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <IconChat size={18} color="#fff" />
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
              Messagerie d'équipe sécurisée · Documents & Partages
            </div>
          </div>
          {/* Bouton recherche */}
          <button
            type="button"
            title="Rechercher dans les messages"
            onClick={() => { setSearchOpen(o => !o); setSearchQuery(''); }}
            style={{ background: searchOpen ? 'var(--primary)' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: searchOpen ? '#fff' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <IconSearch size={14} color={searchOpen ? '#fff' : 'var(--text-2)'} />
          </button>
          {/* Bouton Infos / Membres sur mobile */}
          <button
            type="button"
            onClick={() => setShowInfo(o => !o)}
            className="btn btn-outline btn-sm"
            style={{ padding: '5px 10px', fontSize: 12, borderRadius: 8, fontWeight: 700 }}
            title="Membres en ligne & Documents"
          >
            {showInfo ? '✕' : 'Infos'}
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
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: '#fffbeb', display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconPin size={14} color="#92400e" />
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
              <p>{searchQuery ? 'Aucun message trouvé' : 'Commencez la conversation'}</p>
            </div>
          )}

          {filteredMessages.map((msg, i) => {
            const mine       = isMine(msg);
            const color      = roleColor(msg.role);
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
                      {formatMessageDate(msg.created_at)}
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
                      {getInitials(msg.nom)}
                    </div>
                  )}
                  {!mine && !showHeader && <div style={{ width: 30, flexShrink: 0 }} />}

                  <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', gap: 2, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    {/* Nom */}
                    {showHeader && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color }}>
                          {mine ? 'Vous' : msg.nom}
                        </span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 700, background: color + '22', color }}>
                          {roleBadge(msg.role)}
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', flexDirection: mine ? 'row-reverse' : 'row' }}>
                      {/* Bulle */}
                      <div style={{
                        padding: (isFile || isLocation) ? '6px 8px' : '9px 13px',
                        borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: mine ? 'var(--primary)' : 'var(--surface)',
                        color: mine ? '#fff' : 'var(--text)',
                        border: mine ? 'none' : '1px solid var(--border)',
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
                          <button type="button" title="Répondre"
                            onClick={() => { setReplyTo({ id: msg.id, nom: msg.nom || 'Vous', content: msg.content }); inputRef.current?.focus(); }}
                            style={actionBtnStyle}>↩</button>
                          {/* Copy */}
                          <button type="button" title="Copier"
                            onClick={() => copyMessage(msg.content)}
                            style={actionBtnStyle}>📋</button>
                          {/* Pin (admin only) */}
                          {isAdmin && (
                            <button type="button" title={pinnedMsg?.id === msg.id ? 'Désépingler' : 'Épingler'}
                              onClick={() => pinMessage(msg)}
                              style={{ ...actionBtnStyle, color: pinnedMsg?.id === msg.id ? '#f59e0b' : undefined }}>📌</button>
                          )}
                          {/* Delete */}
                          {(mine || isAdmin) && (
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

          {/* Typing */}
          {typingUsers.length > 0 && (
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
                <span>Envoi du fichier…</span><span>{uploadProg}%</span>
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
                borderRadius: 14,
                padding: '12px 14px',
                boxShadow: 'var(--shadow-lg, 0 12px 36px rgba(0,0,0,0.12))',
                display: 'flex',
                gap: 14,
                zIndex: 95,
                animation: 'fadeIn 0.15s ease',
              }}>
                {/* Camera Tile */}
                <button type="button" onClick={() => { setActionsMenuOpen(false); setCameraModalOpen(true); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Photo</span>
                </button>

                {/* Document Tile */}
                <button type="button" onClick={() => { setActionsMenuOpen(false); fileInputRef.current?.click(); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Fichier</span>
                </button>

                {/* Location Tile */}
                <button type="button" onClick={() => { setActionsMenuOpen(false); handleShareLocation(); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>Position</span>
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
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={stopAndSendVoiceRecording}
                  style={{ background: '#ef4444', borderColor: '#ef4444', borderRadius: 20, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <IconSend size={14} color="#fff" />
                  <span>Envoyer</span>
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
                  fontSize: 18,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all .15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
                title="Ajouter photo, fichier, position"
              >
                {actionsMenuOpen ? '✕' : '+'}
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
                  placeholder="Votre message…"
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
                        background: 'var(--surface2)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                      title="Enregistrer un message vocal"
                      aria-label="Enregistrer vocal"
                    >
                      <IconMic size={18} color="var(--text)" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCameraModalOpen(true)}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        border: 'none',
                        background: 'var(--surface2)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                      title="Prendre une photo"
                      aria-label="Prendre photo"
                    >
                      <IconCamera size={18} color="var(--text)" />
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
                    background: !text.trim() || uploading ? 'var(--border)' : 'var(--primary)',
                    color: !text.trim() || uploading ? 'var(--text-3)' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: !text.trim() || uploading ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                    boxShadow: text.trim() && !uploading ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
                    transition: 'all .15s',
                  }}
                  title="Envoyer"
                >
                  <IconSend size={16} color={!text.trim() || uploading ? 'var(--text-3)' : '#fff'} />
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
          {(() => {
            const uniqueUsers = Array.from(new Map(onlineUsers.map(u => [u.id, u])).values());
            return (
              <>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  En ligne · {uniqueUsers.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {uniqueUsers.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ position: 'relative' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: roleColor(u.role) + '22', color: roleColor(u.role), fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(u.prenom?.[0] || '').toUpperCase()}{(u.nom?.[0] || '').toUpperCase()}
                        </div>
                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 8, height: 8, background: '#22c55e', borderRadius: '50%', border: '1.5px solid white' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.prenom} {u.nom}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'capitalize' }}>{u.role}</div>
                      </div>
                    </div>
                  ))}
                  {uniqueUsers.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 8 }}>Aucun utilisateur en ligne</div>
                  )}
                </div>
              </>
            );
          })()}
        </div>


        {/* Documents acceptés */}
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', marginBottom: 8 }}>Formats de documents acceptés</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.8 }}>
            <div>Images (JPG, PNG, GIF)</div>
            <div>PDF</div>
            <div>Word (DOC, DOCX)</div>
            <div>Excel (XLS, XLSX)</div>
            <div>Texte (TXT, CSV)</div>
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
