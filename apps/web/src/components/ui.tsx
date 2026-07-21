'use client';

import { cn } from '@/lib/utils';

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60',
        size === 'sm' && 'h-9 px-3 text-sm rounded-lg',
        size === 'md' && 'h-11 px-4 text-sm rounded-xl',
        size === 'lg' && 'h-12 px-6 text-base rounded-xl',
        variant === 'primary' &&
          'bg-teal-700 text-white hover:bg-teal-600 shadow-soft active:scale-[0.98]',
        variant === 'secondary' &&
          'bg-white/80 text-ink border border-teal-200/80 hover:bg-teal-50 hover:border-teal-300',
        variant === 'ghost' && 'text-ink-soft hover:bg-teal-50 hover:text-teal-800',
        variant === 'danger' && 'bg-status-red text-white hover:opacity-90',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <input
        className={cn(
          'w-full h-11 px-3.5 rounded-xl border border-teal-200/70 bg-white/90 text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition',
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function Select({
  className,
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <select
        className={cn(
          'w-full h-11 px-3.5 rounded-xl border border-teal-200/70 bg-white/90 text-ink focus:outline-none focus:ring-2 focus:ring-teal-400/40',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Textarea({
  className,
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-ink-soft">{label}</span>}
      <textarea
        className={cn(
          'w-full min-h-[96px] px-3.5 py-2.5 rounded-xl border border-teal-200/70 bg-white/90 text-ink focus:outline-none focus:ring-2 focus:ring-teal-400/40',
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function ScoreBadge({ score, color }: { score: number; color?: string }) {
  const c = color || (score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
        c === 'green' && 'bg-emerald-50 text-status-green border-emerald-200',
        c === 'yellow' && 'bg-amber-50 text-status-yellow border-amber-200',
        c === 'red' && 'bg-rose-50 text-status-red border-rose-200',
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          c === 'green' && 'bg-status-green',
          c === 'yellow' && 'bg-status-yellow',
          c === 'red' && 'bg-status-red',
        )}
      />
      {score.toFixed(1)}%
    </span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
      <div>
        {eyebrow && (
          <p className="text-xs uppercase tracking-[0.18em] text-teal-600 font-semibold mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl md:text-4xl text-ink tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-ink-muted max-w-2xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}
