'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { api, getToken } from '@/lib/api';
import { cn } from '@/lib/utils';

type Msg = { role: 'user' | 'assistant'; content: string; transcript?: string };
type SuggestItem = {
  title: string;
  detail?: string;
  priority?: 'high' | 'mid' | 'low' | string;
  navigate?: string | null;
};

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export default function AssistantPage() {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [aiItems, setAiItems] = useState<SuggestItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(true);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);

  const stopSpeaking = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
        a.currentTime = 0;
        a.src = '';
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const stopRec = useCallback(() => {
    try {
      if (mediaRef.current && mediaRef.current.state !== 'inactive') {
        mediaRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    mediaRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopSpeaking();
      stopRec();
    };
  }, [stopSpeaking, stopRec]);

  async function loadSuggestions() {
    setSuggestLoading(true);
    try {
      const r = await api<{ items?: SuggestItem[] }>('/assistant/suggestions');
      if (aliveRef.current) setAiItems(r.items || []);
    } catch {
      if (aliveRef.current) setAiItems([]);
    } finally {
      if (aliveRef.current) setSuggestLoading(false);
    }
  }

  useEffect(() => {
    loadSuggestions();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  function playAudio(b64?: string | null) {
    if (!b64 || !voiceOn || !aliveRef.current) return;
    stopSpeaking();
    const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
    audioRef.current = audio;
    setSpeaking(true);
    audio.onended = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setSpeaking(false);
      }
    };
    audio.onerror = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setSpeaking(false);
      }
    };
    audio.play().catch(() => setSpeaking(false));
  }

  async function sendText(text: string) {
    if (!text.trim() || busy) return;
    stopSpeaking();
    setBusy(true);
    const next = [...messages, { role: 'user' as const, content: text.trim() }];
    setMessages(next);
    setInput('');
    try {
      const res = await api<any>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text.trim(),
          wantAudio: voiceOn,
          history: next.slice(-8),
        }),
      });
      if (!aliveRef.current) return;
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
      if (voiceOn) playAudio(res.audioBase64);
      if (res.navigate) {
        // Navigatsiyadan oldin ovozni toʻxtatamiz — boshqa sahifada gapirmasin
        setTimeout(() => {
          if (!aliveRef.current) return;
          stopSpeaking();
          router.push(res.navigate);
        }, voiceOn && res.audioBase64 ? 50 : 400);
      }
    } catch (e: any) {
      if (aliveRef.current) toast.error(e.message);
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  async function startRec() {
    if (busy || recording) return;
    stopSpeaking();
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(t('assistant.micDenied'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        toast.error(t('assistant.voiceError'));
        stopRec();
      };
      rec.onstop = async () => {
        const tracks = streamRef.current;
        tracks?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const type = mime || chunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        setRecording(false);
        mediaRef.current = null;
        if (blob.size < 800) {
          toast.error(t('assistant.voiceTooShort'));
          return;
        }
        await sendVoice(blob, type);
      };
      mediaRef.current = rec;
      rec.start(250);
      setRecording(true);
    } catch {
      toast.error(t('assistant.micDenied'));
      stopRec();
    }
  }

  async function sendVoice(blob: Blob, mimeType: string) {
    setBusy(true);
    try {
      const ext = mimeType.includes('mp4')
        ? 'm4a'
        : mimeType.includes('ogg')
          ? 'ogg'
          : 'webm';
      const fd = new FormData();
      fd.append('file', blob, `voice.${ext}`);
      fd.append('history', JSON.stringify(messages.slice(-8)));
      const token = getToken();
      const res = await fetch(`/api/assistant/voice`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t('assistant.voiceError'));
      if (!aliveRef.current) return;
      if (data.transcript) {
        setMessages((m) => [
          ...m,
          { role: 'user', content: data.transcript, transcript: data.transcript },
        ]);
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      if (voiceOn) playAudio(data.audioBase64);
      if (data.navigate) {
        setTimeout(() => {
          if (!aliveRef.current) return;
          stopSpeaking();
          router.push(data.navigate);
        }, 50);
      }
    } catch (e: any) {
      if (aliveRef.current) toast.error(e.message || t('assistant.voiceError'));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  const quickPrompts = isAdmin
    ? [
        'Что не закрыто сегодня?',
        'Какие филиалы отстают?',
        'Открой отчёты',
        'Интеграции: что проверить?',
      ]
    : [
        'Bugun nima qilishim kerak?',
        'Qaysi ishlar qolgan?',
        'Prioritetlarni ayt',
        'Marketing boʻyicha maslahat',
      ];

  return (
    <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <AppShell>
        <div className="w-full max-w-none flex flex-col gap-4 min-h-[calc(100dvh-7.5rem)] lg:min-h-[calc(100dvh-6rem)]">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-xl bg-teal-800 text-white grid place-items-center shadow-soft">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">
                    {isAdmin ? t('assistant.adminTitle') : t('assistant.managerTitle')}
                  </h1>
                  <p className="text-sm text-ink-muted">
                    {isAdmin ? t('assistant.adminHint') : t('assistant.managerHint')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(speaking || busy) && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-100 rounded-full px-3 py-1.5">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full bg-teal-600',
                      speaking && 'animate-pulse',
                    )}
                  />
                  {speaking ? t('assistant.speaking') : t('assistant.thinking')}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  const next = !voiceOn;
                  setVoiceOn(next);
                  if (!next) stopSpeaking();
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border text-sm font-medium transition',
                  voiceOn
                    ? 'bg-white border-teal-200 text-teal-900'
                    : 'bg-ink/5 border-ink/10 text-ink-muted',
                )}
                title={voiceOn ? t('assistant.voiceOn') : t('assistant.voiceOff')}
              >
                {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                {voiceOn ? t('assistant.voiceOn') : t('assistant.voiceOff')}
              </button>
              <button
                type="button"
                disabled={!speaking}
                onClick={stopSpeaking}
                className={cn(
                  'inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border text-sm font-semibold transition',
                  speaking
                    ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700'
                    : 'bg-white border-teal-100 text-ink-muted opacity-50 cursor-not-allowed',
                )}
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                {t('assistant.stopSpeak')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4 flex-1 min-h-0">
            <aside className="rounded-2xl border border-teal-100 bg-white/90 shadow-soft p-3 xl:p-4 flex flex-col min-h-0 xl:max-h-[calc(100dvh-11rem)]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-teal-950">{t('assistant.suggestions')}</p>
                <button
                  type="button"
                  onClick={() => loadSuggestions()}
                  disabled={suggestLoading}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', suggestLoading && 'animate-spin')} />
                  {t('assistant.refreshSuggestions')}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {suggestLoading ? (
                  <p className="text-xs text-ink-muted py-2">{t('assistant.suggestionsLoading')}</p>
                ) : aiItems.length === 0 ? (
                  <p className="text-xs text-ink-muted py-2">{t('assistant.suggestionsEmpty')}</p>
                ) : (
                  aiItems.slice(0, 8).map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (item.navigate) router.push(item.navigate);
                        else if (item.title) sendText(item.title);
                      }}
                      className="w-full text-left rounded-xl border border-teal-100 bg-teal-50/40 hover:bg-teal-50 px-3 py-2.5 transition"
                    >
                      <div className="flex gap-2 items-start">
                        <span
                          className={cn(
                            'shrink-0 w-1.5 h-1.5 rounded-full mt-1.5',
                            item.priority === 'high' && 'bg-rose-500',
                            item.priority === 'mid' && 'bg-amber-400',
                            (!item.priority || item.priority === 'low') && 'bg-teal-500',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-ink leading-snug">{item.title}</p>
                          {item.detail && (
                            <p className="text-[11px] text-ink-muted leading-snug mt-0.5 line-clamp-2">
                              {item.detail}
                            </p>
                          )}
                        </div>
                        <ArrowUpRight className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="pt-3 mt-2 border-t border-teal-100">
                <p className="text-[11px] font-semibold text-ink-muted mb-2">
                  {t('assistant.quick')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {quickPrompts.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={busy}
                      onClick={() => sendText(q)}
                      className="text-[11px] rounded-lg border border-teal-100 bg-white px-2 py-1 text-teal-900 hover:bg-teal-50 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <section className="rounded-2xl border border-teal-100 bg-white/90 shadow-soft flex flex-col min-h-[28rem] xl:min-h-0 xl:max-h-[calc(100dvh-11rem)] overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 min-h-0">
                {messages.length === 0 && (
                  <div className="h-full min-h-[16rem] grid place-items-center text-center text-ink-muted px-4">
                    <div className="max-w-lg">
                      <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-teal-50 border border-teal-100 grid place-items-center">
                        <Volume2 className="w-7 h-7 text-teal-700" />
                      </div>
                      <p className="text-base text-ink font-medium">
                        {isAdmin ? t('assistant.emptyAdmin') : t('assistant.emptyManager')}
                      </p>
                      <p className="text-sm mt-2 text-ink-muted">{t('assistant.emptyHint')}</p>
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      'max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm sm:text-[15px] whitespace-pre-wrap leading-relaxed',
                      m.role === 'user'
                        ? 'ml-auto bg-teal-800 text-white'
                        : 'mr-auto bg-teal-50 text-ink border border-teal-100',
                    )}
                  >
                    {m.content}
                  </div>
                ))}
                {busy && (
                  <div className="mr-auto rounded-2xl bg-teal-50 border border-teal-100 px-4 py-3 text-sm text-ink-muted">
                    {t('assistant.thinking')}…
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-teal-100 bg-teal-50/40 p-3 sm:p-4">
                {recording && (
                  <p className="text-xs font-semibold text-rose-700 mb-2 animate-pulse">
                    {t('assistant.listening')}
                  </p>
                )}
                <div className="flex gap-2 items-end">
                  <button
                    type="button"
                    disabled={busy && !recording}
                    onClick={() => (recording ? stopRec() : startRec())}
                    className={cn(
                      'h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center shrink-0 border transition',
                      recording
                        ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                        : 'bg-white border-teal-200 text-teal-800 hover:bg-teal-50',
                    )}
                    aria-label={recording ? t('assistant.stopMic') : t('assistant.mic')}
                    title={recording ? t('assistant.stopMic') : t('assistant.mic')}
                  >
                    {recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendText(input);
                      }
                    }}
                    rows={2}
                    placeholder={isAdmin ? t('assistant.phAdmin') : t('assistant.phManager')}
                    className="flex-1 rounded-2xl border border-teal-200 bg-white px-3.5 py-3 text-sm sm:text-[15px] resize-none shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300/60"
                    disabled={busy || recording}
                  />
                  {speaking ? (
                    <button
                      type="button"
                      onClick={stopSpeaking}
                      className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl shrink-0 bg-rose-600 text-white grid place-items-center hover:bg-rose-700"
                      title={t('assistant.stopSpeak')}
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </button>
                  ) : (
                    <Button
                      disabled={busy || !input.trim()}
                      onClick={() => sendText(input)}
                      className="h-12 w-12 sm:h-14 sm:w-14 p-0 shrink-0 rounded-2xl"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-ink-muted mt-2 px-1">
                  {t('assistant.inputHint')}
                </p>
              </div>
            </section>
          </div>
        </div>
      </AppShell>
    </RoleGate>
  );
}
