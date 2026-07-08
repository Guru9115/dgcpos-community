/**
 * Animated dashboard promo carousel — admin-published dashboard_banner slots
 */
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const API_BASE = (import.meta.env.VITE_API_URL || 'https://api.dgcpos.net/api').replace(/\/api$/, '')

function resolveImage(url) {
  if (!url) return null
  if (url.startsWith('http')) return url
  return `${API_BASE}${url.replace('/api/marketplace/files', '/api/marketplace/public/files')}`
}

function adImages(ad) {
  if (ad?.images?.length) return ad.images
  if (ad?.image_url) return [ad.image_url]
  return []
}

export default function DashboardBannerCarousel({ banners = [] }) {
  const slides = useMemo(() => {
    return (banners || []).flatMap((ad) => {
      const imgs = adImages(ad)
      if (!imgs.length) {
        return [{ ad, image: null, imageIdx: 0, slideKey: `${ad.id}-0` }]
      }
      return imgs.map((image, imageIdx) => ({
        ad,
        image,
        imageIdx,
        slideKey: `${ad.id}-${imageIdx}`,
      }))
    })
  }, [banners])

  const [idx, setIdx] = useState(0)

  useEffect(() => {
    setIdx(0)
  }, [slides.length])

  useEffect(() => {
    if (slides.length < 2) return undefined
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5200)
    return () => clearInterval(t)
  }, [slides.length])

  if (!slides.length) return null

  const slide = slides[idx]
  const { ad } = slide
  const img = resolveImage(slide.image)
  const href = ad.link_url || undefined

  const inner = (
    <motion.div
      key={slide.slideKey}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-2xl border border-[rgba(7,27,82,0.12)]"
      style={{
        background: img
          ? undefined
          : 'linear-gradient(125deg, #1a3a5c 0%, #2a5a7a 55%, #e67e22 120%)',
        boxShadow: '0 8px 28px rgba(26,58,92,0.12)',
        minHeight: 120,
      }}
    >
      {img && (
        <img
          src={img}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: img
            ? 'linear-gradient(90deg, rgba(26,58,92,0.88) 0%, rgba(26,58,92,0.55) 55%, rgba(26,58,92,0.25) 100%)'
            : undefined,
        }}
      />
      <div className="relative z-1 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-200 bg-black/25 px-2 py-0.5 rounded-full">
            {slides.length > 1 ? `Promotion ${idx + 1}/${slides.length}` : 'Promotion'}
          </span>
          <div className="text-lg sm:text-xl font-bold text-white mt-2">{ad.title}</div>
          {ad.subtitle && <div className="text-sm text-white/85 mt-1">{ad.subtitle}</div>}
        </div>
        {href && (
          <span className="shrink-0 px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-bold">
            View offer →
          </span>
        )}
      </div>
    </motion.div>
  )

  return (
    <div className="mb-4">
      <AnimatePresence mode="wait">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="block no-underline">
            {inner}
          </a>
        ) : (
          inner
        )}
      </AnimatePresence>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {slides.map((s, i) => (
            <button
              key={s.slideKey}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? 'w-5 bg-[#0B5FFF]' : 'w-1.5 bg-[rgba(7,27,82,0.2)]'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}