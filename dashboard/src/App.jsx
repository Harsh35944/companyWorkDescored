import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

function getCookie(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function fetchJson(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body != null && headers["Content-Type"] == null) {
    headers["Content-Type"] = "application/json";
  }
  const method = String(options.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrf = getCookie("csrf_token");
    if (csrf && headers["x-csrf-token"] == null) {
      headers["x-csrf-token"] = csrf;
    }
  }
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return data;
}

function avatarUrl(user) {
  if (!user?.id || !user.avatar) return null;
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
}

function maxPoint(points) {
  if (points.length === 0) return 1;
  const m = Math.max(...points.map((p) => p.value));
  return m > 0 ? m : 1;
}

const LANGUAGES = [
  { code: "gu", name: "Gujarati" },
  { code: "hi", name: "Hindi" },
  { code: "en", name: "English" },
  { code: "mr", name: "Marathi" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "pa", name: "Punjabi" },
  { code: "bn", name: "Bengali" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
  { code: "ru", name: "Russian" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
];

function usePathGuildId() {
  const path = window.location.pathname;
  const match = path.match(/^\/dashboard\/manage\/([^/]+)$/);
  return match ? match[1] : null;
}

function AutoTranslateSection({ guildId, items, channels, onReload, setError }) {
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sourceType, setSourceType] = useState("CHANNEL");
  const [targetId, setTargetId] = useState("");
  const [targetLangs, setTargetLangs] = useState(["gu"]);
  const [style, setStyle] = useState("TEXT");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name || !sourceId || !targetId || targetLangs.length === 0) return;
    setBusy(true);
    try {
      await fetchJson(`/api/guilds/${guildId}/auto-translate-configs`, {
        method: "POST",
        body: JSON.stringify({
          name,
          sourceType,
          sourceId,
          style,
          targets: targetLangs.map(lang => ({ targetId, targetLanguage: lang })),
        }),
      });
      setName("");
      setSourceId("");
      setTargetId("");
      setTargetLangs(["gu"]);
      setStyle("TEXT");
      onReload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleLang(code) {
    setTargetLangs(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code],
    );
  }

  async function remove(id) {
    try {
      await fetchJson(`/api/guilds/${guildId}/auto-translate-configs/${id}`, {
        method: "DELETE",
      });
      onReload();
    } catch (e) {
      setError(e.message);
    }
  }

  const channelOptions = useMemo(() => {
    return (channels || []).map(c => (
      <option key={c.id} value={c.id}>
        #{c.name} {c.type === 4 ? "(Category)" : ""}
      </option>
    ));
  }, [channels]);

  return (
    <div className="config-section">
      <h3>Auto Translate Configs</h3>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Config Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. #general to #translated" />
          </div>
          <div className="form-group">
            <label>Source Channel / Category</label>
            <select value={sourceId} onChange={e => setSourceId(e.target.value)}>
              <option value="">Select source...</option>
              <option value="all">All Channels</option>
              {channelOptions}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Target Channel</label>
            <select value={targetId} onChange={e => setTargetId(e.target.value)}>
              <option value="">Select target...</option>
              <option value="all">Same Channel (All)</option>
              {channelOptions}
            </select>
          </div>
          <div className="form-group">
            <label>Translation Style</label>
            <select value={style} onChange={e => setStyle(e.target.value)}>
              <option value="TEXT">Plain Text (Bot Name)</option>
              <option value="WEBHOOK">Mirror User (Name & Avatar)</option>
              <option value="EMBED">Embed Box (Professional)</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Target Languages (Select Multiple)</label>
          <div className="checkbox-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '8px',
            marginTop: '8px',
            maxHeight: '150px',
            overflowY: 'auto',
            padding: '8px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '4px'
          }}>
            {LANGUAGES.map(l => (
              <label key={l.code} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={targetLangs.includes(l.code)}
                  onChange={() => toggleLang(l.code)}
                />
                {l.name}
              </label>
            ))}
          </div>
        </div>

        <button className="btn primary" style={{ marginTop: 16 }} onClick={add} disabled={busy}>Add Config</button>
      </div>

      <div style={{ marginTop: 12 }}>
        {items.map(item => {
          const sName = item.sourceId === "all" ? "All Channels" : (channels?.find(c => c.id === item.sourceId)?.name || item.sourceId);
          const tName = item.targets[0]?.targetId === "all" ? "Same Channel" : (channels?.find(c => c.id === item.targets[0]?.targetId)?.name || item.targets[0]?.targetId);
          const isSChannel = item.sourceId !== "all" && !channels?.find(c => c.id === item.sourceId && c.type === 4);
          const isTChannel = item.targets[0]?.targetId !== "all";
          const langs = item.targets.map(t => t.targetLanguage).join(", ");

          return (
            <div key={item._id} className="config-item">
              <div className="config-item-info">
                <b>{item.name}</b>
                <span className="muted small">
                  {item.sourceId === "all" ? "" : (isSChannel ? "#" : "")}{sName} → {langs} ({isTChannel ? "#" : ""}{tName}) • Style: {item.style}
                </span>
              </div>
              <button className="btn danger sm" onClick={() => remove(item._id)}>Delete</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoleTranslateSection({ guildId, items, roles, onReload, setError }) {
  const [roleId, setRoleId] = useState("");
  const [lang, setLang] = useState("gu");
  const [busy, setBusy] = useState(false);

  const roleOptions = useMemo(() => {
    return [...roles].sort((a,b) => a.name.localeCompare(b.name)).map(r => (
      <option key={r.id} value={r.id}>{r.name}</option>
    ));
  }, [roles]);

  async function add() {
    if (!roleId || !lang) return;
    setBusy(true);
    try {
      await fetchJson(`/api/guilds/${guildId}/role-translate-configs`, {
        method: "POST",
        body: JSON.stringify({ roleId, targetLanguage: lang }),
      });
      setRoleId("");
      onReload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await fetchJson(`/api/guilds/${guildId}/role-translate-configs/${id}`, {
        method: "DELETE",
      });
      onReload();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="config-section">
      <h3>Role Translate Configs</h3>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Role</label>
            <select value={roleId} onChange={e => setRoleId(e.target.value)}>
              <option value="">Select Role...</option>
              {roleOptions}
            </select>
          </div>
          <div className="form-group">
            <label>Target Language</label>
            <select value={lang} onChange={e => setLang(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <button className="btn primary" onClick={add} disabled={busy}>Add Role Config</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {items.map(item => {
          const rName = roles.find(r => r.id === item.roleId)?.name || item.roleId;
          return (
            <div key={item._id} className="config-item">
              <span>Role <b>{rName}</b> → <code>{item.targetLanguage}</code></span>
              <button className="btn danger sm" onClick={() => remove(item._id)}>Delete</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FlagReactionSection({ guildId, config, onReload, setError }) {
  const [busy, setBusy] = useState(false);

  async function toggle(val) {
    setBusy(true);
    try {
      await fetchJson(`/api/guilds/${guildId}/flag-reaction-config`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: val }),
      });
      onReload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="config-section">
      <h3>Flag Reaction Config</h3>
      <label className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Enable translation by flag reaction</span>
        <input type="checkbox" checked={config?.enabled} disabled={busy} onChange={e => toggle(e.target.checked)} />
      </label>
    </div>
  );
}

function TextReplacementSection({ guildId, items, onReload, setError }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!input || !output) return;
    setBusy(true);
    try {
      await fetchJson(`/api/guilds/${guildId}/text-replacements`, {
        method: "POST",
        body: JSON.stringify({ input, output }),
      });
      setInput("");
      setOutput("");
      onReload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await fetchJson(`/api/guilds/${guildId}/text-replacements/${id}`, {
        method: "DELETE",
      });
      onReload();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="config-section">
      <h3>Text Replacements</h3>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="form-row">
          <div className="form-group">
            <label>Find (text)</label>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="hello" />
          </div>
          <div className="form-group">
            <label>Replace with</label>
            <input value={output} onChange={e => setOutput(e.target.value)} placeholder="kem cho" />
          </div>
        </div>
        <button className="btn primary" onClick={add} disabled={busy}>Add Replacement</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {items.map(item => (
          <div key={item._id} className="config-item">
            <span><code>{item.input}</code> → <code>{item.output}</code></span>
            <button className="btn danger sm" onClick={() => remove(item._id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TranslateBanSection({ guildId, banList, users, onReload, setError }) {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!id) return;
    setBusy(true);
    try {
      const next = { ...banList, userIds: [...banList.userIds, id] };
      await fetchJson(`/api/guilds/${guildId}/translate-ban`, {
        method: "PATCH",
        body: JSON.stringify({ userIds: next.userIds }),
      });
      setId("");
      onReload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId) {
    try {
      const next = { ...banList, userIds: banList.userIds.filter(u => u !== userId) };
      await fetchJson(`/api/guilds/${guildId}/translate-ban`, {
        method: "PATCH",
        body: JSON.stringify({ userIds: next.userIds }),
      });
      onReload();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="config-section">
      <h3>Translate Ban (Users)</h3>
      <div className="card" style={{ marginTop: 8 }}>
        <div className="form-group">
          <label>Select User to Ban</label>
          <select value={id} onChange={e => setId(e.target.value)} style={{ marginBottom: 12 }}>
            <option value="">-- Choose User --</option>
            {users.map(u => (
              <option key={u.userId} value={u.userId}>{u.username} ({u.userId})</option>
            ))}
          </select>
          <label>Or Enter User ID</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ flex: 1 }} value={id} onChange={e => setId(e.target.value)} placeholder="User Snowflake" />
            <button className="btn primary" onClick={add} disabled={busy}>Add to Ban List</button>
          </div>
        </div>
        <div className="tag-list" style={{ marginTop: 12 }}>
          {banList.userIds.map(uid => {
            const user = users.find(u => u.userId === uid);
            return (
              <div key={uid} className="tag">
                <span>{user ? user.username : uid}</span>
                <button onClick={() => remove(uid)} title="Unban">×</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UserUsageSection({ users }) {
  if (!users || users.length === 0) {
    return (
      <section className="card">
        <h3>User Usage</h3>
        <p className="muted">No user data recorded yet.</p>
      </section>
    );
  }
  return (
    <section className="card">
      <h3>User Usage (Top 20)</h3>
      <p className="muted small">Characters translated per user in this server.</p>
      <div className="user-usage-list" style={{ marginTop: 12 }}>
        {users.map((u) => (
          <div key={u.userId} className="config-item" style={{ padding: "8px 12px" }}>
            <div className="config-item-info" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {u.avatar ? (
                <img src={`https://cdn.discordapp.com/avatars/${u.userId}/${u.avatar}.png`} alt="" className="avatar tiny" />
              ) : (
                <div className="avatar tiny placeholder" />
              )}
              <div>
                <b>{u.username}</b>
                <span className="muted small" style={{ display: "block" }}>{u.userId}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <b>{u.translatedCharacters.toLocaleString()}</b>
              <span className="muted small" style={{ display: "block" }}>chars</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewPage({ me, onLogout, guildId, setError }) {
  const [overview, setOverview] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState("24h");
  const [metric, setMetric] = useState("characters");
  const [loading, setLoading] = useState(true);
  const [featureSettings, setFeatureSettings] = useState(null);
  const [savingFeatureKey, setSavingFeatureKey] = useState(null);
  const [autoConfigs, setAutoConfigs] = useState([]);
  const [roleConfigs, setRoleConfigs] = useState([]);
  const [flagConfig, setFlagConfig] = useState(null);
  const [replacements, setReplacements] = useState([]);
  const [banList, setBanList] = useState({ userIds: [], roleIds: [] });
  const [userStats, setUserStats] = useState([]);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, an, fs, ac, rc, fc, tr, bl, us, ch, rl] = await Promise.all([
        fetchJson(`/api/guilds/${guildId}/overview`),
        fetchJson(
          `/api/guilds/${guildId}/analytics?period=${period}&metric=${metric}`,
        ),
        fetchJson(`/api/guilds/${guildId}/features`),
        fetchJson(`/api/guilds/${guildId}/auto-translate-configs`),
        fetchJson(`/api/guilds/${guildId}/role-translate-configs`),
        fetchJson(`/api/guilds/${guildId}/flag-reaction-config`),
        fetchJson(`/api/guilds/${guildId}/text-replacements`),
        fetchJson(`/api/guilds/${guildId}/translate-ban`),
        fetchJson(`/api/guilds/${guildId}/user-stats`),
        fetchJson(`/api/guilds/${guildId}/channels`),
        fetchJson(`/api/guilds/${guildId}/roles`),
      ]);
      setOverview(ov);
      setAnalytics(an);
      setFeatureSettings(
        fs?.settings?.features || {
          translationByFlagEnabled: false,
          autoTranslateEnabled: false,
          roleTranslateEnabled: false,
          autoEraseEnabled: false,
          autoReactEnabled: false,
          ttsEnabled: false,
        },
      );
      setAutoConfigs(ac?.items || []);
      setRoleConfigs(rc?.items || []);
      setFlagConfig(fc?.item || { enabled: false, style: "TEXT" });
      setReplacements(tr?.items || []);
      setBanList(bl?.item || { userIds: [], roleIds: [] });
      setUserStats(us?.users || []);
      setChannels(ch?.channels || []);
      setRoles(rl?.roles || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [guildId, metric, period, setError]);

  async function toggleFeature(key, nextValue) {
    if (!featureSettings) return;
    setSavingFeatureKey(key);
    setError(null);
    const prev = featureSettings;
    const next = { ...prev, [key]: nextValue };
    setFeatureSettings(next);
    try {
      await fetchJson(`/api/guilds/${guildId}/features`, {
        method: "PATCH",
        body: JSON.stringify({ features: { [key]: nextValue } }),
      });
    } catch (e) {
      setFeatureSettings(prev);
      setError(e.message);
    } finally {
      setSavingFeatureKey(null);
    }
  }

  async function updateGlobalSetting(key, value) {
    setSavingFeatureKey(key);
    setError(null);
    try {
      await fetchJson(`/api/guilds/${guildId}/features`, {
        method: "PATCH",
        body: JSON.stringify({ [key]: value }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingFeatureKey(null);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  const av = avatarUrl(me);
  const points = analytics?.points || [];
  const peak = maxPoint(points);

  const quotaPercent = useMemo(() => {
    if (!overview?.quota?.maxCharacters) return 0;
    return Math.min(
      100,
      Math.round((overview.quota.usedCharacters / overview.quota.maxCharacters) * 100),
    );
  }, [overview]);

  return (
    <div className="shell">
      <header className="topbar">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            window.history.pushState({}, "", "/");
            window.dispatchEvent(new Event("popstate"));
          }}
        >
          Back
        </button>
        <div className="topbar-right">
          <div className="mini-user">
            {av ? <img src={av} alt="" className="avatar tiny" /> : null}
            <span>{me.username}</span>
          </div>
          <button type="button" className="btn ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      {loading && !overview ? <p className="muted">Loading overview</p> : null}

      {overview ? (
        <>
          <section className="card overview-header">
            <div className="guild-head">
              {overview.guild.iconUrl ? (
                <img src={overview.guild.iconUrl} alt="" className="avatar lg" />
              ) : (
                <div className="avatar lg placeholder" />
              )}
              <div>
                <h2>{overview.guild.name}</h2>
                <p className="muted small">ID: {overview.guild.id}</p>
                <span className="pill">{overview.guild.plan} plan</span>
              </div>
            </div>
          </section>

          <section className="stats-grid">
            <article className="card stat-box"><b>{overview.counts.members}</b><span>members</span></article>
            <article className="card stat-box"><b>{overview.counts.channels}</b><span>channels</span></article>
            <article className="card stat-box"><b>{overview.counts.categories}</b><span>categories</span></article>
            <article className="card stat-box"><b>{overview.counts.roles}</b><span>roles</span></article>
          </section>

          <section className="grid overview-two">
            <article className="card">
              <h3>Used Characters</h3>
              <p className="muted small">
                {overview.quota.usedCharacters.toLocaleString()} / {overview.quota.maxCharacters.toLocaleString()}
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${quotaPercent}%` }} />
              </div>
            </article>

            <article className="card summary-box">
              <div><b>{overview.summary.translatedCharacters.toLocaleString()}</b><span>Translated Characters</span></div>
              <div><b>{overview.summary.translatedMessages.toLocaleString()}</b><span>Translated Messages</span></div>
            </article>
          </section>

          <section className="card">
            <h3>Feature Toggles</h3>
            <p className="muted small">Enable or disable translation features for this server.</p>
            <div className="grid" style={{ marginTop: 12 }}>
              {[
                ["autoTranslateEnabled", "Automatic Translation"],
                ["roleTranslateEnabled", "Role Translation"],
                ["translationByFlagEnabled", "Translation by Flag"],
                ["autoReactEnabled", "Auto-React (Flags)"],
                ["autoEraseEnabled", "Auto-Erase"],
                ["ttsEnabled", "Text-to-Speech (Audio)"],
              ].map(([key, label]) => (
                <label key={key} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(featureSettings?.[key])}
                      disabled={savingFeatureKey === key}
                      onChange={(e) => toggleFeature(key, e.target.checked)}
                    />
                  </div>
                </label>
              ))}
            </div>

            <div className="form-row" style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
              <div className="form-group">
                <label>Auto-Erase Mode</label>
                <select
                  value={overview?.settings?.autoEraseMode || "ONLY_FROM_ORIGINAL"}
                  onChange={(e) => updateGlobalSetting("autoEraseMode", e.target.value)}
                  disabled={savingFeatureKey === "autoEraseMode"}
                >
                  <option value="ONLY_FROM_ORIGINAL">Only original message</option>
                  <option value="ALL">All messages (original + translations)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Default Translation Style</label>
                <select
                  value={overview?.settings?.defaultStyle || "TEXT"}
                  onChange={(e) => updateGlobalSetting("defaultStyle", e.target.value)}
                  disabled={savingFeatureKey === "defaultStyle"}
                >
                  <option value="TEXT">Plain Text</option>
                  <option value="EMBED">Discord Embed</option>
                  <option value="WEBHOOK">Webhook (User Imitation)</option>
                </select>
              </div>
            </div>
          </section>

          <div className="config-grid">
            <AutoTranslateSection guildId={guildId} items={autoConfigs} channels={channels} onReload={load} setError={setError} />
            <RoleTranslateSection
              guildId={guildId}
              items={roleConfigs}
              roles={roles}
              onReload={load}
              setError={setError}
            />
          </div>

          <div className="config-grid">
            <FlagReactionSection guildId={guildId} config={flagConfig} onReload={load} setError={setError} />
            <TextReplacementSection guildId={guildId} items={replacements} onReload={load} setError={setError} />
          </div>

          <TranslateBanSection
            guildId={guildId}
            banList={banList}
            users={userStats}
            onReload={load}
            setError={setError}
          />

          <UserUsageSection users={userStats} />

          <section className="card">
            <div className="filters">
              <label>
                Metric
                <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                  <option value="characters">Characters</option>
                  <option value="messages">Messages</option>
                </select>
              </label>

              <label>
                Period
                <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </label>

              <button type="button" className="btn accent" onClick={load}>Refresh</button>
            </div>

            <div className="chart-wrap">
              {points.length === 0 ? (
                <p className="muted">No data available for selected period.</p>
              ) : (
                <div className="bars">
                  {points.map((p) => (
                    <div key={`${p.ts}`} className="bar-col" title={`${p.ts}: ${p.value}`}>
                      <div className="bar" style={{ height: `${Math.max(6, (p.value / peak) * 180)}px` }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyGuildId, setBusyGuildId] = useState(null);
  const [pathGuildId, setPathGuildId] = useState(() => usePathGuildId());

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await fetchJson("/api/me");
      setMe(profile);
      const g = await fetchJson("/api/me/guilds");
      setGuilds(g.guilds || []);
    } catch {
      setMe(null);
      setGuilds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    const onPop = () => setPathGuildId(usePathGuildId());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loadSession]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("login") === "success" || sp.get("bot_installed")) {
      window.history.replaceState({}, "", window.location.pathname);
      loadSession();
    }
    if (sp.get("error")) {
      setError(
        sp.get("error") === "oauth" ? "Login failed." : "Bot setup failed.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadSession]);

  async function logout() {
    await fetchJson("/api/auth/logout", { method: "POST" });
    setMe(null);
    setGuilds([]);
    window.history.pushState({}, "", "/");
    setPathGuildId(null);
  }

  async function openBotInvite(guildId) {
    setBusyGuildId(guildId);
    setError(null);
    try {
      const { url } = await fetchJson("/api/auth/bot-invite-url", {
        method: "POST",
        body: JSON.stringify({ guildId }),
      });
      window.location.href = url;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyGuildId(null);
    }
  }

  function openManagePage(guildId) {
    window.history.pushState({}, "", `/dashboard/manage/${guildId}`);
    setPathGuildId(guildId);
  }

  if (loading && !me) {
    return (
      <div className="shell">
        <p className="muted">Loading�</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="shell hero">
        <h1>Discord Bot Dashboard</h1>
        <p className="muted">
          Log in with Discord to see servers where you can manage the bot.
        </p>
        <a className="btn primary" href="/api/auth/discord/login">
          Login with Discord
        </a>
        {error ? <p className="warn">{error}</p> : null}
      </div>
    );
  }

  if (pathGuildId) {
    return (
      <OverviewPage
        me={me}
        onLogout={logout}
        guildId={pathGuildId}
        setError={setError}
      />
    );
  }

  const av = avatarUrl(me);

  return (
    <div className="shell">
      <header className="topbar">
        <span className="logo">Dashboard</span>
        <button type="button" className="btn ghost" onClick={logout}>
          Log out
        </button>
      </header>

      <section className="profile card">
        <div className="profile-main">
          {av ? (
            <img src={av} alt="" className="avatar lg" />
          ) : (
            <div className="avatar lg placeholder" />
          )}
          <div>
            <h2>{me.username}</h2>
            <p className="muted small">
              User ID <code>{me.id}</code>
            </p>
          </div>
        </div>
      </section>

      {error ? <p className="warn">{error}</p> : null}

      <section className="guilds">
        <h3>Your servers</h3>
        <p className="muted small footnote">
          Only servers where you are owner or have Manage Server / Administrator are
          listed.
        </p>
        <div className="grid">
          {guilds.map((g) => (
            <article key={g.id} className="card guild-card">
              <div className="guild-head">
                {g.iconUrl ? (
                  <img src={g.iconUrl} alt="" className="avatar sm" />
                ) : (
                  <div className="avatar sm placeholder" />
                )}
                <div>
                  <div className="guild-name">{g.name}</div>
                  {g.botConfigured ? (
                    <span className="pill ok">Bot configured</span>
                  ) : (
                    <span className="pill">Bot not added yet</span>
                  )}
                  <span className="pill plan">{g.plan || "free"}</span>
                </div>
              </div>

              <div className="actions-row">
                <button
                  type="button"
                  className="btn accent full"
                  disabled={busyGuildId === g.id}
                  onClick={() => openBotInvite(g.id)}
                >
                  {busyGuildId === g.id ? "Opening Discord�" : "Add bot"}
                </button>

                <button
                  type="button"
                  className="btn ghost full"
                  onClick={() => openManagePage(g.id)}
                >
                  Overview
                </button>
              </div>
            </article>
          ))}
        </div>
        {guilds.length === 0 ? (
          <p className="muted">No manageable servers found.</p>
        ) : null}
      </section>
    </div>
  );
}
