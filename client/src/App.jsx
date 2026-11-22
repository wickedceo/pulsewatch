
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Check,
  Clock3,
  Globe2,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getWebsiteStatus } from './websiteStatus.js';
import './App.css';

const API_URL = '';
const EMPTY_WEBSITES = [];

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [websites, setWebsites] = useState(null);
  const [stats, setStats] = useState({});
  const [history, setHistory] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState(null);
  const [deletingWebsite, setDeletingWebsite] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkingIds, setCheckingIds] = useState([]);
  const [form, setForm] = useState({ name: '', url: '' });

  const loading = websites === null && !error;
  const websiteItems = websites ?? EMPTY_WEBSITES;

  useEffect(() => {
    let active = true;

    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then(async (response) => {
        if (!active) return;

        if (!response.ok) {
          setUser(null);
          return;
        }

        const result = await response.json();

        if (active) {
          setUser(result.data.user);
        }
      })
      .catch(() => {
        if (active) {
          setAuthError('Unable to connect. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (active) {
          setAuthLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/websites`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          setAuthError('Your session has expired. Sign in again to continue.');
          setUser(null);
          setWebsites(null);
          setStats({});
          setHistory({});
          return;
        }

        throw new Error('Could not retrieve your websites.');
      }

      setError('');
      setErrorDismissed(false);

      const result = await response.json();
      const websiteList = result.data || [];

      setWebsites(websiteList);

      const results = await Promise.all(
        websiteList.map(async (website) => {
          try {
            const [statsResponse, historyResponse] = await Promise.all([
              fetch(`${API_URL}/api/monitor/${website.id}/stats`, {
                credentials: 'include',
              }),
              fetch(`${API_URL}/api/monitor/${website.id}/history`, {
                credentials: 'include',
              }),
            ]);

            const statsData = statsResponse.ok
              ? await statsResponse.json()
              : null;

            const historyData = historyResponse.ok
              ? await historyResponse.json()
              : null;

            return {
              id: website.id,
              stats: statsData?.data || null,
              history: historyData?.data || [],
            };
          } catch {
            return {
              id: website.id,
              stats: null,
              history: [],
            };
          }
        })
      );

      const nextStats = {};
      const nextHistory = {};

      results.forEach((item) => {
        nextStats[item.id] = item.stats;
        nextHistory[item.id] = item.history;
      });

      setStats(nextStats);
      setHistory(nextHistory);
    } catch (err) {
      setError(err.message || 'Unable to connect to the API.');
      setErrorDismissed(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setErrorDismissed(false);

    await loadDashboard();

    setRefreshing(false);
  };

  useEffect(() => {
    if (user) {
      void Promise.resolve().then(loadDashboard);
    }
  }, [loadDashboard, user]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthError('');

    try {
      const response = await fetch(`${API_URL}/api/auth/${authMode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authForm.email.trim(),
          password: authForm.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Authentication failed.');
      }

      setUser(result.data.user);
      setAuthForm({ email: '', password: '' });
    } catch (err) {
      setAuthError(err.message || 'Unable to authenticate. Try again.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setAuthError('');

    try {
      const response = await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Unable to end your session.');
      }
    } catch (err) {
      setAuthError(
        err.message ||
        'Unable to contact the server. You have been signed out locally.'
      );
    } finally {
      setUser(null);
      setAuthMode('login');
      setWebsites(null);
      setStats({});
      setHistory({});
    }
  };

  const filteredWebsites = useMemo(() => {
    const query = search.trim().toLowerCase();

    return websiteItems.filter((website) =>
      `${website.name || ''} ${website.url || ''}`
        .toLowerCase()
        .includes(query)
    );
  }, [websiteItems, search]);

  const currentChecks = useMemo(
    () =>
      websiteItems.flatMap((website) =>
        (history[website.id] || []).filter(
          (check) =>
            Number(check.url_generation) ===
            Number(website.current_url_generation)
        )
      ),
    [websiteItems, history]
  );

  const totals = useMemo(() => {
    const latestChecks = websiteItems.map(
      (website) =>
        (history[website.id] || []).find(
          (check) =>
            Number(check.url_generation) ===
            Number(website.current_url_generation)
        )
    );
    const statusCounts = latestChecks
      .map(getWebsiteStatus)
      .reduce(
        (counts, status) => {
          counts[status.className] += 1;
          return counts;
        },
        { online: 0, offline: 0, restricted: 0, error: 0, pending: 0 }
      );
    const serverErrors = latestChecks.filter((check) => {
      const status = Number(check?.status_code);
      return status >= 500 && status < 600;
    }).length;
    const clientErrors = latestChecks.filter((check) => {
      const status = Number(check?.status_code);
      return status >= 400 && status < 500 && ![401, 403, 429].includes(status);
    }).length;

    const uptimeValues = websiteItems
      .map((website) => stats[website.id]?.uptime_percentage)
      .filter((value) => value !== null && value !== undefined)
      .map(Number)
      .filter(Number.isFinite);

    const responseValues = websiteItems
      .map((website) => stats[website.id]?.average_response_time_ms)
      .filter((value) => value !== null && value !== undefined)
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);

    return {
      total: websiteItems.length,
      online: statusCounts.online,
      offline: statusCounts.offline,
      restricted: statusCounts.restricted,
      serverErrors,
      clientErrors,
      pending: statusCounts.pending,
      attention: statusCounts.offline + statusCounts.restricted + statusCounts.error,
      uptime: uptimeValues.length
        ? uptimeValues.reduce((sum, value) => sum + value, 0) /
          uptimeValues.length
        : null,
      response: responseValues.length
        ? responseValues.reduce((sum, value) => sum + value, 0) /
          responseValues.length
        : 0,
    };
  }, [websiteItems, stats, history]);

  const chartData = useMemo(() => {
    return currentChecks
      .sort(
        (a, b) =>
          new Date(a.checked_at).getTime() -
          new Date(b.checked_at).getTime()
      )
      .slice(-30)
      .map((check) => ({
        time: new Date(check.checked_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        response: check.response_time_ms == null
          ? null
          : Number(check.response_time_ms),
      }));
  }, [currentChecks]);

  const openAddWebsite = () => {
    setEditingWebsite(null);
    setForm({ name: '', url: '' });
    setModalError('');
    setNotice('');
    setShowModal(true);
  };

  const openEditWebsite = (website) => {
    setEditingWebsite(website);
    setForm({ name: website.name || '', url: website.url });
    setModalError('');
    setNotice('');
    setShowModal(true);
  };

  const openDeleteWebsite = (website) => {
    setDeleteError('');
    setDeletingWebsite(website);
  };

  const closeDeleteConfirmation = () => {
    if (deleting) return;
    setDeletingWebsite(null);
    setDeleteError('');
  };

  const closeWebsiteModal = () => {
    if (submitting) return;
    setShowModal(false);
    setEditingWebsite(null);
    setForm({ name: '', url: '' });
    setModalError('');
  };

  const handleSaveWebsite = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setErrorDismissed(false);
    setModalError('');
    setNotice('');

    try {
      const response = await fetch(
        editingWebsite
          ? `${API_URL}/api/websites/${editingWebsite.id}`
          : `${API_URL}/api/websites`,
        {
          method: editingWebsite ? 'PUT' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim() || null,
            url: form.url.trim(),
          }),
        }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message ||
          `Could not ${editingWebsite ? 'update' : 'add'} website.`
        );
      }

      setForm({ name: '', url: '' });
      setShowModal(false);
      setEditingWebsite(null);
      setNotice(result.message || 'Website saved successfully.');

      await loadDashboard();
    } catch (err) {
      setModalError(
        err.message || `Could not ${editingWebsite ? 'update' : 'add'} website.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWebsite = async () => {
    if (!deletingWebsite || deleting) return;

    setDeleting(true);
    setDeleteError('');
    setNotice('');

    try {
      const response = await fetch(
        `${API_URL}/api/websites/${deletingWebsite.id}`,
        { method: 'DELETE', credentials: 'include' }
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Could not delete website.');
      }

      setNotice(result.message || 'Website deleted successfully.');
      setDeletingWebsite(null);
      setDeleteError('');
      await loadDashboard();
    } catch (err) {
      setDeleteError(err.message || 'Could not delete website.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCheckWebsite = async (websiteId) => {
    if (checkingIds.includes(websiteId)) return;

    setCheckingIds((previous) => [...previous, websiteId]);
    setError('');
    setErrorDismissed(false);

    try {
      const response = await fetch(
        `${API_URL}/api/monitor/${websiteId}/check`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Website check failed.');
      }

      await loadDashboard();
    } catch (err) {
      setError(err.message || 'Could not check website.');
    } finally {
      setCheckingIds((previous) =>
        previous.filter((id) => id !== websiteId)
      );
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Never';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return 'Never';
    }

    return parsedDate.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  if (authLoading) {
    return (
      <div className="auth-loading" role="status">
        <LoaderCircle size={20} className="spin" />
        <span>Checking your session…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        form={authForm}
        error={authError}
        submitting={authSubmitting}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setAuthError('');
        }}
        onFormChange={setAuthForm}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <div className="app-shell" id="dashboard">
      <header className="site-header">
        <a className="brand" href="#dashboard" aria-label="Pulsewatch home">
          <span className="brand-mark">
            <Activity size={19} strokeWidth={2.2} />
          </span>
          <span className="brand-word">
            pulse<span>watch</span>
          </span>
        </a>

        <nav className="primary-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#dashboard">Overview</a>
          <a className="nav-link" href="#websites">Websites</a>
          <a className="nav-link" href="#activity">Activity</a>
        </nav>

        <div className="header-actions">
          <span className="workspace-label">{user.email}</span>

          <button
            className="icon-button refresh-button"
            onClick={handleRefresh}
            title="Refresh dashboard"
            aria-label="Refresh dashboard"
          >
            <RefreshCw
              size={16}
              className={refreshing ? 'spin' : ''}
            />
          </button>

          <button className="logout-button" onClick={handleLogout}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      <main className="page-content">
        <section className="intro-section">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              MONITORING OVERVIEW
            </div>
            <h1>Know when it matters.</h1>
            <p>A clear view of your websites, uptime, and performance.</p>
          </div>

          <button
            className="primary-button"
            onClick={openAddWebsite}
          >
            <Plus size={17} />
            Add website
          </button>
        </section>

        {error && !errorDismissed && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              onClick={() => setErrorDismissed(true)}
              aria-label="Dismiss error"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {notice && (
          <div className="success-banner" role="status">
            <Check size={16} />
            <span>{notice}</span>
            <button
              onClick={() => setNotice('')}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <section className="hero-grid" aria-label="Availability overview">
          <div className="availability-card">
            <div className="availability-copy">
              <span className="section-kicker">FLEET AVAILABILITY</span>

              <div className="availability-value">
                {loading || !totals.total
                  ? '—'
                  : totals.uptime === null
                    ? '—'
                    : `${totals.uptime.toFixed(2)}%`}
              </div>

              <p>
                {loading
                  ? 'Loading your monitoring data'
                  : totals.total
                    ? totals.uptime === null
                      ? 'Uptime will appear after the first check for each URL'
                      : 'Average uptime across all monitored websites'
                    : 'Add a website to start tracking uptime'}
              </p>

              <div className="availability-caption">
                <span
                  className={`status-dot ${
                    totals.attention ? 'has-issues' : ''
                  }`}
                />

                {loading
                  ? 'Connecting to monitors'
                  : totals.attention
                    ? `${totals.attention} ${
                        totals.attention === 1
                          ? 'website needs'
                          : 'websites need'
                      } attention`
                    : totals.pending
                      ? `${totals.pending} websites awaiting their first check`
                      : totals.total
                        ? 'All monitored websites are online'
                        : 'Monitoring is ready when you are'}
              </div>
            </div>

            <div className="availability-aside">
              <div className="uptime-glyph">
                <Activity size={24} />
              </div>
              <div className="availability-rule" />
              <span>LAST 30 DAYS</span>
            </div>
          </div>

          <section className="system-card" id="status">
            <div className="system-card-heading">
              <div>
                <span className="section-kicker">SYSTEM STATUS</span>
                <h2>Monitoring summary</h2>
              </div>
              <ShieldCheck size={19} />
            </div>

            <div
              className="system-progress-track"
              aria-label={`${totals.online} of ${totals.total} websites online`}
            >
              <span
                className="system-progress-fill"
                style={{
                  width: `${
                    totals.total
                      ? (totals.online / totals.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="system-counts">
              <div>
                <span className="status-dot" />
                <span>Online</span>
                <strong>{loading ? '—' : totals.online}</strong>
              </div>

              <div>
                <span className="status-dot is-offline" />
                <span>Offline</span>
                <strong>{loading ? '—' : totals.offline}</strong>
              </div>

              <div>
                <span className="status-dot is-restricted" />
                <span>Restricted</span>
                <strong>{loading ? '—' : totals.restricted}</strong>
              </div>

              <div>
                <span className="status-dot is-error" />
                <span>HTTP errors</span>
                <strong>
                  {loading
                    ? '—'
                    : totals.serverErrors + totals.clientErrors}
                </strong>
              </div>

              <div>
                <span className="status-dot is-pending" />
                <span>Pending</span>
                <strong>{loading ? '—' : totals.pending}</strong>
              </div>
            </div>

            <div className="system-footnote">
              <Clock3 size={15} />
              Automated checks every 5 minutes
            </div>
          </section>
        </section>

        <section
          className="metrics-grid"
          aria-label="Monitoring statistics"
        >
          <MetricCard
            label="Websites monitored"
            value={loading ? '—' : totals.total}
            detail="Across this workspace"
            icon={<Globe2 size={17} />}
          />

          <MetricCard
            label="Average response"
            value={
              loading || !totals.response
                ? '—'
                : `${Math.round(totals.response)} ms`
            }
            detail="Across recent checks"
            icon={<Zap size={17} />}
          />

          <MetricCard
            label="Current availability"
            value={
              loading || !totals.total
                ? '—'
                : `${totals.online} / ${totals.total}`
            }
            detail="Websites currently online"
            icon={<Check size={17} />}
          />
        </section>

        <section className="activity-section" id="activity">
          <div className="section-heading">
            <div>
              <span className="section-kicker">PERFORMANCE</span>
              <h2>Monitoring activity</h2>
            </div>
            <span className="section-meta">LATEST 30 CHECKS</span>
          </div>

          <div className="chart-card">
            <div className="chart-heading">
              <div>
                <span className="chart-title">Response time</span>
                <span className="chart-subtitle">
                  Response time across recent website checks
                </span>
              </div>
              <span className="chart-unit">MILLISECONDS</span>
            </div>

            {chartData.length ? (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{
                      top: 14,
                      right: 12,
                      left: -12,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid
                      stroke="#292929"
                      strokeDasharray="3 5"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="time"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={30}
                    />

                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tickFormatter={(value) => `${value}`}
                    />

                    <Tooltip
                      contentStyle={{
                        background: '#171717',
                        border: '1px solid #333',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 12,
                      }}
                      formatter={(value) => [
                        `${value} ms`,
                        'Response time',
                      ]}
                    />

                    <Area
                      type="monotone"
                      dataKey="response"
                      stroke="#f4f4f5"
                      strokeWidth={2}
                      fill="#ffffff"
                      fillOpacity={0.06}
                      activeDot={{
                        r: 4,
                        fill: '#fff',
                        stroke: '#111',
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-chart">
                <Activity size={21} />
                <strong>
                  {loading
                    ? 'Loading monitoring activity'
                    : 'No monitoring data yet'}
                </strong>
                <span>
                  {loading
                    ? 'Recent checks will appear here.'
                    : 'Register a website and run checks to see response times.'}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="websites-section" id="websites">
          <div className="section-heading websites-heading">
            <div>
              <span className="section-kicker">YOUR MONITORS</span>
              <h2>Websites</h2>
              <p>Monitor health and performance at a glance.</p>
            </div>

            <div className="website-controls">
              <label className="search-box">
                <Search size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search websites"
                  aria-label="Search websites"
                />
              </label>

              <button
                className="secondary-button"
                onClick={openAddWebsite}
              >
                <Plus size={16} />
                Add website
              </button>
            </div>
          </div>

          <div className="website-list">
            {loading ? (
              <div className="list-message">
                <LoaderCircle size={18} className="spin" />
                Loading websites…
              </div>
            ) : filteredWebsites.length ? (
              filteredWebsites.map((website) => (
                <WebsiteCard
                  key={website.id}
                  website={website}
                  stats={stats[website.id] || {}}
                  latestCheck={(history[website.id] || []).find(
                    (check) =>
                      Number(check.url_generation) ===
                      Number(website.current_url_generation)
                  )}
                  checking={checkingIds.includes(website.id)}
                  onCheck={() => handleCheckWebsite(website.id)}
                  onEdit={() => openEditWebsite(website)}
                  onDelete={() => openDeleteWebsite(website)}
                  formatDate={formatDate}
                />
              ))
            ) : (
              <div className="list-message empty-list">
                <Globe2 size={19} />
                {search
                  ? 'No websites match your search.'
                  : 'No websites yet. Add your first website to get started.'}
              </div>
            )}
          </div>

          <div className="list-footer">
            <span>
              {loading
                ? 'Loading monitors'
                : `${filteredWebsites.length} of ${websiteItems.length} websites`}
            </span>
            <span>Data refreshes automatically</span>
          </div>
        </section>

        <footer className="page-footer">
          <a className="footer-brand" href="#dashboard">PULSEWATCH</a>
          <span>Thoughtful monitoring for the web.</span>
          <a href="#status">
            System status <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>

      {showModal && (
        <div className="modal-backdrop" onClick={closeWebsiteModal}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="website-modal-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">
                  {editingWebsite ? 'UPDATE MONITOR' : 'NEW MONITOR'}
                </span>
                <h2 id="modal-title">
                  {editingWebsite ? 'Edit website' : 'Add a website'}
                </h2>
                <p id="website-modal-description">
                  {editingWebsite
                    ? 'Update the name or monitored URL.'
                    : 'Enter a URL and we’ll start keeping watch.'}
                </p>
              </div>

              <button
                className="icon-button"
                onClick={closeWebsiteModal}
                disabled={submitting}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div className="modal-error" role="alert">{modalError}</div>
            )}

            <form onSubmit={handleSaveWebsite}>
              <label htmlFor="website-name">
                Website name <span>Optional</span>
              </label>

              <input
                id="website-name"
                type="text"
                maxLength={100}
                placeholder="My company website"
                value={form.name}
                onChange={(event) => {
                  setModalError('');
                  setForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }));
                }}
              />

              <label htmlFor="website-url">Website URL</label>

              <input
                id="website-url"
                type="url"
                maxLength={2048}
                placeholder="https://example.com"
                value={form.url}
                onChange={(event) => {
                  setModalError('');
                  setForm((previous) => ({
                    ...previous,
                    url: event.target.value,
                  }));
                }}
                required
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={closeWebsiteModal}
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <LoaderCircle size={16} className="spin" />
                      {editingWebsite ? 'Saving…' : 'Adding…'}
                    </>
                  ) : editingWebsite ? (
                    'Save changes'
                  ) : (
                    <>
                      <Plus size={16} />
                      Add website
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {deletingWebsite && (
        <div
          className="modal-backdrop"
          onClick={closeDeleteConfirmation}
        >
          <section
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">DELETE MONITOR</span>
                <h2 id="delete-title">Delete this website?</h2>
                <p id="delete-description">
                  <strong>{deletingWebsite.name || deletingWebsite.url}</strong>{' '}
                  and all its monitoring history will be permanently deleted.
                  This cannot be undone.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeDeleteConfirmation}
                disabled={deleting}
                aria-label="Close confirmation"
              >
                <X size={18} />
              </button>
            </div>
            {deleteError && (
              <div className="modal-error" role="alert">{deleteError}</div>
            )}
            <div className="modal-actions">
              <button
                className="cancel-button"
                onClick={closeDeleteConfirmation}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="delete-confirm-button"
                onClick={handleDeleteWebsite}
                disabled={deleting}
              >
                {deleting ? (
                  <><LoaderCircle size={15} className="spin" /> Deleting…</>
                ) : (
                  <><Trash2 size={15} /> Delete website</>
                )}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, icon }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div className="metric-content">
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value}</strong>
        <span className="metric-detail">{detail}</span>
      </div>
    </article>
  );
}

function AuthScreen({
  mode,
  form,
  error,
  submitting,
  onModeChange,
  onFormChange,
  onSubmit,
}) {
  const isRegister = mode === 'register';

  return (
    <main className="auth-shell">
      <a
        className="brand auth-brand"
        href="#dashboard"
        aria-label="Pulsewatch"
      >
        <span className="brand-mark">
          <Activity size={19} strokeWidth={2.2} />
        </span>
        <span className="brand-word">
          pulse<span>watch</span>
        </span>
      </a>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-heading">
          <span className="section-kicker">WEBSITE MONITORING</span>
          <h1 id="auth-heading">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h1>
          <p>
            {isRegister
              ? 'Keep every endpoint in view with Pulsewatch.'
              : 'Sign in to see the health of your websites.'}
          </p>
        </div>

        <div className="auth-tabs" aria-label="Account access">
          <button
            type="button"
            aria-pressed={!isRegister}
            className={!isRegister ? 'selected' : ''}
            onClick={() => onModeChange('login')}
          >
            Sign in
          </button>

          <button
            type="button"
            aria-pressed={isRegister}
            className={isRegister ? 'selected' : ''}
            onClick={() => onModeChange('register')}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="auth-email">Email address</label>

          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={form.email}
            onChange={(event) =>
              onFormChange((previous) => ({
                ...previous,
                email: event.target.value,
              }))
            }
            placeholder="you@company.com"
            required
          />

          <label htmlFor="auth-password">Password</label>

          <input
            id="auth-password"
            type="password"
            autoComplete={
              isRegister ? 'new-password' : 'current-password'
            }
            minLength={isRegister ? 12 : 1}
            maxLength={128}
            value={form.password}
            onChange={(event) =>
              onFormChange((previous) => ({
                ...previous,
                password: event.target.value,
              }))
            }
            aria-describedby={
              isRegister ? 'password-hint' : undefined
            }
            required
          />

          {isRegister && (
            <span className="auth-hint" id="password-hint">
              Use at least 12 characters.
            </span>
          )}

          {error && (
            <div
              className="auth-error"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <LoaderCircle size={16} className="spin" />
                Please wait…
              </>
            ) : isRegister ? (
              'Create account'
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="auth-footnote">
          Your account is private. Website monitors and history are only visible to you.
        </p>
      </section>

      <footer className="auth-footer">
        PULSEWATCH <span>·</span> UPTIME, WITHOUT THE GUESSWORK
      </footer>
    </main>
  );
}

function WebsiteCard({
  website,
  stats,
  latestCheck,
  checking,
  onCheck,
  onEdit,
  onDelete,
  formatDate,
}) {
  const status = getWebsiteStatus(latestCheck);

  const uptime = stats.uptime_percentage !== undefined &&
    stats.uptime_percentage !== null
    ? `${Number(stats.uptime_percentage).toFixed(2)}%`
    : '—';

  const response = stats.average_response_time_ms !== undefined &&
    stats.average_response_time_ms !== null
    ? `${Math.round(Number(stats.average_response_time_ms))} ms`
    : '—';

  return (
    <article className="website-card">
      <div className="website-identity">
        <div className="website-icon">
          <Globe2 size={18} />
        </div>

        <div className="website-name">
          <strong>{website.name || website.url}</strong>
          <span>{website.url}</span>
        </div>
      </div>

      <div className="website-status">
        <span className={`status-badge ${status.className}`}>
          <span className="status-dot" />
          {status.label}
        </span>
      </div>

      <div className="website-stat">
        <span>UPTIME</span>
        <strong>{uptime}</strong>
      </div>

      <div className="website-stat">
        <span>AVG. RESPONSE</span>
        <strong>{response}</strong>
      </div>

      <div className="website-stat checked-stat">
        <span>LAST CHECKED</span>
        <strong>
          {formatDate(latestCheck?.checked_at)}
        </strong>
      </div>

      <div className="website-actions">
        <button
          className="check-button"
          onClick={onCheck}
          disabled={checking}
        >
          {checking ? (
            <>
              <LoaderCircle size={15} className="spin" />
              Checking
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              Check now
            </>
          )}
        </button>
        <button
          className="row-action"
          onClick={onEdit}
          aria-label={`Edit ${website.name || website.url}`}
          title="Edit website"
        >
          <Pencil size={14} />
        </button>
        <button
          className="row-action"
          onClick={onDelete}
          aria-label={`Delete ${website.name || website.url}`}
          title="Delete website"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

export default App;
