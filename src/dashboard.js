require('dotenv').config();
const crypto = require('crypto');
const {
  getAllSessions,
  getAllHotLeads,
  getAllCompetitorIntel,
  getAllMessageLogs,
  suppressCompetitorIntel,
} = require('./airtable');

const MY_OFFSET_MS = 8 * 60 * 60 * 1000; // Malaysia is UTC+8, no DST

const validTokens = new Set();

// Auth

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies;
}

function isAuthed(req) {
  const token = parseCookies(req).admin_token;
  return !!token && validTokens.has(token);
}

function requireAdminPage(req, res, next) {
  if (isAuthed(req)) return next();
  res.redirect('/admin/login');
}

function requireAdminApi(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

function handleLoginPage(req, res) {
  res.type('html').send(renderLoginPage());
}

function handleLogin(req, res) {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && password === adminPassword) {
    const token = crypto.randomUUID();
    validTokens.add(token);
    res.setHeader(
      'Set-Cookie',
      `admin_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
    );
    return res.redirect('/admin');
  }
  res.type('html').status(401).send(renderLoginPage('Incorrect password'));
}

// Time helpers (Malaysia local day boundaries)

function toMalaysiaDateStr(isoString) {
  return new Date(new Date(isoString).getTime() + MY_OFFSET_MS).toISOString().slice(0, 10);
}

function isSameMalaysiaDay(isoString, dateStr) {
  return toMalaysiaDateStr(isoString) === dateStr;
}

// Aggregation

async function buildDashboardData() {
  const [sessions, hotLeads, competitorIntel, messageLogs] = await Promise.all([
    getAllSessions(),
    getAllHotLeads(),
    getAllCompetitorIntel(),
    getAllMessageLogs(),
  ]);

  const messagesByFrom = {};
  messageLogs.forEach((r) => {
    const from = r.fields.From;
    if (!from) return;
    messagesByFrom[from] = (messagesByFrom[from] || 0) + 1;
  });
  const distinctConversations = Object.keys(messagesByFrom).length;

  const todayStr = toMalaysiaDateStr(new Date().toISOString());
  const todaysFrom = new Set();
  messageLogs.forEach((r) => {
    if (r.fields.From && isSameMalaysiaDay(r._rawJson.createdTime, todayStr)) {
      todaysFrom.add(r.fields.From);
    }
  });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const hotLeadsThisWeek = hotLeads.filter(
    (r) => new Date(r._rawJson.createdTime).getTime() >= sevenDaysAgo
  ).length;

  const avgMessagesPerConversation =
    distinctConversations > 0 ? messageLogs.length / distinctConversations : 0;

  const conversionRate = sessions.length > 0 ? (hotLeads.length / sessions.length) * 100 : 0;

  const stats = {
    conversationsToday: todaysFrom.size,
    hotLeadsThisWeek,
    avgMessagesPerConversation: Math.round(avgMessagesPerConversation * 10) / 10,
    conversionRate: Math.round(conversionRate * 10) / 10,
  };

  // Line chart: new conversations per day, last 7 days (Session creation = first contact)
  const dayLabels = [];
  const dayCounts = [];
  for (let i = 6; i >= 0; i -= 1) {
    dayLabels.push(toMalaysiaDateStr(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString()));
    dayCounts.push(0);
  }
  sessions.forEach((s) => {
    const idx = dayLabels.indexOf(toMalaysiaDateStr(s._rawJson.createdTime));
    if (idx !== -1) dayCounts[idx] += 1;
  });

  // Bar chart: message count per conversation, top 20
  const perConversation = Object.entries(messagesByFrom)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // Pie chart: session status breakdown
  const statusCounts = {};
  sessions.forEach((s) => {
    const status = s.fields.Status || 'active';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  // Bar chart: top intents/topics
  const topicCounts = {};
  sessions.forEach((s) => {
    const topic = s.fields['Current Topic'] || 'unknown';
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  });
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const hotLeadsTable = hotLeads
    .slice()
    .sort((a, b) => new Date(b._rawJson.createdTime) - new Date(a._rawJson.createdTime))
    .map((r) => ({
      name: r.fields.Name || '',
      phone: r.fields['Phone Number'] || '',
      businessType: r.fields['Business Type'] || '',
      outletCount: r.fields['Outlet Count'] || '',
      currentPOS: r.fields['Current POS'] || '',
      summary: r.fields['Conversation Summary'] || '',
      status: r.fields.Status || '',
      dateCreated: r.fields['Date Created'] || '',
    }));

  const sessionsTable = sessions
    .slice()
    .sort((a, b) => new Date(b.fields['Last Active'] || 0) - new Date(a.fields['Last Active'] || 0))
    .map((r) => ({
      phone: r.fields['Phone Number'] || '',
      topic: r.fields['Current Topic'] || '',
      lastActive: r.fields['Last Active'] || '',
      status: r.fields.Status || 'active',
    }));

  const competitorTable = competitorIntel
    .filter((r) => !r.fields.Suppressed)
    .sort((a, b) => new Date(b._rawJson.createdTime) - new Date(a._rawJson.createdTime))
    .map((r) => ({
      id: r.id,
      competitor: r.fields.Competitor || '',
      category: r.fields.Category || '',
      summary: r.fields.Summary || '',
      dateFetched: r.fields.DateFetched || '',
      status: r.fields.Status || '',
    }));

  const messageLogsTable = messageLogs
    .slice()
    .sort((a, b) => new Date(b._rawJson.createdTime) - new Date(a._rawJson.createdTime))
    .slice(0, 50)
    .map((r) => ({
      from: r.fields.From || '',
      body: r.fields.Body || '',
      to: r.fields.To || '',
    }));

  return {
    stats,
    charts: {
      newConversations: { labels: dayLabels, data: dayCounts },
      messagesPerConversation: {
        labels: perConversation.map(([phone]) => phone.replace('whatsapp:', '')),
        data: perConversation.map(([, count]) => count),
      },
      sessionStatus: {
        labels: Object.keys(statusCounts),
        data: Object.values(statusCounts),
      },
      topTopics: {
        labels: topTopics.map(([topic]) => topic),
        data: topTopics.map(([, count]) => count),
      },
    },
    tables: {
      hotLeads: hotLeadsTable,
      sessions: sessionsTable,
      competitorIntel: competitorTable,
      messageLogs: messageLogsTable,
    },
  };
}

// Route handlers

async function handleDashboardData(req, res) {
  try {
    const data = await buildDashboardData();
    res.json(data);
  } catch (err) {
    console.error(`[dashboard] Failed to build data: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

function handleDashboardPage(req, res) {
  res.type('html').send(renderDashboardPage());
}

async function handleSuppressIntel(req, res) {
  const { recordId } = req.body;
  if (!recordId) {
    return res.status(400).json({ error: 'recordId is required' });
  }
  try {
    await suppressCompetitorIntel(recordId);
    res.json({ status: 'suppressed' });
  } catch (err) {
    console.error(`[dashboard] suppress-intel failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

// HTML

function renderLoginPage(errorMsg) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Pine Labs Malaysia — Admin Login</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { background: #fff; padding: 2.5rem; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); width: 320px; border-top: 4px solid #E31837; }
  h1 { font-size: 1.1rem; color: #E31837; margin: 0 0 1.5rem; }
  input { width: 100%; padding: 0.6rem; margin-bottom: 1rem; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
  button { width: 100%; padding: 0.6rem; background: #E31837; color: #fff; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; }
  button:hover { background: #b91329; }
  .error { color: #E31837; font-size: 0.85rem; margin: -0.5rem 0 1rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>Pine Labs Malaysia — Admin</h1>
    <form method="POST" action="/admin/login">
      ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
      <input type="password" name="password" placeholder="Password" autofocus required>
      <button type="submit">Log in</button>
    </form>
  </div>
</body>
</html>`;
}

function renderDashboardPage() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Pine Labs Malaysia — Admin Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  :root { --red: #E31837; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #f5f5f5; margin: 0; color: #222; }
  header { background: var(--red); color: #fff; padding: 1.25rem 2rem; display: flex; justify-content: space-between; align-items: center; }
  header h1 { font-size: 1.25rem; margin: 0; }
  header button { background: #fff; color: var(--red); border: none; padding: 0.5rem 1rem; border-radius: 4px; font-weight: 600; cursor: pointer; }
  main { padding: 1.5rem 2rem 3rem; }
  section { margin-bottom: 2rem; }
  section h2 { font-size: 1rem; color: var(--red); border-bottom: 2px solid var(--red); padding-bottom: 0.4rem; margin-bottom: 1rem; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
  .stat-card { background: #fff; border-radius: 8px; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,0.08); border-left: 4px solid var(--red); }
  .stat-card .value { font-size: 1.8rem; font-weight: 700; color: var(--red); }
  .stat-card .label { font-size: 0.8rem; color: #666; margin-top: 0.25rem; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1rem; }
  .chart-card { background: #fff; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .chart-card h3 { font-size: 0.85rem; margin: 0 0 0.75rem; color: #444; }
  .chart-card canvas { max-height: 260px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  th, td { text-align: left; padding: 0.6rem 0.8rem; font-size: 0.85rem; border-bottom: 1px solid #eee; }
  th { background: var(--red); color: #fff; font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  tr.highlight { background: #fff9c4; }
  .table-wrap { overflow-x: auto; }
  .suppress-btn { background: var(--red); color: #fff; border: none; padding: 0.3rem 0.7rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
  .suppress-btn:hover { background: #b91329; }
  .empty { color: #999; font-style: italic; padding: 1rem; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>Pine Labs Malaysia — Admin Dashboard</h1>
  <button id="refresh-intel-btn">Refresh Competitor Intel</button>
</header>
<main>

  <section>
    <h2>Analytics Overview</h2>
    <div class="stats">
      <div class="stat-card"><div class="value" id="stat-conversations-today">—</div><div class="label">Conversations today</div></div>
      <div class="stat-card"><div class="value" id="stat-hot-leads-week">—</div><div class="label">Hot leads this week</div></div>
      <div class="stat-card"><div class="value" id="stat-avg-messages">—</div><div class="label">Avg. messages / conversation</div></div>
      <div class="stat-card"><div class="value" id="stat-conversion-rate">—</div><div class="label">Conversion rate</div></div>
    </div>
  </section>

  <section>
    <h2>Graphs</h2>
    <div class="charts">
      <div class="chart-card"><h3>New conversations per day (last 7 days)</h3><canvas id="chart-new-conversations"></canvas></div>
      <div class="chart-card"><h3>Message count per conversation</h3><canvas id="chart-messages-per-conversation"></canvas></div>
      <div class="chart-card"><h3>Session status breakdown</h3><canvas id="chart-session-status"></canvas></div>
      <div class="chart-card"><h3>Top intents / topics</h3><canvas id="chart-top-topics"></canvas></div>
    </div>
  </section>

  <section>
    <h2>Hot Leads</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Phone Number</th><th>Business Type</th><th>Outlet Count</th><th>Current POS</th><th>Conversation Summary</th><th>Status</th><th>Date Created</th></tr></thead>
        <tbody id="hot-leads-body"></tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Active Sessions</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Phone Number</th><th>Current Topic</th><th>Last Active</th><th>Status</th></tr></thead>
        <tbody id="sessions-body"></tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Competitor Intel</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Competitor</th><th>Category</th><th>Summary</th><th>Date Fetched</th><th>Status</th><th></th></tr></thead>
        <tbody id="competitor-intel-body"></tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>Message Logs (last 50)</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>From</th><th>Body</th><th>To</th></tr></thead>
        <tbody id="message-logs-body"></tbody>
      </table>
    </div>
  </section>

</main>

<script>
  const RED = '#E31837';
  const PALETTE = ['#E31837', '#666666', '#F2A900', '#2E7D32', '#1565C0', '#8E24AA'];
  let charts = {};

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function renderTable(bodyId, rows, renderRow) {
    const tbody = document.getElementById(bodyId);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td class="empty" colspan="10">No data</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(renderRow).join('');
  }

  function upsertChart(id, config) {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) {
      charts[id].data = config.data;
      charts[id].update();
    } else {
      charts[id] = new Chart(ctx, config);
    }
  }

  function renderCharts(chartData) {
    upsertChart('chart-new-conversations', {
      type: 'line',
      data: {
        labels: chartData.newConversations.labels,
        datasets: [{ label: 'New conversations', data: chartData.newConversations.data, borderColor: RED, backgroundColor: 'rgba(227,24,55,0.15)', tension: 0.3, fill: true }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    upsertChart('chart-messages-per-conversation', {
      type: 'bar',
      data: {
        labels: chartData.messagesPerConversation.labels,
        datasets: [{ label: 'Messages', data: chartData.messagesPerConversation.data, backgroundColor: RED }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    upsertChart('chart-session-status', {
      type: 'pie',
      data: {
        labels: chartData.sessionStatus.labels,
        datasets: [{ data: chartData.sessionStatus.data, backgroundColor: PALETTE }],
      },
      options: { plugins: { legend: { position: 'bottom' } } },
    });

    upsertChart('chart-top-topics', {
      type: 'bar',
      data: {
        labels: chartData.topTopics.labels,
        datasets: [{ label: 'Sessions', data: chartData.topTopics.data, backgroundColor: '#666666' }],
      },
      options: { plugins: { legend: { display: false } }, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  async function suppressIntel(recordId) {
    await fetch('/admin/suppress-intel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordId }),
    });
    loadData();
  }
  window.suppressIntel = suppressIntel;

  async function refreshIntel() {
    const btn = document.getElementById('refresh-intel-btn');
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
    await fetch('/admin/refresh-intel', { method: 'POST' });
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Refresh Competitor Intel'; }, 3000);
  }
  document.getElementById('refresh-intel-btn').addEventListener('click', refreshIntel);

  async function loadData() {
    const res = await fetch('/admin/data');
    if (res.status === 401) { window.location.href = '/admin/login'; return; }
    const data = await res.json();

    document.getElementById('stat-conversations-today').textContent = data.stats.conversationsToday;
    document.getElementById('stat-hot-leads-week').textContent = data.stats.hotLeadsThisWeek;
    document.getElementById('stat-avg-messages').textContent = data.stats.avgMessagesPerConversation;
    document.getElementById('stat-conversion-rate').textContent = data.stats.conversionRate + '%';

    renderCharts(data.charts);

    renderTable('hot-leads-body', data.tables.hotLeads, (r) => \`<tr>
      <td>\${esc(r.name)}</td><td>\${esc(r.phone)}</td><td>\${esc(r.businessType)}</td>
      <td>\${esc(r.outletCount)}</td><td>\${esc(r.currentPOS)}</td><td>\${esc(r.summary)}</td>
      <td>\${esc(r.status)}</td><td>\${esc(r.dateCreated)}</td>
    </tr>\`);

    renderTable('sessions-body', data.tables.sessions, (r) => {
      const cls = (r.status === 'followed_up' || r.status === 're_engaged') ? ' class="highlight"' : '';
      return \`<tr\${cls}><td>\${esc(r.phone)}</td><td>\${esc(r.topic)}</td><td>\${esc(r.lastActive)}</td><td>\${esc(r.status)}</td></tr>\`;
    });

    renderTable('competitor-intel-body', data.tables.competitorIntel, (r) => \`<tr>
      <td>\${esc(r.competitor)}</td><td>\${esc(r.category)}</td><td>\${esc(r.summary)}</td>
      <td>\${esc(r.dateFetched)}</td><td>\${esc(r.status)}</td>
      <td><button class="suppress-btn" onclick="suppressIntel('\${r.id}')">Suppress</button></td>
    </tr>\`);

    renderTable('message-logs-body', data.tables.messageLogs, (r) => \`<tr>
      <td>\${esc(r.from)}</td><td>\${esc(r.body)}</td><td>\${esc(r.to)}</td>
    </tr>\`);
  }

  loadData();
  setInterval(loadData, 60000);
</script>
</body>
</html>`;
}

module.exports = {
  requireAdminPage,
  requireAdminApi,
  handleLoginPage,
  handleLogin,
  handleDashboardPage,
  handleDashboardData,
  handleSuppressIntel,
};
