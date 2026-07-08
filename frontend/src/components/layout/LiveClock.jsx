import { memo, useEffect, useState } from 'react'
import { brandColors } from '../../theme/brand'

/** Isolated clock — updates every second without re-rendering the whole Layout shell. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="hidden sm:flex flex-col items-end" style={{ lineHeight: 1 }}>
      <div style={{
        fontFamily: '"JetBrains Mono",monospace',
        fontSize: '0.88rem',
        fontWeight: 600,
        color: brandColors.navy,
        letterSpacing: '0.04em',
      }}>
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div style={{ fontSize: '0.63rem', color: '#8A90A0', marginTop: 2, letterSpacing: '0.04em' }}>
        {now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
    </div>
  )
}

export default memo(LiveClock)