import { useState } from 'react'
import {
    loginUser,
    loginWithModelGateway,
    registerUser,
} from '../api.js'

export default function LoginPage({ onSignedIn }) {
    const [mode, setMode] = useState('model')
    const [form, setForm] = useState({
        username: '',
        password: '',
        email: '',
        twoFactorCode: '',
    })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    function updateField(key, value) {
        setForm(current => ({ ...current, [key]: value }))
    }

    async function submit(event) {
        event.preventDefault()
        setBusy(true)
        setError('')
        try {
            let payload
            if (mode === 'model') {
                payload = await loginWithModelGateway({
                    username: form.username,
                    password: form.password,
                    twoFactorCode: form.twoFactorCode,
                })
            } else if (mode === 'register') {
                payload = await registerUser({
                    username: form.username,
                    password: form.password,
                    email: form.email,
                })
            } else {
                payload = await loginUser({
                    username: form.username,
                    password: form.password,
                })
            }
            onSignedIn(payload)
        } catch (err) {
            setError(err.message || '登录失败')
        } finally {
            setBusy(false)
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-panel">
                <div className="auth-copy">
                    <div className="section-label">WEBNOVEL PLATFORM</div>
                    <h1>Webnovel Writer</h1>
                    <p>使用模型账号登录。后端会自动准备调用密钥，模型列表和生成请求都从后端代理。</p>
                </div>

                <form className="auth-card" onSubmit={submit}>
                    <div className="segmented-control">
                        <button type="button" className={mode === 'model' ? 'active' : ''} onClick={() => setMode('model')}>
                            模型账号
                        </button>
                        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
                            登录
                        </button>
                        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
                            注册
                        </button>
                    </div>

                    {mode === 'model' ? (
                        <>
                            <label className="form-field">
                                <span>用户名</span>
                                <input
                                    autoComplete="username"
                                    value={form.username}
                                    onChange={event => updateField('username', event.target.value)}
                                />
                            </label>
                            <label className="form-field">
                                <span>双重验证码（如已启用）</span>
                                <input autoComplete="one-time-code" inputMode="numeric" value={form.twoFactorCode} onChange={event => updateField('twoFactorCode', event.target.value)} placeholder="可选" />
                            </label>
                            <label className="form-field">
                                <span>密码</span>
                                <input
                                    type="password"
                                    autoComplete="current-password"
                                    value={form.password}
                                    onChange={event => updateField('password', event.target.value)}
                                />
                            </label>
                        </>
                    ) : (
                        <>
                            <label className="form-field">
                                <span>用户名</span>
                                <input
                                    autoComplete="username"
                                    value={form.username}
                                    onChange={event => updateField('username', event.target.value)}
                                />
                            </label>
                            <label className="form-field">
                                <span>密码</span>
                                <input
                                    type="password"
                                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                    value={form.password}
                                    onChange={event => updateField('password', event.target.value)}
                                />
                            </label>
                            {mode === 'register' ? (
                                <label className="form-field">
                                    <span>邮箱</span>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={event => updateField('email', event.target.value)}
                                        placeholder="可选"
                                    />
                                </label>
                            ) : null}
                        </>
                    )}

                    {error ? <div className="form-error">{error}</div> : null}
                    <button type="submit" className="primary-btn" disabled={busy}>
                        {busy ? '处理中...' : mode === 'register' ? '创建账户' : '进入平台'}
                    </button>
                </form>
            </section>
        </main>
    )
}
