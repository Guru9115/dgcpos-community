import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { useAuth } from '../store/AuthContext'
import { authAPI, loginPrefs, onboardingAPI, settingsAPI } from '../api'
import { BRAND_LOGO, BRAND_TAGLINE } from '../theme/brand'
import GoogleSignInButton from '../components/GoogleSignInButton'

const MODES = {
    SIGN_IN: 'sign_in',
    FORGOT: 'forgot',
    RESET: 'reset',
}

export default function Login() {
    const { login, googleAuth, mustChangePassword, clearMustChangePassword } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const redirectTo = searchParams.get('redirect') || '/'

    const [mode, setMode] = useState(MODES.SIGN_IN)
    const [loading, setLoading] = useState(false)
    const [shopLogo, setShopLogo] = useState(null)
    const [shopName, setShopName] = useState('Your Store')
    const [isCompactLayout, setIsCompactLayout] = useState(typeof window !== 'undefined' ? window.innerWidth < 980 : false)

    const [showPassword, setShowPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [rememberMe, setRememberMe] = useState(() => loginPrefs.getRememberMe())

    const [signInForm, setSignInForm] = useState(() => ({
        username: loginPrefs.getSavedUsername() || '',
        password: '',
    }))
    const [betaInfo, setBetaInfo] = useState(null)
    const [forgotForm, setForgotForm] = useState({ identifier: '' })
    const [resetForm, setResetForm] = useState({ token: '', newPassword: '', confirmPassword: '' })
    const [forceChangeForm, setForceChangeForm] = useState({ newPassword: '', confirmPassword: '' })
    const [error, setError] = useState('')

    const activeMode = useMemo(() => (mustChangePassword ? 'force_change' : mode), [mode, mustChangePassword])

    const initials = useMemo(() => {
        const parts = (shopName || 'Your Store').trim().split(/\s+/).filter(Boolean)
        const letters = parts.map((w) => w[0]).join('')
        return (letters || 'YS').slice(0, 2).toUpperCase()
    }, [shopName])

    useEffect(() => {
        settingsAPI
            .getAll()
            .then((r) => {
                if (r.data.shop_logo) setShopLogo(r.data.shop_logo)
                if (r.data.shop_name) setShopName(r.data.shop_name)
            })
            .catch(() => { })
    }, [])

    useEffect(() => {
        onboardingAPI.getBetaInfo().then(r => setBetaInfo(r.data)).catch(() => {})
    }, [])

    useEffect(() => {
        const modeParam = (searchParams.get('mode') || '').toLowerCase()
        if (['signup', 'sign_up', 'register'].includes(modeParam)) {
            navigate('/beta', { replace: true })
            return
        }
        if (['forgot', 'forgot_password'].includes(modeParam)) {
            setMode(MODES.FORGOT)
            return
        }
        if (['reset', 'reset_password'].includes(modeParam)) {
            setMode(MODES.RESET)
            const token = searchParams.get('token') || ''
            if (token) setResetForm(f => ({ ...f, token }))
            return
        }
        if (['signin', 'sign_in', 'login'].includes(modeParam)) {
            setMode(MODES.SIGN_IN)
        }
    }, [searchParams, navigate])

    useEffect(() => {
        const onResize = () => setIsCompactLayout(window.innerWidth < 980)
        onResize()
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    const onSignIn = async (e) => {
        e.preventDefault()
        const username = signInForm.username.trim()
        const password = signInForm.password
        if (!username || !password) return

        setLoading(true)
        try {
            await login(username, password, { remember: rememberMe })
            loginPrefs.setSavedUsername(username, rememberMe)
            loginPrefs.setRememberMe(rememberMe)
            setSignInForm((f) => ({ ...f, password: '' }))
            if (!mustChangePassword) {
                toast.success('Welcome back!')
                navigate(redirectTo, { replace: true })
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Sign in failed')
        } finally {
            setLoading(false)
        }
    }

    const onGoogleSignIn = async (credential) => {
        setLoading(true)
        try {
            await googleAuth({ credential })
            toast.success('Welcome back!')
            navigate(redirectTo, { replace: true })
        } catch (err) {
            const msg = err.response?.data?.error || 'Google sign-in failed'
            if (msg.toLowerCase().includes('enrollment') || msg.toLowerCase().includes('beta')) {
                toast.error('New accounts must start at /beta')
                navigate('/beta')
            } else {
                toast.error(msg)
            }
            throw err
        } finally {
            setLoading(false)
        }
    }

    const onForgot = async (e) => {
        e.preventDefault()
        if (!forgotForm.identifier.trim()) return

        setLoading(true)
        try {
            const res = await authAPI.resetPasswordRequest({ identifier: forgotForm.identifier.trim() })
            toast.success(res.data?.message || 'Recovery request submitted successfully.')
            if (res.data?.reset_token) {
                setResetForm(f => ({ ...f, token: res.data.reset_token }))
                setMode(MODES.RESET)
                toast('Dev mode: reset token loaded — set your new password below.', { icon: '🔑' })
            }
        } catch (err) {
            toast.error(err.response?.data?.error || 'Could not submit recovery request')
        } finally {
            setLoading(false)
        }
    }

    const onResetPassword = async (e) => {
        e.preventDefault()
        setError('')
        if (resetForm.newPassword.length < 6) {
            setError('Password must be at least 6 characters.')
            return
        }
        if (resetForm.newPassword !== resetForm.confirmPassword) {
            setError('Passwords do not match.')
            return
        }
        if (!resetForm.token.trim()) {
            setError('Reset token is required.')
            return
        }

        setLoading(true)
        try {
            await authAPI.resetPassword({ token: resetForm.token.trim(), new_password: resetForm.newPassword })
            toast.success('Password reset! You can sign in now.')
            setMode(MODES.SIGN_IN)
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password.')
        } finally {
            setLoading(false)
        }
    }

    const onForcePasswordChange = async (e) => {
        e.preventDefault()
        setError('')

        if (forceChangeForm.newPassword.length < 6) {
            setError('Password must be at least 6 characters.')
            return
        }
        if (forceChangeForm.newPassword !== forceChangeForm.confirmPassword) {
            setError('Passwords do not match.')
            return
        }

        setLoading(true)
        try {
            await authAPI.forceChangePassword({ new_password: forceChangeForm.newPassword })
            clearMustChangePassword()
            toast.success('Password updated successfully!')
            navigate(redirectTo, { replace: true })
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update password.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="dgc-auth-page" style={pageStyle}>
            <div
                className="dgc-auth-shell dgc-liquid-frosted"
                style={{
                ...shellStyle,
                gridTemplateColumns: isCompactLayout ? '1fr' : shellStyle.gridTemplateColumns,
                minHeight: isCompactLayout ? 'auto' : shellStyle.minHeight,
                maxWidth: isCompactLayout ? 560 : shellStyle.maxWidth,
            }}>
                <section
                    className="dgc-auth-left"
                    style={{
                    ...leftPaneStyle,
                    display: isCompactLayout ? 'none' : leftPaneStyle.display,
                }}>
                    <div style={leftBadgeRowStyle}>
                        <span style={leftBadgeStyle}>Live Retail View</span>
                        <span style={leftBadgePillStyle}>+24%</span>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: [0, -5, 0], scale: [1, 1.015, 1] }}
                        transition={{
                            opacity: { duration: 0.5 },
                            y: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
                            scale: { duration: 4.8, repeat: Infinity, ease: 'easeInOut' },
                        }}
                        style={{ position: 'relative', width: 'min(200px, 100%)' }}
                    >
                        <div style={{ position: 'absolute', inset: -12, borderRadius: '50%', background: 'radial-gradient(circle, rgba(11,95,255,0.14) 0%, transparent 70%)', filter: 'blur(8px)' }} />
                        <img
                            src={BRAND_LOGO}
                            alt="DGC POS"
                            style={{ position: 'relative', width: '100%', height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 8px 20px rgba(11,95,255,0.15))' }}
                        />
                    </motion.div>
                    <p style={{ ...leftKickerStyle, marginTop: 4 }}>{BRAND_TAGLINE}</p>

                    <div style={leftBrandRowStyle}>
                        <div style={brandAvatarStyle}>
                            {shopLogo ? (
                                <img src={shopLogo} alt="Store logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <span>{initials}</span>
                            )}
                        </div>
                        <div>
                            <p style={leftKickerStyle}>Your workspace</p>
                            <h1 className="dgc-text-3d" style={leftTitleStyle}>{shopName}</h1>
                            <p style={leftSubStyle}>Command-grade operations for selling, stock, and service.</p>
                        </div>
                    </div>

                    <div>
                        <p style={leftCaptionStyle}>Retail operations platform</p>
                        <h2 className="dgc-text-3d" style={leftHeadingStyle}>Run the store you love.</h2>
                        <p style={leftParagraphStyle}>
                            Manage sales, stock, and staff from one clear dashboard designed for everyday speed.
                        </p>
                    </div>
                </section>

                <section style={{
                    ...rightPaneStyle,
                    gridColumn: isCompactLayout ? '1 / -1' : rightPaneStyle.gridColumn,
                    padding: isCompactLayout ? '28px 22px' : rightPaneStyle.padding,
                }}>
                    <div style={rightHeadStyle}>
                        <motion.img
                            src={BRAND_LOGO}
                            alt="DGC POS"
                            initial={{ opacity: 0, scale: 0.94 }}
                            animate={{ opacity: 1, y: [0, -4, 0], scale: [1, 1.02, 1] }}
                            transition={{
                                opacity: { duration: 0.45 },
                                y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' },
                                scale: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' },
                            }}
                            style={{ width: 148, height: 'auto', objectFit: 'contain', marginBottom: 4, display: isCompactLayout ? 'block' : 'none' }}
                        />
                        <p className="dgc-text-3d-sub" style={rightKickerStyle}>Welcome back</p>
                        <h2 className="dgc-text-3d" style={rightTitleStyle}>
                            {activeMode === MODES.FORGOT
                                    ? 'Reset access to RetailOS'
                                    : activeMode === MODES.RESET
                                    ? 'Choose a new password'
                                    : activeMode === 'force_change'
                                        ? 'Set a new password'
                                        : 'Log in to RetailOS'}
                        </h2>
                        <p style={rightSubStyle}>
                            {activeMode === MODES.FORGOT
                                    ? 'Recover your account with help from your store administrator.'
                                    : activeMode === MODES.RESET
                                        ? 'Enter the reset token from your recovery email or administrator.'
                                        : activeMode === 'force_change'
                                        ? 'Security policy requires a password update before continuing.'
                                        : 'Access your dashboard and keep daily operations moving.'}
                        </p>
                    </div>

                    <div className="dgc-auth-card dgc-liquid-frosted" style={formCardStyle}>
                        {activeMode === MODES.SIGN_IN && (
                            <form onSubmit={onSignIn} style={formStackStyle}>
                                <div>
                                    <label className="input-label">Username or Email</label>
                                    <div style={{ position: 'relative' }}>
                                        <User size={14} style={iconStyle} />
                                        <input
                                            type="text"
                                            value={signInForm.username}
                                            onChange={(e) => setSignInForm((f) => ({ ...f, username: e.target.value }))}
                                            className="input-field"
                                            style={{ ...authInputStyle, paddingLeft: 38 }}
                                            autoComplete="username"
                                            placeholder="Enter username or email"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="input-label">Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={14} style={iconStyle} />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={signInForm.password}
                                            onChange={(e) => setSignInForm((f) => ({ ...f, password: e.target.value }))}
                                            className="input-field"
                                            style={{ ...authInputStyle, paddingLeft: 38, paddingRight: 38 }}
                                            autoComplete="current-password"
                                            placeholder="Enter password"
                                        />
                                        <button type="button" style={toggleStyle} onClick={() => setShowPassword((v) => !v)}>
                                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>

                                <label style={rememberRowStyle}>
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        style={{ width: 14, height: 14 }}
                                    />
                                    <span>Remember me on this device</span>
                                </label>

                                <button type="submit" disabled={loading} className="btn-gold" style={{ width: '100%' }}>
                                    {loading ? 'Signing In...' : 'Sign In'}
                                </button>

                                {(betaInfo?.google_auth_enabled || import.meta.env.VITE_GOOGLE_CLIENT_ID) && (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                            <span style={{ flex: 1, height: 1, background: 'rgba(148,163,184,0.35)' }} />
                                            or
                                            <span style={{ flex: 1, height: 1, background: 'rgba(148,163,184,0.35)' }} />
                                        </div>
                                        <GoogleSignInButton text="signin_with" disabled={loading} onSuccess={onGoogleSignIn} />
                                    </>
                                )}

                                <button type="button" onClick={() => setMode(MODES.FORGOT)} style={textBtnStyle}>
                                    Forgot password?
                                </button>
                                <Link to="/login?mode=signup" style={{ ...textBtnStyle, textAlign: 'center', textDecoration: 'none' }}>
                                    Request beta access
                                </Link>
                                <p style={{ fontSize: '0.68rem', color: '#94a3b8', textAlign: 'center', margin: '8px 0 0', lineHeight: 1.5 }}>
                                    By signing in you agree to our{' '}
                                    <a href="https://dgcpos.net/terms" target="_blank" rel="noreferrer" style={{ color: '#0B5FFF' }}>Terms</a>
                                    {' '}and{' '}
                                    <a href="https://dgcpos.net/privacy" target="_blank" rel="noreferrer" style={{ color: '#0B5FFF' }}>Privacy Policy</a>.
                                </p>
                            </form>
                        )}

                        {activeMode === MODES.RESET && (
                            <form onSubmit={onResetPassword} style={formStackStyle}>
                                <div>
                                    <label className="input-label">Reset Token</label>
                                    <input
                                        type="text"
                                        value={resetForm.token}
                                        onChange={(e) => setResetForm(f => ({ ...f, token: e.target.value }))}
                                        className="input-field"
                                        style={authInputStyle}
                                        placeholder="Paste reset token"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="input-label">New Password</label>
                                    <input
                                        type="password"
                                        value={resetForm.newPassword}
                                        onChange={(e) => setResetForm(f => ({ ...f, newPassword: e.target.value }))}
                                        className="input-field"
                                        style={authInputStyle}
                                        placeholder="At least 6 characters"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="input-label">Confirm Password</label>
                                    <input
                                        type="password"
                                        value={resetForm.confirmPassword}
                                        onChange={(e) => setResetForm(f => ({ ...f, confirmPassword: e.target.value }))}
                                        className="input-field"
                                        style={authInputStyle}
                                        required
                                    />
                                </div>
                                {error && (
                                    <p style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: 'rgba(244,67,54,0.10)', color: '#b42318', fontSize: '0.76rem' }}>
                                        {error}
                                    </p>
                                )}
                                <button type="submit" disabled={loading} className="btn-gold" style={{ width: '100%' }}>
                                    {loading ? 'Resetting...' : 'Reset Password'}
                                </button>
                                <button type="button" onClick={() => setMode(MODES.SIGN_IN)} style={textBtnStyle}>
                                    Back to sign in
                                </button>
                            </form>
                        )}

                        {activeMode === MODES.FORGOT && (
                            <form onSubmit={onForgot} style={formStackStyle}>
                                <div>
                                    <label className="input-label">Username or Email</label>
                                    <div style={{ position: 'relative' }}>
                                        <Mail size={14} style={iconStyle} />
                                        <input
                                            type="text"
                                            value={forgotForm.identifier}
                                            onChange={(e) => setForgotForm({ identifier: e.target.value })}
                                            className="input-field"
                                            style={{ ...authInputStyle, paddingLeft: 38 }}
                                            placeholder="example@shop.com"
                                            required
                                        />
                                    </div>
                                </div>

                                <button type="submit" disabled={loading} className="btn-gold" style={{ width: '100%' }}>
                                    {loading ? 'Submitting...' : 'Get Recovery Help'}
                                </button>

                                <button type="button" onClick={() => setMode(MODES.SIGN_IN)} style={textBtnStyle}>
                                    Back to sign in
                                </button>
                            </form>
                        )}

                        {activeMode === 'force_change' && (
                            <form onSubmit={onForcePasswordChange} style={formStackStyle}>
                                <div>
                                    <label className="input-label">New Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={14} style={iconStyle} />
                                        <input
                                            type={showNewPassword ? 'text' : 'password'}
                                            value={forceChangeForm.newPassword}
                                            onChange={(e) => {
                                                setForceChangeForm((f) => ({ ...f, newPassword: e.target.value }))
                                                setError('')
                                            }}
                                            className="input-field"
                                            style={{ ...authInputStyle, paddingLeft: 38, paddingRight: 38 }}
                                            placeholder="At least 6 characters"
                                            required
                                        />
                                        <button type="button" style={toggleStyle} onClick={() => setShowNewPassword((v) => !v)}>
                                            {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="input-label">Confirm Password</label>
                                    <div style={{ position: 'relative' }}>
                                        <Lock size={14} style={iconStyle} />
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            value={forceChangeForm.confirmPassword}
                                            onChange={(e) => {
                                                setForceChangeForm((f) => ({ ...f, confirmPassword: e.target.value }))
                                                setError('')
                                            }}
                                            className="input-field"
                                            style={{ ...authInputStyle, paddingLeft: 38, paddingRight: 38 }}
                                            placeholder="Re-enter password"
                                            required
                                        />
                                        <button type="button" style={toggleStyle} onClick={() => setShowConfirmPassword((v) => !v)}>
                                            {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <p style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: 'rgba(244,67,54,0.10)', color: '#b42318', fontSize: '0.76rem' }}>
                                        {error}
                                    </p>
                                )}

                                <button type="submit" disabled={loading} className="btn-gold" style={{ width: '100%' }}>
                                    {loading ? 'Updating...' : 'Set New Password'}
                                </button>
                            </form>
                        )}
                    </div>

                    <div style={rightFootStyle}>
                        <span>Protected workspace</span>
                        <span style={{ opacity: 0.5 }}>•</span>
                        <a href="/beta" style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>Public Beta</a>
                        <span style={{ opacity: 0.5 }}>•</span>
                        <span>Built for retail teams</span>
                    </div>
                </section>
            </div>
        </div>
    )
}

const pageStyle = {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom)) 1rem',
    background: 'radial-gradient(circle at 8% 18%, #f8fbff 0%, #e7f1ff 46%, #dbeafe 100%)',
    position: 'relative',
    overflow: 'hidden',
    isolation: 'isolate',
}

const shellStyle = {
    width: '100%',
    maxWidth: 1050,
    minHeight: 620,
    borderRadius: 24,
    background: 'rgba(248, 250, 252, 0.98)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    boxShadow: '0 26px 72px rgba(30, 64, 175, 0.16)',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
}

const leftPaneStyle = {
    gridColumn: '1 / 2',
    background: 'linear-gradient(165deg, #eef5ff 0%, #e2efff 50%, #d9eaff 100%)',
    padding: '34px 32px',
    color: '#1e3a8a',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 24,
}

const leftBadgeRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
}

const leftBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: '0.72rem',
    fontWeight: 700,
    background: 'rgba(255, 255, 255, 0.92)',
    color: '#1e40af',
    border: '1px solid rgba(191, 219, 254, 0.95)',
}

const leftBadgePillStyle = {
    borderRadius: 999,
    border: '1px solid rgba(96, 165, 250, 0.45)',
    padding: '4px 10px',
    fontSize: '0.74rem',
    fontWeight: 700,
    color: '#1d4ed8',
    background: 'rgba(219, 234, 254, 0.95)',
}

const leftBrandRowStyle = {
    display: 'flex',
    gap: 14,
    alignItems: 'center',
}

const brandAvatarStyle = {
    width: 52,
    height: 52,
    borderRadius: 14,
    border: '1px solid rgba(96, 165, 250, 0.32)',
    background: 'linear-gradient(145deg, rgba(219,234,254,0.9) 0%, rgba(191,219,254,0.9) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    color: '#1e3a8a',
    overflow: 'hidden'
}

const leftKickerStyle = {
    margin: 0,
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: 700,
    color: '#3b82f6',
}

const leftTitleStyle = {
    margin: '2px 0 0',
    fontSize: '1.22rem',
    lineHeight: 1.25,
    color: '#0f172a',
    letterSpacing: '-0.01em',
    fontWeight: 700,
}

const leftSubStyle = {
    margin: '6px 0 0',
    fontSize: '0.82rem',
    lineHeight: 1.45,
    color: '#334155',
}

const leftCaptionStyle = {
    margin: 0,
    fontSize: '0.74rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#2563eb',
    fontWeight: 700,
}

const leftHeadingStyle = {
    margin: '10px 0 0',
    fontSize: '1.55rem',
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
    color: '#0f172a',
    fontWeight: 700,
}

const leftParagraphStyle = {
    margin: '12px 0 0',
    fontSize: '0.95rem',
    lineHeight: 1.55,
    color: '#334155',
    maxWidth: 420,
}

const rightPaneStyle = {
    gridColumn: '2 / 3',
    padding: '34px 32px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 16,
}

const rightHeadStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
}

const rightKickerStyle = {
    margin: 0,
    fontSize: '0.76rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#475569',
    fontWeight: 700,
}

const rightTitleStyle = {
    margin: 0,
    fontSize: '1.28rem',
    lineHeight: 1.25,
    color: '#0f172a',
    letterSpacing: '-0.01em',
    fontWeight: 700,
}

const rightSubStyle = {
    margin: 0,
    fontSize: '0.9rem',
    lineHeight: 1.5,
    color: '#475569',
}

const switcherStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 10,
}

const tabStyle = {
    border: '1px solid rgba(30, 64, 175, 0.18)',
    background: 'rgba(248,250,252,0.9)',
    borderRadius: 12,
    padding: '10px 8px',
    color: '#0f172a',
    fontSize: '0.76rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer',
}

const activeTabStyle = {
    border: '1px solid rgba(30, 64, 175, 0.55)',
    background: 'linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(251,191,36,0.2) 100%)',
}

const formCardStyle = {
    borderRadius: 14,
}

const formStackStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
}

const rememberRowStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    color: '#334155',
    fontSize: '0.8rem',
    cursor: 'pointer',
}

const textBtnStyle = {
    border: 'none',
    background: 'transparent',
    color: '#1d4ed8',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
}

const iconStyle = {
    position: 'absolute',
    top: '50%',
    left: 12,
    transform: 'translateY(-50%)',
    color: 'rgba(15, 23, 42, 0.45)',
}

const toggleStyle = {
    position: 'absolute',
    top: '50%',
    right: 10,
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'none',
    color: 'rgba(15, 23, 42, 0.45)',
    cursor: 'pointer',
}

const authInputStyle = {
    color: '#0f172a',
    WebkitTextFillColor: '#0f172a',
    caretColor: '#0f172a',
}

const rightFootStyle = {
    fontSize: '0.78rem',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    textAlign: 'center',
}
