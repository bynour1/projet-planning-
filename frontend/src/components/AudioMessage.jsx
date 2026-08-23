import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function fmtTime(s) {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export default function AudioMessage({ url, originalname, sizeDisplay, isMine }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef(null);

  useEffect(() => {
    let active = true;
    let createdUrl = null;

    async function loadAudio() {
      try {
        setLoading(true);
        const res = await axios.get(url, { responseType: 'blob' });
        if (!active) return;
        createdUrl = URL.createObjectURL(res.data);
        setBlobUrl(createdUrl);
      } catch (err) {
        console.error('Erreur chargement audio:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAudio();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  function togglePlay() {
    if (!audioRef.current || !blobUrl) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  function handleTimeUpdate() {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }

  function handleLoadedMetadata() {
    if (audioRef.current && isFinite(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
  }

  function handleSeek(e) {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  }

  function toggleSpeed() {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: 220,
      maxWidth: 290,
      padding: '8px 10px',
      borderRadius: 12,
      background: isMine ? 'rgba(255, 255, 255, 0.15)' : 'var(--surface2)',
      border: isMine ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--border)',
    }}>
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        />
      )}

      {/* Header with mic icon & title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: isMine ? 'rgba(255,255,255,0.85)' : 'var(--text-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
          🎙️ Message vocal
        </span>
        <span>{sizeDisplay || (duration > 0 ? fmtTime(duration) : '')}</span>
      </div>

      {/* Audio controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          disabled={loading}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: 'none',
            background: isMine ? '#fff' : 'var(--primary)',
            color: isMine ? 'var(--primary)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            transition: 'transform .1s',
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.92)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {loading ? '⏳' : playing ? '⏸' : '▶'}
        </button>

        {/* Progress Slider & Time */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            disabled={loading || !duration}
            style={{
              width: '100%',
              height: 5,
              cursor: 'pointer',
              accentColor: isMine ? '#fff' : 'var(--primary)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: isMine ? 'rgba(255,255,255,0.8)' : 'var(--text-3)' }}>
            <span>{fmtTime(currentTime)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        {/* Speed button */}
        <button
          type="button"
          onClick={toggleSpeed}
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 5px',
            borderRadius: 4,
            border: isMine ? '1px solid rgba(255,255,255,0.5)' : '1px solid var(--border)',
            background: isMine ? 'rgba(255,255,255,0.2)' : 'var(--surface)',
            color: isMine ? '#fff' : 'var(--text-2)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          title="Vitesse de lecture"
        >
          {speed}x
        </button>
      </div>
    </div>
  );
}
