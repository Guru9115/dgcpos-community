import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  Rocket, Store, BarChart3, Users, ShoppingCart, CheckCircle2,
  ArrowRight, UserPlus, Lock, BedDouble
} from 'lucide-react'
import { onboardingAPI } from '../api'
import { useAuth } from '../store/AuthContext'
import { BRAND_LOGO, BRAND_TAGLINE } from '../theme/brand'

const COUNTRIES = [
  'Nepal', 'India', 'United States', 'United Kingdom', 'Australia',
  'Canada', 'UAE', 'Singapore', 'Germany', 'France', 'Other',
]

const FEATURES = [
  { icon: ShoppingCart, title: 'Point of Sale', desc: 'Barcode scan, multi-payment, receipts' },
  { icon: Store, title: 'Inventory', desc: 'Stock tracking, low-stock alerts, valuation' },
  { icon: Users, title: 'Customer CRM', desc: 'Loyalty tiers, VIP, points redemption' },
  { icon: BarChart3, title: 'Reports & DSR', desc: 'Daily sales register, margins, exports' },
]

const BUSINESS_CATEGORIES = [
  { id: 'General Retail', label: 'General Retail', icon: Store, desc: 'Shops, boutiques, general merchandise' },
  { id: 'Restaurant', label: 'Restaurant', icon: ShoppingCart, desc: 'Dining, cafes, food service' },
  { id: 'Hotel', label: 'Hotel / Lodge', icon: BedDouble, desc: 'Rooms, guesthouses, homestays' },
  { id: 'Supermarket', label: 'Supermarket', icon: BarChart3, desc: 'Grocery, wholesale, bulk retail' },
  { id: 'Pharmacy', label: 'Pharmacy', icon: Users, desc: 'Medicines, OTC, health products' },
]

const emptyForm = () => ({
  first_name: '',
  surname: '',
  email: '',
  country: '',
  mobile: '',
  business_type: 'General Retail',
})

export default function Beta() {
  const { user, signup } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('signup')
  const [enrollmentToken, setEnrollmentToken] = useState('')
  const [leadForm, setLeadForm] = useState(emptyForm)
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' })
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    onboardingAPI.getBetaInfo().then(r => setInfo(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) return
    setEnrollmentToken(token)
    onboardingAPI.validateBetaEnrollment(token)
      .then((res) => {
        const lead = res.data?.lead
        if (!lead?.email) return
        const parts = (lead.contact_name || '').trim().split(/\s+/)
        setLeadForm({
          first_name: parts[0] || '',
          surname: parts.slice(1).join(' ') || '',
          email: lead.email || '',
          country: lead.location || '',
          mobile: lead.phone || '',
          business_type: lead.business_type || 'General Retail',
        })
        setStep('create')
      })
      .catch(() => {
        toast.error('This enrollment link is invalid or expired. Complete signup below.')
        setEnrollmentToken('')
      })
  }, [searchParams])

  const submitSignup = async (e) => {
    e.preventDefault()
    const first = leadForm.first_name.trim()
    const last = leadForm.surname.trim()
    const email = leadForm.email.trim().toLowerCase()
    const country = leadForm.country.trim()
    const mobile = leadForm.mobile.trim()
    const businessType = leadForm.business_type || 'General Retail'

    if (!first || !last) {
      toast.error('First name and surname are required')
      return
    }
    if (!email.includes('@')) {
      toast.error('Enter a valid email address')
      return
    }
    if (!country) {
      toast.error('Select your country')
      return
    }
    if (!mobile || mobile.length < 8) {
      toast.error('Enter a valid mobile number')
      return
    }

    setLoading(true)
    try {
      const res = await onboardingAPI.submitBetaInterest({
        email,
        first_name: first,
        surname: last,
        contact_name: `${first} ${last}`,
        phone: mobile,
        country,
        location: country,
        business_name: businessType === 'Hotel' ? `${first}'s Lodge` : `${first}'s Store`,
        business_type: businessType,
      })
      const token = res.data?.enrollment_token
      if (!token) {
        toast.error('Could not complete enrollment')
        return
      }
      setEnrollmentToken(token)
      setStep('create')
      toast.success('Details saved — create your store admin password')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not submit signup')
    } finally {
      setLoading(false)
    }
  }

  const createWorkspace = async (e) => {
    e.preventDefault()
    if (!enrollmentToken) {
      toast.error('Complete signup details first')
      setStep('signup')
      return
    }
    if (passwordForm.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (!acceptedTerms) {
      toast.error('Please accept the Terms of Use and Privacy Policy')
      return
    }

    const first = leadForm.first_name.trim()
    const last = leadForm.surname.trim()
    const email = leadForm.email.trim().toLowerCase()

    setLoading(true)
    try {
      await signup({
        email,
        password: passwordForm.password,
        full_name: `${first} ${last}`,
        shop_name: leadForm.business_type === 'Hotel' ? `${first}'s Lodge` : `${first}'s Store`,
        business_type: leadForm.business_type || 'General Retail',
        enrollment_token: enrollmentToken,
        country: leadForm.country,
        phone: leadForm.mobile,
      })
      toast.success('Welcome! Your guest workspace is ready — 1 admin + up to 10 staff.')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={heroGlowStyle} />
      <header style={headerStyle}>
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <img src={BRAND_LOGO} alt="DGC POS" style={{ width: 120, height: 'auto', objectFit: 'contain' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#071B52' }}>DGC POS</div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{BRAND_TAGLINE}</div>
          </div>
        </motion.div>
        <Link to="/login" style={ghostBtnStyle}>Sign In</Link>
      </header>

      <main style={mainStyle}>
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={heroStyle}>
          <div style={betaPillStyle}>
            <Rocket size={14} /> Public Beta Signup — App access only
          </div>
          <h1 style={heroTitleStyle}>Create your store workspace</h1>
          <p style={heroSubStyle}>
            {info?.cta || 'Register with your details to get 1 store admin and up to 10 staff seats. Guest demo data only — isolated from production.'}
          </p>
        </motion.section>

        <section style={gridStyle}>
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} style={featureCardStyle}>
              <f.icon size={22} color="#071B52" />
              <h3 style={{ margin: '10px 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>{f.desc}</p>
            </motion.div>
          ))}
        </section>

        <section id="onboard" style={onboardSectionStyle}>
          {step === 'signup' ? (
            <>
              <div>
                <h2 style={sectionTitleStyle}>Step 1 — Your details</h2>
                <p style={sectionSubStyle}>
                  We collect your information before opening the app. Each business gets one store admin and up to 10 staff. Subscriptions are locked during beta.
                </p>
                <ul style={checkListStyle}>
                  {['Name, email, country & mobile required', '1 store admin (owner) per business', 'Up to 10 staff accounts', 'Subscriptions blocked during beta'].map(item => (
                    <li key={item} style={checkItemStyle}>
                      <CheckCircle2 size={16} color="#0B5FFF" /> {item}
                    </li>
                  ))}
                </ul>
              </div>

              <form onSubmit={submitSignup} style={leadFormStyle}>
                <div style={formTitleRowStyle}>
                  <UserPlus size={16} color="#071B52" />
                  <span>Beta signup form</span>
                </div>
                <div style={twoColStyle}>
                  <div>
                    <label style={labelStyle}>First name *</label>
                    <input required value={leadForm.first_name} onChange={e => setLeadForm(f => ({ ...f, first_name: e.target.value }))} style={inputStyle} placeholder="First name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Surname *</label>
                    <input required value={leadForm.surname} onChange={e => setLeadForm(f => ({ ...f, surname: e.target.value }))} style={inputStyle} placeholder="Surname" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input type="email" required value={leadForm.email} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} placeholder="you@yourstore.com" />
                </div>
                <div>
                  <label style={labelStyle}>Country *</label>
                  <select required value={leadForm.country} onChange={e => setLeadForm(f => ({ ...f, country: e.target.value }))} style={inputStyle}>
                    <option value="">Select country</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Mobile number *</label>
                  <input type="tel" required value={leadForm.mobile} onChange={e => setLeadForm(f => ({ ...f, mobile: e.target.value }))} style={inputStyle} placeholder="+977 98XXXXXXXX" inputMode="tel" />
                </div>
                <div>
                  <label style={labelStyle}>Business category *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {BUSINESS_CATEGORIES.map(cat => {
                      const selected = leadForm.business_type === cat.id
                      const Icon = cat.icon
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setLeadForm(f => ({ ...f, business_type: cat.id }))}
                          style={{
                            ...categoryChipStyle,
                            borderColor: selected ? 'rgba(11,95,255,0.45)' : 'rgba(7,27,82,0.12)',
                            background: selected ? 'rgba(11,95,255,0.08)' : '#fff',
                            boxShadow: selected ? '0 4px 12px rgba(11,95,255,0.12)' : 'none',
                          }}
                        >
                          <Icon size={16} color={selected ? '#0B5FFF' : '#64748b'} />
                          <span style={{ fontWeight: 700, fontSize: '0.78rem', color: selected ? '#071B52' : '#475569' }}>{cat.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <button type="submit" disabled={loading} style={{ ...primaryBtnStyle, width: '100%', justifyContent: 'center' }}>
                  {loading ? 'Saving...' : <>Continue to password <ArrowRight size={16} /></>}
                </button>
              </form>
            </>
          ) : (
            <>
              <div>
                <h2 style={sectionTitleStyle}>Step 2 — Create store admin</h2>
                <p style={sectionSubStyle}>
                  Signed up as <strong>{leadForm.first_name} {leadForm.surname}</strong> ({leadForm.email}) from {leadForm.country}. You will be the store admin with up to 10 staff seats.
                </p>
                <button type="button" onClick={() => setStep('signup')} style={{ ...ghostBtnStyle, marginTop: 12, fontSize: '0.78rem' }}>
                  Edit details
                </button>
              </div>

              <form onSubmit={createWorkspace} style={leadFormStyle}>
                <div style={formTitleRowStyle}>
                  <Lock size={16} color="#071B52" />
                  <span>Set admin password</span>
                </div>
                <div>
                  <label style={labelStyle}>Password *</label>
                  <input type="password" required minLength={6} value={passwordForm.password} onChange={e => setPasswordForm(f => ({ ...f, password: e.target.value }))} style={inputStyle} placeholder="At least 6 characters" />
                </div>
                <div>
                  <label style={labelStyle}>Confirm password *</label>
                  <input type="password" required value={passwordForm.confirmPassword} onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))} style={inputStyle} placeholder="Re-enter password" />
                </div>
                <div style={guestCardStyle}>
                  <Users size={18} color="#0B5FFF" />
                  <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>
                    Guest demo workspace with sample data only. Billing and paid subscriptions stay locked until beta ends.
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.78rem', color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} style={{ marginTop: 3 }} />
                  <span>
                    I agree to the{' '}
                    <a href="https://dgcpos.net/terms" target="_blank" rel="noreferrer" style={{ color: '#0B5FFF', fontWeight: 700 }}>Terms of Use</a>
                    {' '}and{' '}
                    <a href="https://dgcpos.net/privacy" target="_blank" rel="noreferrer" style={{ color: '#0B5FFF', fontWeight: 700 }}>Privacy Policy</a>.
                  </span>
                </label>
                <button type="submit" disabled={loading} style={{ ...primaryBtnStyle, width: '100%', justifyContent: 'center' }}>
                  {loading ? 'Creating workspace...' : 'Create workspace & open app'}
                </button>
              </form>
            </>
          )}
        </section>
      </main>

      <footer style={footerStyle}>
        <span>© 2026 DGC POS · All rights reserved</span>
        <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="https://dgcpos.net/terms" target="_blank" rel="noreferrer" style={{ color: '#64748b', textDecoration: 'none' }}>Terms</a>
          <a href="https://dgcpos.net/privacy" target="_blank" rel="noreferrer" style={{ color: '#64748b', textDecoration: 'none' }}>Privacy</a>
          <Link to="/login" style={{ color: '#0B5FFF', textDecoration: 'none', fontWeight: 700 }}>Sign in</Link>
        </span>
      </footer>
    </div>
  )
}

const pageStyle = {
  minHeight: '100dvh',
  background: 'linear-gradient(180deg, #f8fbff 0%, #eef4ff 55%, #e8f0fe 100%)',
  color: '#0f172a',
  position: 'relative',
  overflow: 'hidden',
}

const heroGlowStyle = {
  position: 'absolute', top: -120, right: -80, width: 420, height: 420, borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(11,95,255,0.18) 0%, transparent 70%)', pointerEvents: 'none',
}

const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '20px 28px', maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 2,
}

const mainStyle = { maxWidth: 1100, margin: '0 auto', padding: '0 28px 60px', position: 'relative', zIndex: 2 }
const heroStyle = { padding: '36px 0 28px', maxWidth: 680 }

const betaPillStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
  background: 'rgba(11,95,255,0.08)', color: '#071B52', fontSize: '0.76rem', fontWeight: 700, marginBottom: 16,
}

const heroTitleStyle = {
  margin: 0, fontSize: 'clamp(1.65rem, 4vw, 2.35rem)', lineHeight: 1.12, letterSpacing: '-0.02em', fontWeight: 700,
}

const heroSubStyle = { margin: '14px 0 0', fontSize: '0.95rem', lineHeight: 1.6, color: '#475569', fontWeight: 500 }

const gridStyle = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 36,
}

const featureCardStyle = {
  background: 'rgba(255,255,255,0.94)', border: '1px solid rgba(7,27,82,0.08)',
  borderRadius: 16, padding: 20, boxShadow: '0 8px 24px rgba(7,27,82,0.05)',
}

const onboardSectionStyle = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28, alignItems: 'start',
  background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(7,27,82,0.08)', borderRadius: 20,
  padding: 28, boxShadow: '0 12px 40px rgba(7,27,82,0.06)',
}

const sectionTitleStyle = { margin: 0, fontSize: '1.22rem', fontWeight: 700, color: '#0f172a' }
const sectionSubStyle = { margin: '8px 0 0', color: '#475569', maxWidth: 480, lineHeight: 1.55, fontSize: '0.88rem' }
const checkListStyle = { margin: '16px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }
const checkItemStyle = { display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: '0.84rem', fontWeight: 600 }

const leadFormStyle = { display: 'flex', flexDirection: 'column', gap: 12 }
const twoColStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

const formTitleRowStyle = {
  display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.88rem', marginBottom: 4,
}

const labelStyle = {
  display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: '#64748b', marginBottom: 4,
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(7,27,82,0.12)',
  fontSize: '0.88rem', fontWeight: 600, background: '#fff', color: '#0f172a', boxSizing: 'border-box',
}

const categoryChipStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
  padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(7,27,82,0.12)',
  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease',
}

const guestCardStyle = {
  display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 12,
  background: 'linear-gradient(135deg, rgba(11,95,255,0.06) 0%, rgba(7,27,82,0.03) 100%)',
  border: '1px solid rgba(11,95,255,0.14)',
}

const primaryBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10,
  background: 'linear-gradient(135deg, #071B52 0%, #0B5FFF 100%)', color: '#fff', fontWeight: 700,
  fontSize: '0.82rem', border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(11,95,255,0.22)',
}

const ghostBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10,
  background: 'rgba(255,255,255,0.9)', color: '#071B52', fontWeight: 700, fontSize: '0.82rem',
  textDecoration: 'none', border: '1px solid rgba(7,27,82,0.12)', cursor: 'pointer',
}

const footerStyle = {
  maxWidth: 1100, margin: '0 auto', padding: '24px 28px 40px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
  fontSize: '0.78rem', fontWeight: 600, color: '#64748b', position: 'relative', zIndex: 2,
  borderTop: '1px solid rgba(7,27,82,0.08)',
}