import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../design-system'
import { useAuthStore } from '../stores/auth'
import { identityApi } from '../api/client'
import './Login.css'

export function Login() {
  const [email, setEmail] = useState('admin@mgp.local')
  const [password, setPassword] = useState('Admin123!')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await identityApi.login(email, password)
      const user = {
        ...res.user,
        roles: (res.user.roles as any[]).map((r: any) => typeof r === 'string' ? r : r.name),
      }
      setAuth(res.access_token, user)
      navigate('/')
    } catch (err: any) {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-brand">
          <div className="login-brand-mark">MGP</div>
          <h1 className="login-title">Manufacturing Governance Platform</h1>
          <p className="login-subtitle">Sign in to continue</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-field">
            <label className="form-label required" htmlFor="email">Email address</label>
            <input
              id="email" type="email" className="form-input"
              value={email} onChange={e => setEmail(e.target.value)}
              autoFocus autoComplete="email" required
            />
          </div>

          <div className="form-field">
            <label className="form-label required" htmlFor="password">Password</label>
            <input
              id="password" type="password" className="form-input"
              value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="current-password" required
            />
          </div>

          <Button type="submit" variant="primary" loading={loading} style={{ width: '100%', justifyContent: 'center' }}>
            Sign in
          </Button>
        </form>

        <div className="login-hint">
          <p>Local development accounts:</p>
          <div className="login-accounts">
            {[
              { email: 'admin@mgp.local', role: 'Admin', pw: 'Admin123!' },
              { email: 'operator@mgp.local', role: 'Operator', pw: 'Operator123!' },
              { email: 'qa@mgp.local', role: 'QA Manager', pw: 'QA123!' },
              { email: 'auditor@mgp.local', role: 'Auditor', pw: 'Auditor123!' },
            ].map(a => (
              <button key={a.email} className="login-account-btn" type="button" onClick={() => { setEmail(a.email); setPassword(a.pw) }}>
                {a.role}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
