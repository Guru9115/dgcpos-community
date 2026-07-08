import { memo, useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion } from 'framer-motion'
import { Camera } from 'lucide-react'

const ROW_HEIGHT = 168
const ROW_GAP = 16

function useColumnCount(parentRef) {
  const [cols, setCols] = useState(2)

  useEffect(() => {
    const el = parentRef.current
    if (!el) return undefined

    const update = () => {
      const w = el.clientWidth
      if (w >= 1200) setCols(4)
      else if (w >= 640) setCols(3)
      else setCols(2)
    }

    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [parentRef])

  return cols
}

const ProductCard = memo(function ProductCard({ product: p, canMarketPost, onProductTap, onListBazaar }) {
  return (
    <motion.div
      className="liquid-glass pos-product-card"
      whileTap={{ scale: 0.985 }}
      onClick={() => onProductTap(p)}
      style={{
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid rgba(15,23,42,0.10)',
        borderRadius: 16,
        padding: '1rem',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'manipulation',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 4px 16px rgba(2,8,23,0.10)',
        height: ROW_HEIGHT - ROW_GAP,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: '12%', right: '12%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(27,47,94,0.5) 50%, transparent)', pointerEvents: 'none' }} />
      {canMarketPost && (
        <button
          type="button"
          title="List on DGC Bazaar with photo"
          onClick={(e) => onListBazaar(p, e)}
          style={{
            position: 'absolute', top: 6, right: 6, fontSize: '9px', fontWeight: 700,
            background: 'rgba(139,94,60,0.14)', color: '#8B5E3C', padding: '3px 6px',
            borderRadius: 6, border: '1px solid rgba(139,94,60,0.28)',
            display: 'flex', alignItems: 'center', gap: 3, zIndex: 2,
          }}
        >
          <Camera size={10} /> Bazaar
        </button>
      )}
      {p.has_variants && (
        <div style={{ position: 'absolute', top: 6, left: 6, fontSize: '9px', fontWeight: 600, background: 'rgba(27,47,94,0.10)', color: '#071B52', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(27,47,94,0.18)' }}>
          VARIANTS
        </div>
      )}
      {p.is_low_stock && !p.has_variants && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(27,47,94,0.6)' }} />
      )}
      {p.image_url && (
        <img
          src={p.image_url}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: 52, objectFit: 'cover', borderRadius: 8, marginBottom: 6, background: 'rgba(27,47,94,0.08)' }}
        />
      )}
      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.35, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {p.name}
      </div>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '0.63rem', color: '#64748B', marginBottom: 10, letterSpacing: '0.03em' }}>
        {p.sku || p.category_name || '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>
          Rs.{Number(p.selling_price).toLocaleString()}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 4,
          fontSize: '0.60rem', fontWeight: 500,
          background: p.is_low_stock ? 'rgba(239,68,68,0.10)' : 'rgba(27,47,94,0.08)',
          border: p.is_low_stock ? '1px solid rgba(239,68,68,0.22)' : '1px solid rgba(15,23,42,0.10)',
          color: p.is_low_stock ? '#B42318' : '#64748B',
        }}>
          {p.has_variants ? 'Options' : `${p.stock_qty} left`}
        </div>
      </div>
    </motion.div>
  )
})

export default function POSProductGrid({ products, canMarketPost, onProductTap, onListBazaar }) {
  const parentRef = useRef(null)
  const cols = useColumnCount(parentRef)
  const rowCount = Math.ceil(products.length / cols)

  const virtualizer = useVirtualizer({
    count: products.length === 0 ? 0 : rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
    gap: ROW_GAP,
  })

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto overscroll-contain"
      style={{ WebkitOverflowScrolling: 'touch', contain: 'strict' }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const start = virtualRow.index * cols
          const rowProducts = products.slice(start, start + cols)
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gap: ROW_GAP,
              }}
            >
              {rowProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  canMarketPost={canMarketPost}
                  onProductTap={onProductTap}
                  onListBazaar={onListBazaar}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}