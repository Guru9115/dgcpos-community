import { Capacitor } from '@capacitor/core'
import { Printer } from '@capgo/capacitor-printer'

const RECEIPT_PRINT_STYLES = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; padding: 6mm 5mm; background: #fff; color: #000;
         font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.55; }
  @page { size: 80mm auto; margin: 0; }
  @media print { body { padding: 4mm; } }
  img { max-width: 100%; height: auto; object-fit: contain; }
`

export function isNativeApp() {
  if (typeof window !== 'undefined' && window.__DGC_IS_NATIVE__ === true) return true
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Resolve relative image URLs so logos load inside print document */
export function absolutizeHtmlImages(html) {
  const base = window.location.href
  return html.replace(/\ssrc="([^"]+)"/g, (match, src) => {
    if (/^(https?:|data:|blob:|capacitor:|file:)/i.test(src)) return match
    try {
      return ` src="${new URL(src, base).href}"`
    } catch {
      return match
    }
  })
}

export function buildPrintDocument(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>${RECEIPT_PRINT_STYLES}</style>
</head>
<body>${bodyHtml}</body>
</html>`
}

function mountPrintIframe() {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('title', 'dgc-print')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-9999px',
    top: 0,
    width: '1px',
    height: '1px',
    border: 'none',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '2147483646',
  })
  document.body.appendChild(iframe)
  return iframe
}

function printViaIframe(fullHtml, { immediate = false } = {}) {
  const iframe = mountPrintIframe()
  const win = iframe.contentWindow
  const doc = win?.document
  if (!doc) {
    iframe.remove()
    return Promise.reject(new Error('Print frame unavailable'))
  }

  const cleanup = () => setTimeout(() => iframe.remove(), 3000)

  const runPrint = () => {
    try {
      win.focus()
      win.print()
      cleanup()
    } catch (err) {
      cleanup()
      throw err
    }
  }

  doc.open()
  doc.write(fullHtml)
  doc.close()

  if (immediate) {
    try {
      runPrint()
      return Promise.resolve()
    } catch (err) {
      return Promise.reject(err)
    }
  }

  return new Promise((resolve, reject) => {
    const done = () => {
      try {
        runPrint()
        resolve()
      } catch (err) {
        reject(err)
      }
    }

    const imgs = Array.from(doc.images || [])
    if (!imgs.length) {
      setTimeout(done, 500)
      return
    }

    let pending = imgs.length
    const tick = () => {
      pending -= 1
      if (pending <= 0) setTimeout(done, 120)
    }
    imgs.forEach(img => {
      if (img.complete) tick()
      else {
        img.onload = tick
        img.onerror = tick
      }
    })
    setTimeout(done, 2500)
  })
}

function printViaPopup(fullHtml) {
  const win = window.open('', '_blank', 'width=400,height=700,toolbar=0,menubar=0,scrollbars=1')
  if (!win) return false
  win.document.write(fullHtml)
  win.document.close()
  win.focus()
  setTimeout(() => {
    win.print()
    win.close()
  }, 350)
  return true
}

/** Native AirPrint / system print via Capacitor plugin (iOS & Android). */
async function printViaNative(fullHtml, title) {
  await Printer.printHtml({
    name: title || 'Receipt',
    html: fullHtml,
  })
}

async function dispatchPrint(fullHtml, options = {}) {
  const immediate = options.immediate === true
  const title = options.title || 'Receipt'

  if (isNativeApp()) {
    return printViaNative(fullHtml, title)
  }

  if (immediate) {
    return printViaIframe(fullHtml, { immediate: true })
  }
  if (!printViaPopup(fullHtml)) {
    return printViaIframe(fullHtml, { immediate: false })
  }
}

export async function printHtml({ title, bodyHtml, immediate = false }) {
  const doc = buildPrintDocument(title, absolutizeHtmlImages(bodyHtml))
  return dispatchPrint(doc, { immediate, title })
}

/** Build a print-ready HTML document for barcode / product labels. */
export function buildLabelPrintDocument({ title, bodyHtml, pageSize = 'auto', pageMargin = '4mm' }) {
  const safeTitle = String(title || 'Barcode Labels').replace(/[<>&"]/g, '')
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 8px; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    svg { display: block; max-width: 100%; height: auto; }
    @page { size: ${pageSize}; margin: ${pageMargin}; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`
}

/** Print a fully-formed HTML document (e.g. barcode label sheets). */
export async function printDocument(fullHtml, options = {}) {
  return dispatchPrint(fullHtml, options)
}