/**
 * Device form factor — iPhone, iPad, Android phone, Android tablet, desktop.
 * Drives layout classes and persistent sidebar on native tablets.
 */
import { getDeviceInfo } from '../hooks/useWakeLock'

export const TABLET_MIN_WIDTH = 768

export function getFormFactor() {
  const d = getDeviceInfo()
  if (typeof window !== 'undefined' && window.innerWidth >= 1280 && !d.isTouch) {
    return 'desktop'
  }
  if (d.isTablet || (typeof window !== 'undefined' && window.innerWidth >= TABLET_MIN_WIDTH && d.isTouch)) {
    return 'tablet'
  }
  if (d.isMobile || d.isTouch) return 'phone'
  if (typeof window !== 'undefined' && window.innerWidth >= TABLET_MIN_WIDTH) return 'tablet'
  return 'desktop'
}

export function isWideLayout() {
  if (typeof window === 'undefined') return false
  return window.innerWidth >= TABLET_MIN_WIDTH
}

export function shouldUsePersistentSidebar(nativeApp) {
  const factor = getFormFactor()
  if (!nativeApp) return isWideLayout()
  return factor === 'tablet' || isWideLayout()
}

export function applyDeviceFormFactorClasses() {
  if (typeof document === 'undefined') return getFormFactor()
  const d = getDeviceInfo()
  const factor = getFormFactor()
  const root = document.documentElement
  root.classList.remove('dgc-form-phone', 'dgc-form-tablet', 'dgc-form-desktop')
  root.classList.add(`dgc-form-${factor}`)
  root.dataset.dgcOs = d.os
  root.dataset.dgcForm = factor
  if (d.isIPad) root.classList.add('dgc-device-ipad')
  if (d.isIPhone) root.classList.add('dgc-device-iphone')
  if (d.isAndroid && d.isTablet) root.classList.add('dgc-device-android-tablet')
  if (d.isAndroid && d.isMobile) root.classList.add('dgc-device-android-phone')
  return factor
}

export function watchDeviceFormFactor(onChange) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => {
    const next = applyDeviceFormFactorClasses()
    onChange?.(next)
  }
  window.addEventListener('resize', handler)
  window.addEventListener('orientationchange', handler)
  handler()
  return () => {
    window.removeEventListener('resize', handler)
    window.removeEventListener('orientationchange', handler)
  }
}