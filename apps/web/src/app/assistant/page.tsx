'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, MicOff, Send, Sparkles, Volume2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { RoleGate } from '@/components/RoleGate';
import { Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { api, getToken } from '@/lib/api';
import { cn } from '@/lib/utils';

type Msg = { role: 'user' | 'assistant'; content: string; transcript?: string };

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
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function playAudio(b64?: string | null) {
    if (!b64) return;
    const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
    audio.play().catch(() => {});
  }

  async function sendText(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    const next = [...messages, { role: 'user' as const, content: text.trim() }];
    setMessages(next);
    setInput('');
    try {
      const res = await api<any>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text.trim(),
          wantAudio: true,
          history: next.slice(-8),
        }),
      });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply }]);
      playAudio(res.audioBase64);
      if (res.navigate) {
        setTimeout(() => router.push(res.navigate), 600);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await sendVoice(blob);
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error(t('assistant.micDenied'));
    }
  }

  function stopRec() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function sendVoice(blob: Blob) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, 'voice.webm');
      fd.append('history', JSON.stringify(messages.slice(-8)));
      const token = getToken();
      const res = await fetch(`/api/assistant/voice`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t('assistant.voiceError'));
      if (data.transcript) {
        setMessages((m) => [
          ...m,
          { role: 'user', content: data.transcript, transcript: data.transcript },
        ]);
      }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      playAudio(data.audioBase64);
      if (data.navigate) setTimeout(() => router.push(data.navigate), 600);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <RoleGate allow={['MANAGER', 'ADMIN', 'SUPER_ADMIN']}>
      <AppShell>
        <div className="max-w-2xl mx-auto flex flex-col h-[calc(100dvh-8rem)]">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-700" />
              <h1 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">
                {isAdmin ? t('assistant.adminTitle') : t('assistant.managerTitle')}
              </h1>
            </div>
            <p className="text-sm text-ink-muted mt-1">
              {isAdmin ? t('assistant.adminHint') : t('assistant.managerHint')}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 rounded-2xl border border-teal-100 bg-white/80 p-4 mb-3">
            {messages.length === 0 && (
              <div className="h-full grid place-items-center text-center text-ink-muted text-sm px-6">
                <div>
                  <Volume2 className="w-8 h-8 mx-auto mb-2 text-teal-600/70" />
                  <p>{isAdmin ? t('assistant.emptyAdmin') : t('assistant.emptyManager')}</p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap',
                  m.role === 'user'
                    ? 'ml-auto bg-teal-800 text-white'
                    : 'mr-auto bg-teal-50 text-ink border border-teal-100',
                )}
              >
                {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 items-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => (recording ? stopRec() : startRec())}
              className={cn(
                'h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border transition',
                recording
                  ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                  : 'bg-white border-teal-200 text-teal-800 hover:bg-teal-50',
              )}
              aria-label={t('assistant.mic')}
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
              className="flex-1 rounded-xl border border-teal-200 bg-white px-3 py-2.5 text-sm resize-none"
              disabled={busy}
            />
            <Button
              disabled={busy || !input.trim()}
              onClick={() => sendText(input)}
              className="h-12 w-12 p-0 shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </AppShell>
    </RoleGate>
  );
}
