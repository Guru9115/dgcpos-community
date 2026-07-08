/**
 * Platform biometrics (Face ID / Touch ID) via WebAuthn.
 * Used for lock screen unlock — credential stored locally on device.
 */

const LS_FACEID_CRED = 'dgc_faceid_credential'
const LS_FACEID_ENABLED = 'dgc_faceid_enabled'

function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBuffer(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function isFaceIdSupported() {
  return typeof window !== 'undefined'
    && window.PublicKeyCredential
    && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
}

export async function canUseFaceId() {
  if (!isFaceIdSupported()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function isFaceIdEnrolled() {
  return localStorage.getItem(LS_FACEID_ENABLED) === 'true'
    && !!localStorage.getItem(LS_FACEID_CRED)
}

export function getBiometricLabel() {
  if (typeof navigator === 'undefined') return 'Face ID'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua)) return 'Face ID'
  if (/Android/.test(ua)) return 'Fingerprint'
  if (/Macintosh|Mac OS/.test(ua)) return 'Touch ID'
  if (/Windows/.test(ua)) return 'Windows Hello'
  return 'Biometrics'
}

export async function enrollFaceId(userLabel = 'dgc-pos-lock') {
  const available = await canUseFaceId()
  if (!available) throw new Error(`${getBiometricLabel()} is not available on this device`)

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = new TextEncoder().encode(userLabel)

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'DGC POS',
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: userLabel,
        displayName: 'DGC POS Lock Screen',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })

  if (!credential?.rawId) throw new Error('Biometric enrollment failed')

  localStorage.setItem(LS_FACEID_CRED, bufferToBase64url(credential.rawId))
  localStorage.setItem(LS_FACEID_ENABLED, 'true')
  return true
}

export async function verifyFaceId() {
  const credId = localStorage.getItem(LS_FACEID_CRED)
  if (!credId || localStorage.getItem(LS_FACEID_ENABLED) !== 'true') {
    throw new Error(`${getBiometricLabel()} is not set up`)
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{
        id: base64urlToBuffer(credId),
        type: 'public-key',
        transports: ['internal'],
      }],
      userVerification: 'required',
      timeout: 60000,
    },
  })

  return !!assertion
}

export function disableFaceId() {
  localStorage.removeItem(LS_FACEID_CRED)
  localStorage.removeItem(LS_FACEID_ENABLED)
}