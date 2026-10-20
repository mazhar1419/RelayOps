import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

import { register, login, getCurrentUser, logout } from './lib/auth.js'
import { listTeams, createTeam, rotateWebhookSecret, revokeWebhookSecret } from './lib/teams.js'
import { listIncidents, createIncident, updateIncident } from './lib/incidents.js'

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'incidents', label: 'Incidents', icon: '◈' },
  { id: 'webhooks', label: 'Webhooks', icon: '⌁' },
]

function normalizeUser(result) {
  return result?.user ?? result ?? null
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function StatusPill({ value }) {
  return <span className={`pill pill-${String(value || 'unknown').toLowerCase()}`}>{value || 'unknown'}</span>
}

function BrandMark() {
  return <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">R<span>_</span></span><span className="brand-name">RELAY<span>OPS</span><small>INCIDENT CONTROL SYSTEM</small></span></div>
}

function LoadingScreen() {
  return <main className="boot-screen"><div className="boot-window"><BrandMark /><div className="boot-line"><span className="boot-dot" /> INITIALIZING SECURE SESSION...</div><div className="boot-progress"><span /></div><p>PLEASE STAND BY<span className="cursor">_</span></p></div></main>
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teams, setTeams] = useState([])
  const [teamName, setTeamName] = useState('')
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [incidentsLoading, setIncidentsLoading] = useState(false)
  const [incidentTitle, setIncidentTitle] = useState('')
  const [incidentDescription, setIncidentDescription] = useState('')
  const [incidentSeverity, setIncidentSeverity] = useState('medium')
  const [view, setView] = useState('overview')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [webhookSecret, setWebhookSecret] = useState('')
  const [secretAction, setSecretAction] = useState(false)
  const [copied, setCopied] = useState(false)

  const clearNotices = useCallback(() => {
    setError('')
    setSuccess('')
  }, [])

  useEffect(() => {
    let active = true
    async function checkSession() {
      try {
        const currentUser = await getCurrentUser()
        if (!active) return
        setUser(normalizeUser(currentUser))
        try {
          const result = await listTeams()
          if (active) setTeams(Array.isArray(result) ? result : [])
        } catch (err) {
          if (active) setError(err.message || 'Could not load teams.')
        }
      } catch {
        if (active) setUser(null)
      } finally {
        if (active) setAuthLoading(false)
      }
    }
    void checkSession()
    return () => { active = false }
  }, [])

  const loadIncidents = useCallback(async (team) => {
    if (!team) return
    setIncidentsLoading(true)
    try {
      const result = await listIncidents(team.id)
      setIncidents(Array.isArray(result) ? result : [])
    } catch (err) {
      setError(err.message || 'Could not load incidents.')
    } finally {
      setIncidentsLoading(false)
    }
  }, [])

  const stats = useMemo(() => ({
    total: incidents.length,
    open: incidents.filter((item) => item.status === 'open').length,
    active: incidents.filter((item) => item.status === 'acknowledged').length,
    critical: incidents.filter((item) => item.severity === 'critical' && item.status !== 'resolved').length,
  }), [incidents])

  function changeView(nextView) {
    if (nextView !== 'webhooks') {
      setWebhookSecret('')
      setCopied(false)
    }
    setView(nextView)
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()
    clearNotices()
    setFormLoading(true)
    try {
      const cleanEmail = email.trim().toLowerCase()
      if (isRegister) await register(cleanEmail, password)
      const result = await login(cleanEmail, password)
      setUser(normalizeUser(result))
      const teamResult = await listTeams()
      setTeams(Array.isArray(teamResult) ? teamResult : [])
      setPassword('')
      setSuccess(isRegister
        ? 'Account provisioned. Welcome to the operations room.'
        : 'Authentication accepted. Welcome back.')
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleLogout() {
    clearNotices()
    setFormLoading(true)
    try {
      await logout()
      setUser(null)
      setPassword('')
      setEmail('')
      setSelectedTeam(null)
      setIncidents([])
      setWebhookSecret('')
    } catch (err) {
      setError(err.message || 'Could not sign out.')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleCreateTeam(event) {
    event.preventDefault()
    const name = teamName.trim()
    if (!name) return setError('Enter a team name before continuing.')
    clearNotices()
    setFormLoading(true)
    try {
      const newTeam = await createTeam(name)
      setTeams((current) => [newTeam, ...current.filter((item) => String(item.id) !== String(newTeam.id))])
      setTeamName('')
      setSelectedTeam(newTeam)
      setIncidents([])
      changeView('overview')
      setSuccess(`Workspace created: ${newTeam.name}`)
    } catch (err) {
      setError(err.message || 'Could not create the workspace.')
    } finally {
      setFormLoading(false)
    }
  }

  async function openTeam(team) {
    setSelectedTeam(team)
    changeView('overview')
    setWebhookSecret('')
    setCopied(false)
    clearNotices()
    await loadIncidents(team)
  }

  function backToWorkspaces() {
    setSelectedTeam(null)
    setIncidents([])
    setWebhookSecret('')
    changeView('overview')
    clearNotices()
  }

  async function handleCreateIncident(event) {
    event.preventDefault()
    if (!selectedTeam) return
    const title = incidentTitle.trim()
    if (!title) return setError('Incident title is required.')
    clearNotices()
    setFormLoading(true)
    try {
      await createIncident(selectedTeam.id, {
        title,
        description: incidentDescription.trim(),
        severity: incidentSeverity,
      })
      await loadIncidents(selectedTeam)
      setIncidentTitle('')
      setIncidentDescription('')
      setIncidentSeverity('medium')
      setSuccess('Incident logged and added to the response queue.')
    } catch (err) {
      setError(err.message || 'Could not create incident.')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleIncidentStatusChange(incident, status) {
    if (!selectedTeam || status === incident.status) return
    clearNotices()
    try {
      await updateIncident(selectedTeam.id, incident.id, { status, version: incident.version })
      await loadIncidents(selectedTeam)
      setSuccess(`Incident #${incident.id} status updated.`)
    } catch (err) {
      setError(err.message || 'Status transition rejected. Refresh and try again.')
    }
  }

  async function handleRotateSecret() {
    if (!selectedTeam) return
    clearNotices()
    setSecretAction(true)
    setWebhookSecret('')
    setCopied(false)
    try {
      const result = await rotateWebhookSecret(selectedTeam.id)
      setWebhookSecret(result?.secret || '')
      setSuccess('New webhook secret generated. Copy it now; it will not be shown again.')
    } catch (err) {
      setError(err.message || 'Could not rotate the webhook secret.')
    } finally {
      setSecretAction(false)
    }
  }

  async function handleRevokeSecret() {
    if (!selectedTeam || !window.confirm('Revoke this team webhook secret? Incoming requests using it will stop working.')) return
    clearNotices()
    setSecretAction(true)
    try {
      await revokeWebhookSecret(selectedTeam.id)
      setWebhookSecret('')
      setSuccess('Webhook secret revoked. Requests using the old secret will be rejected.')
    } catch (err) {
      setError(err.message || 'Could not revoke the webhook secret.')
    } finally {
      setSecretAction(false)
    }
  }

  async function handleCopySecret() {
    try {
      await navigator.clipboard.writeText(webhookSecret)
      setCopied(true)
      setSuccess('Secret copied to clipboard. Store it in your provider’s secret manager.')
    } catch {
      setError('Clipboard access was blocked. Select and copy the secret manually.')
    }
  }

  if (authLoading) return <LoadingScreen />

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-art" aria-label="RelayOps incident response system">
          <div className="art-grid" />
          <div className="art-topline"><span>SYS.OPS / 01</span><span>SECURE CHANNEL <i className="signal-dot" /></span></div>
          <div className="art-center">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="radar-core"><span>R</span><i /></div>
            <p className="art-overline">INCIDENT RESPONSE // COORDINATION</p>
            <h2>Stay calm.<br /><em>Restore service.</em></h2>
            <p className="art-copy">One command center for the moments that matter. Track signals, coordinate teams, and get systems back online.</p>
          </div>
          <div className="art-footer"><span>ALL SYSTEMS ARE PEOPLE SYSTEMS.</span><span>© RELAYOPS / EST. 2026</span></div>
        </section>
        <section className="auth-side">
          <div className="auth-mobile-brand"><BrandMark /></div>
          <div className="auth-panel">
            <div className="auth-heading"><span className="section-kicker">OPERATOR ACCESS / 00{isRegister ? '2' : '1'}</span><h1>{isRegister ? 'Create your operator ID' : 'Welcome back, operator.'}</h1><p>{isRegister ? 'Provision an account to open your operations workspace.' : 'Authenticate to return to your incident command center.'}</p></div>
            {error && <div className="notice notice-error" role="alert"><span>!</span>{error}</div>}
            {success && <div className="notice notice-success" role="status"><span>✓</span>{success}</div>}
            <form className="terminal-form" onSubmit={handleAuthSubmit}>
              <label htmlFor="email">EMAIL ADDRESS <span>REQUIRED</span></label>
              <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="operator@company.com" autoComplete="email" maxLength={254} required />
              <label htmlFor="password">PASSPHRASE <span>{isRegister ? '12+ CHARACTERS' : 'CONFIDENTIAL'}</span></label>
              <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isRegister ? 'Create a strong passphrase' : 'Enter your passphrase'} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 12 : 1} maxLength={128} required />
              <button className="button-primary button-full" type="submit" disabled={formLoading}><span>{formLoading ? 'PROCESSING REQUEST…' : isRegister ? 'PROVISION ACCOUNT' : 'ENTER OPERATIONS'}</span><b aria-hidden="true">↗</b></button>
            </form>
            <div className="auth-switch"><span>{isRegister ? 'ALREADY HAVE AN OPERATOR ID?' : 'NEW TO RELAYOPS?'}</span><button type="button" onClick={() => { setIsRegister((value) => !value); clearNotices() }}>{isRegister ? 'SIGN IN' : 'CREATE ACCOUNT'} <b>→</b></button></div>
            <div className="auth-security"><span className="lock-symbol">▣</span><span>SESSION PROTECTED <b>·</b> CSRF VERIFIED <b>·</b> ARGON2 AUTH</span></div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><BrandMark /></div>
        <div className="sidebar-label">COMMAND</div>
        <button className={`side-link ${!selectedTeam ? 'active' : ''}`} type="button" onClick={backToWorkspaces}><span className="nav-icon">▦</span><span>Workspaces</span><kbd>01</kbd></button>
        {selectedTeam && VIEWS.map((item) => <button key={item.id} className={`side-link ${view === item.id ? 'active' : ''}`} type="button" onClick={() => { changeView(item.id); clearNotices(); if (item.id === 'incidents') void loadIncidents(selectedTeam) }}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.id === 'incidents' && <span className="nav-count">{incidents.length}</span>}</button>)}
        <div className="sidebar-divider" />
        <div className="sidebar-label sidebar-label-row"><span>YOUR WORKSPACES</span><span>{teams.length.toString().padStart(2, '0')}</span></div>
        <div className="sidebar-teams">
          {teams.length === 0 ? <p className="sidebar-empty">NO WORKSPACES YET</p> : teams.map((team) => <button key={team.id} type="button" className={`team-nav ${String(selectedTeam?.id) === String(team.id) ? 'selected' : ''}`} onClick={() => void openTeam(team)}><span className="team-monogram">{(team.name || 'T').slice(0, 1).toUpperCase()}</span><span className="team-nav-text"><b>{team.name}</b><small>TEAM-{String(team.id).padStart(4, '0')}</small></span><span className="team-arrow">›</span></button>)}
        </div>
        <div className="sidebar-bottom"><div className="system-status"><span className="signal-dot" /><span><b>SYSTEM NOMINAL</b><small>API LINK ESTABLISHED</small></span><span className="status-pulse" /></div><div className="operator-card"><div className="operator-avatar">{(user.email || 'O').slice(0, 1).toUpperCase()}</div><div className="operator-text"><b>{user.email || 'Operator'}</b><small>AUTHENTICATED USER</small></div><button type="button" title="Sign out" aria-label="Sign out" onClick={() => void handleLogout()} disabled={formLoading}>↗</button></div></div>
      </aside>

      <section className="main-stage">
        <header className="topbar"><div className="breadcrumbs"><span>RELAYOPS</span><b>/</b><span>{selectedTeam ? selectedTeam.name.toUpperCase() : 'WORKSPACE INDEX'}</span>{selectedTeam && <><b>/</b><strong>{view.toUpperCase()}</strong></>}</div><div className="topbar-right"><span className="live-indicator"><i /> LIVE SYSTEM</span><span className="topbar-date">UTC · {new Date().toISOString().slice(0, 10)}</span><button type="button" className="icon-button mobile-signout" title="Sign out" onClick={() => void handleLogout()}>↗</button></div></header>
        <div className="stage-content">
          {error && <div className="notice notice-error global-notice" role="alert"><span>!</span>{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
          {success && <div className="notice notice-success global-notice" role="status"><span>✓</span>{success}<button type="button" onClick={() => setSuccess('')} aria-label="Dismiss message">×</button></div>}

          {!selectedTeam ? (
            <>
              <div className="page-heading"><div><span className="section-kicker">OPERATIONS / WORKSPACE INDEX</span><h1>Command <em>center.</em></h1><p>Choose a workspace or provision a new team to start coordinating response.</p></div><div className="heading-stamp"><span>RO</span><small>BUILD 01.26<br />CONTROL DECK</small></div></div>
              <div className="overview-strip"><div><span className="metric-label">TOTAL WORKSPACES</span><strong>{String(teams.length).padStart(2, '0')}</strong><small>REGISTERED TEAMS</small></div><div><span className="metric-label">ACCESS STATUS</span><strong className="metric-status"><i /> VERIFIED</strong><small>SESSION ACTIVE</small></div><div><span className="metric-label">CONTROL PLANE</span><strong>ONLINE</strong><small>API / DATABASE LINK</small></div></div>
              <div className="content-grid workspace-grid"><section className="panel workspace-panel"><div className="panel-head"><div><span className="section-kicker">01 / WORKSPACE DIRECTORY</span><h2>Your workspaces<span className="heading-count">{teams.length}</span></h2></div><span className="panel-code">IDX:TEAM</span></div>{teams.length === 0 ? <div className="empty-state"><span className="empty-symbol">▦</span><b>NO WORKSPACES DETECTED</b><p>Create your first workspace to begin incident coordination.</p></div> : <div className="workspace-list">{teams.map((team, index) => <article className="workspace-row" key={team.id}><span className="workspace-index">{String(index + 1).padStart(2, '0')}</span><div className="workspace-icon">{(team.name || 'T').slice(0, 1).toUpperCase()}</div><div className="workspace-info"><h3>{team.name}</h3><p>TEAM-{String(team.id).padStart(4, '0')} <span>·</span> {team.role || 'MEMBER'}</p></div><span className="workspace-online"><i /> ACTIVE</span><button className="button-outline" type="button" onClick={() => void openTeam(team)}>OPEN DECK <b>↗</b></button></article>)}</div>}</section>
                <section className="panel create-panel"><div className="panel-head"><div><span className="section-kicker">02 / PROVISIONING</span><h2>New workspace</h2></div><span className="panel-code">NEW:TEAM</span></div><p className="panel-description">Create an isolated team space for your incident response workflow.</p><form className="terminal-form" onSubmit={handleCreateTeam}><label htmlFor="team-name">WORKSPACE NAME <span>MAX 120</span></label><input id="team-name" type="text" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="e.g. Platform Engineering" maxLength={120} required /><button className="button-primary button-full" type="submit" disabled={formLoading}><span>{formLoading ? 'PROVISIONING…' : 'CREATE WORKSPACE'}</span><b>＋</b></button></form><div className="note-box"><span>i</span><p>New workspaces begin with you as the <b>owner</b>. You can use team-scoped webhook secrets to connect monitoring providers.</p></div></section></div>
              <footer className="stage-footer"><span>RELAYOPS OPERATIONS SYSTEM <b>© 2026</b></span><span>BUILT FOR INCIDENTS. DESIGNED FOR RECOVERY.</span></footer>
            </>
          ) : (
            <>
              <div className="page-heading team-page-heading"><div><span className="section-kicker">TEAM-{String(selectedTeam.id).padStart(4, '0')} / {view.toUpperCase()}</span><h1>{selectedTeam.name}<em>.</em></h1><p>Incident response workspace <span className="heading-separator">/</span> <span className="mono-text">CREATED {formatDate(selectedTeam.created_at)}</span></p></div><button className="button-outline back-button" type="button" onClick={backToWorkspaces}>← ALL WORKSPACES</button></div>
              <nav className="view-tabs" aria-label="Workspace sections">{VIEWS.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} type="button" onClick={() => { changeView(item.id); clearNotices(); if (item.id === 'incidents') void loadIncidents(selectedTeam) }}><span>{item.icon}</span>{item.label.toUpperCase()}{item.id === 'incidents' && <b>{incidents.length}</b>}</button>)}</nav>

              {view === 'overview' && <>
                <div className="stats-grid"><div className="stat-card"><span className="metric-label">TOTAL INCIDENTS</span><strong>{String(stats.total).padStart(2, '0')}</strong><small>ALL RECORDED EVENTS</small><span className="stat-glyph">◈</span></div><div className="stat-card"><span className="metric-label">OPEN QUEUE</span><strong>{String(stats.open).padStart(2, '0')}</strong><small>AWAITING ACTION</small><span className="stat-glyph stat-glyph-amber">⌁</span></div><div className="stat-card"><span className="metric-label">ACKNOWLEDGED</span><strong>{String(stats.active).padStart(2, '0')}</strong><small>RESPONSE IN PROGRESS</small><span className="stat-glyph stat-glyph-blue">◉</span></div><div className="stat-card stat-card-critical"><span className="metric-label">CRITICAL ACTIVE</span><strong>{String(stats.critical).padStart(2, '0')}</strong><small>REQUIRES ATTENTION</small><span className="stat-glyph">!</span></div></div>
                <div className="content-grid team-overview-grid"><section className="panel"><div className="panel-head"><div><span className="section-kicker">01 / LATEST SIGNALS</span><h2>Recent incidents</h2></div><button type="button" className="text-link" onClick={() => { changeView('incidents'); void loadIncidents(selectedTeam) }}>VIEW ALL →</button></div>{incidentsLoading ? <div className="empty-state compact"><b>FETCHING INCIDENT FEED…</b></div> : incidents.length === 0 ? <div className="empty-state compact"><span className="empty-symbol">◈</span><b>NO ACTIVE SIGNALS</b><p>Incident activity will appear here when logged.</p></div> : <div className="recent-list">{incidents.slice(0, 5).map((incident) => <article key={incident.id} className="recent-row"><span className={`severity-mark severity-mark-${incident.severity}`} /><div className="recent-info"><b>{incident.title}</b><small>INC-{String(incident.id).padStart(5, '0')} · {formatDate(incident.created_at)}</small></div><StatusPill value={incident.status} /></article>)}</div>}</section><section className="panel quick-panel"><div className="panel-head"><div><span className="section-kicker">02 / QUICK ACTIONS</span><h2>Response tools</h2></div><span className="panel-code">OPS:CMD</span></div><button className="quick-action" type="button" onClick={() => changeView('incidents')}><span className="quick-icon">＋</span><span><b>Log an incident</b><small>Create a new response record</small></span><strong>↗</strong></button><button className="quick-action" type="button" onClick={() => changeView('webhooks')}><span className="quick-icon">⌁</span><span><b>Configure webhooks</b><small>Connect external event sources</small></span><strong>↗</strong></button><div className="team-meta"><span>WORKSPACE ID</span><code>{selectedTeam.id}</code><span>YOUR ROLE</span><code>{(selectedTeam.role || 'member').toUpperCase()}</code></div></section></div>
              </>}

              {view === 'incidents' && <div className="content-grid incidents-layout"><section className="panel create-incident-panel"><div className="panel-head"><div><span className="section-kicker">01 / NEW RECORD</span><h2>Log an incident</h2></div><span className="panel-code">INC:NEW</span></div><form className="terminal-form" onSubmit={handleCreateIncident}><label htmlFor="incident-title">INCIDENT TITLE <span>REQUIRED</span></label><input id="incident-title" type="text" value={incidentTitle} onChange={(event) => setIncidentTitle(event.target.value)} placeholder="e.g. API latency above threshold" maxLength={255} required /><label htmlFor="incident-description">DETAILS <span>OPTIONAL</span></label><textarea id="incident-description" value={incidentDescription} onChange={(event) => setIncidentDescription(event.target.value)} placeholder="What happened? What is affected?" rows={4} maxLength={5000} /><label htmlFor="incident-severity">SEVERITY LEVEL</label><select id="incident-severity" value={incidentSeverity} onChange={(event) => setIncidentSeverity(event.target.value)}><option value="low">LOW — MINOR IMPACT</option><option value="medium">MEDIUM — DEGRADED SERVICE</option><option value="high">HIGH — MAJOR IMPACT</option><option value="critical">CRITICAL — SERVICE DOWN</option></select><button className="button-primary button-full" type="submit" disabled={formLoading}><span>{formLoading ? 'RECORDING…' : 'LOG INCIDENT'}</span><b>＋</b></button></form></section><section className="panel incidents-panel"><div className="panel-head"><div><span className="section-kicker">02 / INCIDENT REGISTER</span><h2>Response queue <span className="heading-count">{incidents.length}</span></h2></div><button type="button" className="button-outline small-button" disabled={incidentsLoading} onClick={() => void loadIncidents(selectedTeam)}>↻ REFRESH</button></div>{incidentsLoading ? <div className="empty-state"><b>SYNCING INCIDENT REGISTER…</b></div> : incidents.length === 0 ? <div className="empty-state"><span className="empty-symbol">◈</span><b>QUEUE EMPTY</b><p>All quiet. Log an incident to begin tracking response.</p></div> : <div className="incident-table-wrap"><table className="incident-table"><thead><tr><th>INCIDENT</th><th>SEVERITY</th><th>STATUS / ACTION</th></tr></thead><tbody>{incidents.map((incident) => <tr key={incident.id}><td><div className="incident-title-cell"><span className={`severity-mark severity-mark-${incident.severity}`} /><div><b>{incident.title}</b><small>INC-{String(incident.id).padStart(5, '0')} · {formatDate(incident.created_at)}</small>{incident.description && <p>{incident.description}</p>}</div></div></td><td><StatusPill value={incident.severity} /></td><td><select aria-label={`Status for incident ${incident.id}`} className={`status-select status-select-${incident.status}`} value={incident.status} onChange={(event) => void handleIncidentStatusChange(incident, event.target.value)}><option value="open">OPEN</option><option value="acknowledged">ACKNOWLEDGED</option><option value="resolved">RESOLVED</option></select></td></tr>)}</tbody></table></div>}</section></div>}

              {view === 'webhooks' && <div className="content-grid webhook-layout"><section className="panel webhook-intro"><div className="panel-head"><div><span className="section-kicker">01 / EVENT INGESTION</span><h2>Webhook gateway</h2></div><span className="panel-code">API:HOOK</span></div><div className="webhook-illustration"><div className="webhook-node">SOURCE</div><div className="webhook-connector"><span>HTTPS / POST</span><i /></div><div className="webhook-node webhook-node-core">RELAYOPS</div><div className="webhook-connector"><span>VALIDATE + DEDUPE</span><i /></div><div className="webhook-node">INCIDENT</div></div><p className="panel-description">Receive external monitoring events and create incidents automatically. Each workspace has its own secret; only its hash is stored by the API.</p><div className="endpoint-box"><span>ENDPOINT</span><code>POST /api/v1/webhooks/{selectedTeam.id}/events</code><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/api/v1/webhooks/${selectedTeam.id}/events`); setSuccess('Endpoint URL copied.') } catch { setError('Could not access clipboard.') } }}>COPY URL</button></div><div className="payload-example"><div><span>REQUEST HEADER</span><code>x-webhook-secret: YOUR_TEAM_SECRET</code></div><div><span>REQUIRED FIELDS</span><code>source · externalEventId · title</code></div><div><span>SUPPORTED SEVERITY</span><code>low · medium · high · critical</code></div></div></section><section className="panel secret-panel"><div className="panel-head"><div><span className="section-kicker">02 / CREDENTIALS</span><h2>Team secret</h2></div><span className="secure-badge"><i /> PRIVATE</span></div><div className="secret-warning"><span>!</span><p><b>Secret visibility is one-time only.</b> Rotate to issue a new secret. The previous secret becomes invalid immediately.</p></div>{webhookSecret ? <div className="secret-reveal"><label htmlFor="new-secret">NEW SECRET — COPY AND STORE IT</label><textarea id="new-secret" readOnly value={webhookSecret} rows={3} onFocus={(event) => event.target.select()} /><button className="button-primary button-full" type="button" onClick={() => void handleCopySecret()}><span>{copied ? 'COPIED TO CLIPBOARD' : 'COPY SECRET'}</span><b>{copied ? '✓' : '▣'}</b></button><p className="secret-note">This secret will disappear from the screen when you navigate away. Store it securely before leaving.</p></div> : <div className="secret-placeholder"><span>••••••••••••••••••••••••••••••••</span><small>SECRET VALUE NOT AVAILABLE FOR DISPLAY</small></div>}<div className="secret-actions"><button type="button" className="button-primary" disabled={secretAction || !['owner', 'admin'].includes(selectedTeam.role)} onClick={() => void handleRotateSecret()}><span>{secretAction ? 'WORKING…' : 'ROTATE SECRET'}</span><b>↻</b></button><button type="button" className="button-danger" disabled={secretAction || !['owner', 'admin'].includes(selectedTeam.role)} onClick={() => void handleRevokeSecret()}>REVOKE SECRET</button></div>{!['owner', 'admin'].includes(selectedTeam.role) && <p className="permission-note">Only workspace owners and admins can manage webhook secrets.</p>}<div className="security-footnote"><span>▣</span><p>Never paste a production secret into source control, logs, issue trackers, or client-side code. Use your provider’s encrypted secret store.</p></div></section></div>}
              <footer className="stage-footer"><span>RELAYOPS OPERATIONS SYSTEM <b>© 2026</b></span><span>TEAM-{String(selectedTeam.id).padStart(4, '0')} <b>·</b> PRIVATE CONTROL SPACE</span></footer>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
