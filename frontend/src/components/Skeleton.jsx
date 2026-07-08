/**
 * DGC RetailOS — Skeleton Loading Components
 * Replace spinners with content-aware skeleton placeholders.
 *
 * Usage:
 *   import { SkeletonCard, SkeletonTable, SkeletonKPI, SkeletonText } from '../components/Skeleton'
 */

import { motion } from 'framer-motion'
import clsx from 'clsx'

// ── Base shimmer pulse ──────────────────────────────────────────────────────
function Shimmer({ className }) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden bg-white/5 rounded-lg before:absolute before:inset-0',
        'before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
        'before:animate-[shimmer_1.4s_ease-in-out_infinite] before:-translate-x-full',
        className
      )}
    />
  )
}

// Tailwind doesn't ship "shimmer" keyframe — inject once
if (typeof document !== 'undefined' && !document.getElementById('sk-style')) {
  const s = document.createElement('style')
  s.id = 'sk-style'
  s.textContent = `@keyframes shimmer { to { transform: translateX(200%); } }`
  document.head.appendChild(s)
}

// ── KPI card skeleton (matches Dashboard top row) ──────────────────────────
export function SkeletonKPI() {
  return (
    <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-3">
      <Shimmer className="h-3 w-24 rounded-full" />
      <Shimmer className="h-8 w-36 rounded-xl" />
      <Shimmer className="h-3 w-20 rounded-full" />
    </div>
  )
}

// ── Generic card ────────────────────────────────────────────────────────────
export function SkeletonCard({ lines = 3, className }) {
  return (
    <div className={clsx('glass-card p-5 rounded-2xl border border-white/5 space-y-3', className)}>
      <Shimmer className="h-4 w-1/2 rounded-full" />
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer key={i} className={clsx('h-3 rounded-full', i === lines - 1 ? 'w-3/4' : 'w-full')} />
      ))}
    </div>
  )
}

// ── Table skeleton ──────────────────────────────────────────────────────────
export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className="h-4 rounded-full" />
        ))}
      </div>
      {/* Divider */}
      <div className="h-px bg-white/5" />
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="grid gap-3 py-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, col) => (
            <Shimmer key={col} className="h-3 rounded-full" style={{ width: `${60 + Math.random() * 30}%` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Single text line ────────────────────────────────────────────────────────
export function SkeletonText({ width = 'w-full', height = 'h-3' }) {
  return <Shimmer className={clsx(height, width, 'rounded-full')} />
}

// ── Product grid card ───────────────────────────────────────────────────────
export function SkeletonProductCard() {
  return (
    <div className="glass-card p-4 rounded-xl border border-white/5 space-y-3">
      <Shimmer className="h-32 rounded-xl w-full" />
      <Shimmer className="h-4 w-3/4 rounded-full" />
      <Shimmer className="h-3 w-1/2 rounded-full" />
      <div className="flex gap-2 pt-1">
        <Shimmer className="h-7 flex-1 rounded-lg" />
        <Shimmer className="h-7 w-10 rounded-lg" />
      </div>
    </div>
  )
}

// ── Dashboard chart placeholder ─────────────────────────────────────────────
export function SkeletonChart({ height = 'h-48' }) {
  return (
    <div className={clsx('glass-card p-5 rounded-2xl border border-white/5', height)}>
      <Shimmer className="h-4 w-32 rounded-full mb-4" />
      <div className="flex items-end gap-2 h-28">
        {Array.from({ length: 12 }).map((_, i) => (
          <Shimmer
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${20 + Math.random() * 80}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Full page loader (fade-in branded) ─────────────────────────────────────
export function SkeletonPage({ title = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 space-y-6"
    >
      {title && <SkeletonText width="w-48" height="h-7" />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <SkeletonCard lines={5} />
    </motion.div>
  )
}
