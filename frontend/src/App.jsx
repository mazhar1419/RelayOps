import { useEffect, useState } from 'react'
import './App.css'

import {
  register,
  login,
  getCurrentUser,
  logout,
} from './lib/auth.js'

import {
  listTeams,
  createTeam,
} from './lib/teams.js'

import {
  listIncidents,
  createIncident,
  updateIncident,
} from './lib/incidents.js'

export default function App() {
  // Authentication state
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isRegister, setIsRegister] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Team state
  const [teams, setTeams] = useState([])
  const [teamName, setTeamName] = useState('')
  const [teamsLoading, setTeamsLoading] = useState(false)

  // Incident dashboard state
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [incidentsLoading, setIncidentsLoading] = useState(false)

  const [incidentTitle, setIncidentTitle] = useState('')
  const [incidentDescription, setIncidentDescription] = useState('')
  const [incidentSeverity, setIncidentSeverity] = useState('medium')

  // Shared UI state
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // Check whether the user already has a valid session.
  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const currentUser = await getCurrentUser()

        if (active) {
          setUser(currentUser?.user ?? currentUser)
        }
      } catch {
        if (active) {
          setUser(null)
        }
      } finally {
        if (active) {
          setAuthLoading(false)
        }
      }
    }

    void checkSession()

    return () => {
      active = false
    }
  }, [])

  // Load teams after authentication.
  useEffect(() => {
    if (!user) {
      setTeams([])
      setSelectedTeam(null)
      setIncidents([])
      return
    }

    let active = true

    async function loadTeams() {
      setTeamsLoading(true)
      setError('')

      try {
        const result = await listTeams()

        if (active) {
          setTeams(Array.isArray(result) ? result : [])
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Could not load teams.')
        }
      } finally {
        if (active) {
          setTeamsLoading(false)
        }
      }
    }

    void loadTeams()

    return () => {
      active = false
    }
  }, [user])

  // Register or log in.
  async function handleAuthSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setFormLoading(true)

    try {
      if (isRegister) {
        await register(email.trim(), password)

        // Log in after successful registration.
        const result = await login(email.trim(), password)
        setUser(result?.user ?? result)
        setPassword('')
        setSuccess('Account created successfully.')
      } else {
        const result = await login(email.trim(), password)
        setUser(result?.user ?? result)
        setPassword('')
        setSuccess('Logged in successfully.')
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setFormLoading(false)
    }
  }

  // Log out.
  async function handleLogout() {
    setError('')
    setSuccess('')
    setFormLoading(true)

    try {
      await logout()
      setUser(null)
      setEmail('')
      setPassword('')
      setSelectedTeam(null)
      setIncidents([])
      setSuccess('Logged out successfully.')
    } catch (err) {
      setError(err.message || 'Could not log out.')
    } finally {
      setFormLoading(false)
    }
  }

  // Create a new team.
  async function handleCreateTeam(event) {
    event.preventDefault()

    const name = teamName.trim()

    if (!name) {
      setError('Please enter a team name.')
      return
    }

    setError('')
    setSuccess('')
    setFormLoading(true)

    try {
      const newTeam = await createTeam(name)

      setTeams((previousTeams) => [
        newTeam,
        ...previousTeams.filter(
          (team) => String(team.id) !== String(newTeam.id),
        ),
      ])

      setTeamName('')
      setSuccess(`Team "${newTeam.name}" created successfully.`)
    } catch (err) {
      setError(err.message || 'Could not create team.')
    } finally {
      setFormLoading(false)
    }
  }

  // Open a team's incident dashboard.
  async function openTeam(team) {
    setSelectedTeam(team)
    setIncidents([])
    setError('')
    setSuccess('')
    setIncidentsLoading(true)

    try {
      const result = await listIncidents(team.id)

      setIncidents(Array.isArray(result) ? result : [])
    } catch (err) {
      setError(err.message || 'Could not load incidents.')
    } finally {
      setIncidentsLoading(false)
    }
  }

  // Return to the team list.
  function backToTeams() {
    setSelectedTeam(null)
    setIncidents([])
    setIncidentTitle('')
    setIncidentDescription('')
    setIncidentSeverity('medium')
    setError('')
    setSuccess('')
  }

  // Create an incident for the selected team.
  async function handleCreateIncident(event) {
    event.preventDefault()

    if (!selectedTeam) {
      setError('Please select a team first.')
      return
    }

    const title = incidentTitle.trim()

    if (!title) {
      setError('Incident title is required.')
      return
    }

    setError('')
    setSuccess('')
    setFormLoading(true)

    try {
      await createIncident(selectedTeam.id, {
        title,
        description: incidentDescription.trim(),
        severity: incidentSeverity,
      })

      const result = await listIncidents(selectedTeam.id)
      setIncidents(Array.isArray(result) ? result : [])

      setIncidentTitle('')
      setIncidentDescription('')
      setIncidentSeverity('medium')
      setSuccess('Incident created successfully.')
    } catch (err) {
      setError(err.message || 'Could not create incident.')
    } finally {
      setFormLoading(false)
    }
  }

  // Update an incident's status.
  async function handleIncidentStatusChange(incident, status) {
    if (!selectedTeam) return
    if (status === incident.status) return

    setError('')
    setSuccess('')

    try {
      await updateIncident(
        selectedTeam.id,
        incident.id,
        {
          status,
          version: incident.version,
        },
      )

      const result = await listIncidents(selectedTeam.id)
      setIncidents(Array.isArray(result) ? result : [])
      setSuccess(`Incident #${incident.id} status updated.`)
    } catch (err) {
      setError(
        err.message ||
          'Could not update status. Check the allowed status transition.',
      )
    }
  }

  // Initial session check.
  if (authLoading) {
    return (
      <main className="page">
        <section className="panel">
          <p>Checking your session...</p>
        </section>
      </main>
    )
  }

  // Login and registration screen.
  if (!user) {
    return (
      <main className="page">
        <section className="panel">
          <p className="eyebrow">RELAYOPS</p>

          <h1>{isRegister ? 'Create account' : 'Welcome back'}</h1>

          <p className="subtitle">
            {isRegister
              ? 'Create an account to start coordinating incidents.'
              : 'Sign in to manage your teams and incidents.'}
          </p>

          {error && <p className="error" role="alert">{error}</p>}
          {success && <p className="success" role="status">{success}</p>}

          <form onSubmit={handleAuthSubmit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 12 : undefined}
            />

            <button type="submit" disabled={formLoading}>
              {formLoading
                ? 'Please wait...'
                : isRegister
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          <p className="switch-mode">
            {isRegister
              ? 'Already have an account?'
              : "Don't have an account?"}{' '}

            <button
              type="button"
              className="text-button"
              onClick={() => {
                setIsRegister((previous) => !previous)
                setError('')
                setSuccess('')
              }}
            >
              {isRegister ? 'Sign in' : 'Register'}
            </button>
          </p>
        </section>
      </main>
    )
  }

  // Authenticated application.
  return (
    <main className="page dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">RELAYOPS</p>
          <h1>Incident Coordination</h1>
          <p className="subtitle">
            Manage teams and coordinate incident response.
          </p>
        </div>

        <div className="user-info">
          <span className="user-email">
            {user.email || 'Signed-in user'}
          </span>

          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleLogout()}
            disabled={formLoading}
          >
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {success && <p className="success" role="status">{success}</p>}

      {!selectedTeam ? (
        <>
          <section className="panel dashboard-panel">
            <div className="section-heading">
              <div>
                <h2>Create a team</h2>
                <p className="subtitle">
                  Create a team to organize incident response.
                </p>
              </div>
            </div>

            <form className="team-form" onSubmit={handleCreateTeam}>
              <label htmlFor="team-name">Team name</label>

              <input
                id="team-name"
                type="text"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="e.g. Platform Engineering"
                maxLength={120}
                required
              />

              <button type="submit" disabled={formLoading}>
                {formLoading ? 'Creating...' : 'Create team'}
              </button>
            </form>
          </section>

          <section className="panel dashboard-panel">
            <div className="section-heading">
              <div>
                <h2>Your teams</h2>
                <p className="subtitle">
                  Open a team to view and manage its incidents.
                </p>
              </div>
            </div>

            {teamsLoading ? (
              <p>Loading teams...</p>
            ) : teams.length === 0 ? (
              <p>No teams yet. Create your first team above.</p>
            ) : (
              <div className="incident-list">
                {teams.map((team) => (
                  <article
                    className="incident-card"
                    key={team.id}
                  >
                    <div>
                      <h3>{team.name}</h3>
                      <p className="incident-meta">
                        Team ID: {team.id}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void openTeam(team)}
                    >
                      Open Dashboard
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="panel dashboard-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">TEAM DASHBOARD</p>
                <h2>{selectedTeam.name}</h2>
                <p className="subtitle">
                  Create and manage incidents for this team.
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={backToTeams}
              >
                Back to teams
              </button>
            </div>
          </section>

          <section className="panel dashboard-panel">
            <h2>Create an incident</h2>

            <form onSubmit={handleCreateIncident}>
              <label htmlFor="incident-title">Incident title</label>
              <input
                id="incident-title"
                type="text"
                value={incidentTitle}
                onChange={(event) => setIncidentTitle(event.target.value)}
                placeholder="e.g. API response time increased"
                maxLength={200}
                required
              />

              <label htmlFor="incident-description">
                Description
              </label>
              <textarea
                id="incident-description"
                value={incidentDescription}
                onChange={(event) =>
                  setIncidentDescription(event.target.value)
                }
                placeholder="Describe what happened..."
                rows={4}
              />

              <label htmlFor="incident-severity">Severity</label>
              <select
                id="incident-severity"
                value={incidentSeverity}
                onChange={(event) => setIncidentSeverity(event.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>

              <button type="submit" disabled={formLoading}>
                {formLoading ? 'Creating...' : 'Create incident'}
              </button>
            </form>
          </section>

          <section className="panel dashboard-panel">
            <div className="section-heading">
              <div>
                <h2>Incidents</h2>
                <p className="subtitle">
                  {incidents.length} incident(s) loaded.
                </p>
              </div>

              <button
                type="button"
                className="secondary-button"
                disabled={incidentsLoading}
                onClick={() => void openTeam(selectedTeam)}
              >
                Refresh
              </button>
            </div>

            {incidentsLoading ? (
              <p>Loading incidents...</p>
            ) : incidents.length === 0 ? (
              <p>No incidents found for this team.</p>
            ) : (
              <div className="incident-list">
                {incidents.map((incident) => (
                  <article
                    className="incident-card"
                    key={incident.id}
                  >
                    <div className="incident-details">
                      <p className="incident-id">
                        Incident #{incident.id}
                      </p>

                      <h3>{incident.title}</h3>

                      {incident.description && (
                        <p>{incident.description}</p>
                      )}

                      <div className="incident-meta">
                        <span
                          className={`severity severity-${incident.severity}`}
                        >
                          {incident.severity}
                        </span>

                        <span>
                          Status: {incident.status}
                        </span>
                      </div>
                    </div>

                    <div className="status-control">
                      <label htmlFor={`status-${incident.id}`}>
                        Update status
                      </label>

                      <select
                        id={`status-${incident.id}`}
                        value={incident.status}
                        onChange={(event) =>
                          void handleIncidentStatusChange(
                            incident,
                            event.target.value,
                          )
                        }
                      >
                        <option value="open">Open</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
