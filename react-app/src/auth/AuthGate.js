import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "./auth.css";
import {
  isAdminEmail,
  loginAdmin,
  loginUser,
  verifyUserAccess,
  subscribeUserAccess,
  observeAuth,
  logout,
  createUserAccount,
  listAllUsers,
  toggleUserActive,
  updateUserUsername,
  deleteUserRecord,
} from "./authService";

function AdminSystemPage({ adminEmail }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [editingUid, setEditingUid] = useState(null);
  const [editUsername, setEditUsername] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listAllUsers();
      setUsers(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const created = await createUserAccount(username, password);
      setUsername("");
      setPassword("");
      setInfo(`User "${created.username}" created.`);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (u) => {
    setError("");
    setInfo("");
    try {
      await toggleUserActive(u.uid, u.active);
      setInfo(`User "${u.username || u.uid}" is now ${!u.active ? "Active" : "Blocked"}.`);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveEdit = async (u) => {
    setError("");
    setInfo("");
    try {
      await updateUserUsername(u.uid, editUsername);
      setEditingUid(null);
      setEditUsername("");
      setInfo("Username updated.");
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (u) => {
    setError("");
    setInfo("");
    try {
      await deleteUserRecord(u.uid);
      setInfo(`Deleted record for "${u.username || u.uid}".`);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const totalCount = users.length;
  const activeCount = users.filter((u) => u.active).length;
  const blockedCount = totalCount - activeCount;

  return (
    <div className="xauth-admin-page">
      <div className="xauth-admin-container">
        <div className="xauth-admin-header">
          <div>
            <h2 className="xauth-title" style={{ margin: 0, textAlign: "left" }}>
              Admin User Management
            </h2>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              Signed in as {adminEmail}
            </div>
          </div>
          <div className="xauth-user-actions">
            <button type="button" className="xauth-btn xauth-btn-sm" onClick={loadUsers} disabled={loading}>
              Refresh
            </button>
            <button type="button" className="xauth-btn xauth-btn-sm xauth-btn-danger" onClick={() => logout()}>
              Logout
            </button>
          </div>
        </div>

        <div className="xauth-stats">
          <div className="xauth-stat">
            Total Users <strong>{totalCount}</strong>
          </div>
          <div className="xauth-stat">
            Active <strong style={{ color: "#16a34a" }}>{activeCount}</strong>
          </div>
          <div className="xauth-stat">
            Blocked <strong style={{ color: "#dc2626" }}>{blockedCount}</strong>
          </div>
        </div>

        {error && <div className="xauth-alert xauth-alert-error">{error}</div>}
        {info && <div className="xauth-alert xauth-alert-info">{info}</div>}

        <form className="xauth-admin-form" onSubmit={handleCreate}>
          <input
            className="xauth-input"
            type="text"
            placeholder="New username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            className="xauth-input"
            type="password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="xauth-btn xauth-btn-sm" disabled={loading}>
            Create User
          </button>
        </form>

        <div className="xauth-user-list">
          {loading && users.length === 0 && <div>Loading users...</div>}
          {!loading && users.length === 0 && <div>No users created yet.</div>}
          {users.map((u) => (
            <div key={u.uid} className="xauth-user-row">
              {editingUid === u.uid ? (
                <div style={{ display: "flex", gap: "8px", flex: 1 }}>
                  <input
                    className="xauth-input"
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                  />
                  <button
                    type="button"
                    className="xauth-btn xauth-btn-sm xauth-btn-success"
                    onClick={() => handleSaveEdit(u)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="xauth-btn xauth-btn-sm xauth-btn-secondary"
                    onClick={() => setEditingUid(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{u.username || u.uid}</strong>
                    <span className={`xauth-badge ${u.active ? "xauth-badge-active" : "xauth-badge-blocked"}`}>
                      {u.active ? "Active" : "Blocked"}
                    </span>
                  </div>
                  <div className="xauth-user-actions">
                    <button
                      type="button"
                      className="xauth-btn xauth-btn-sm"
                      onClick={() => {
                        setEditingUid(u.uid);
                        setEditUsername(u.username || "");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`xauth-btn xauth-btn-sm ${u.active ? "xauth-btn-secondary" : "xauth-btn-success"}`}
                      onClick={() => handleToggle(u)}
                    >
                      {u.active ? "Block" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="xauth-btn xauth-btn-sm xauth-btn-danger"
                      onClick={() => handleDelete(u)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ initialMessage }) {
  const [adminMode, setAdminMode] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialMessage || "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialMessage) {
      setError(initialMessage);
    }
  }, [initialMessage]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setAdminMode((prev) => !prev);
        setIdentifier("");
        setPassword("");
        setError("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (adminMode) {
        await loginAdmin(identifier, password);
      } else {
        await loginUser(identifier, password);
      }
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="xauth-screen">
      <div className="xauth-card">
        <h2 className="xauth-title">{adminMode ? "Admin Login" : "Login"}</h2>

        {error && <div className="xauth-alert xauth-alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="xauth-field">
            <label className="xauth-label">
              {adminMode ? "Email" : "Username"}
            </label>
            <input
              className="xauth-input"
              type={adminMode ? "email" : "text"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={adminMode ? "Enter email" : "Enter username"}
              required
            />
          </div>
          <div className="xauth-field">
            <label className="xauth-label">Password</label>
            <input
              className="xauth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button type="submit" className="xauth-btn" disabled={submitting}>
            {submitting ? "Signing in..." : "Login"}
          </button>
        </form>

        {adminMode && (
          <button
            type="button"
            className="xauth-btn xauth-btn-secondary"
            style={{ marginTop: "8px" }}
            onClick={() => {
              setAdminMode(false);
              setIdentifier("");
              setPassword("");
              setError("");
            }}
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}

function AuthGateApp({ startApp }) {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null); // { user, isAdmin, username }
  const [revokedMsg, setRevokedMsg] = useState("");
  const [appStarted, setAppStarted] = useState(false);

  const hideMainApp = useCallback(() => {
    const appRoot = document.getElementById("root");
    if (appRoot) {
      appRoot.style.display = "none";
    }
  }, []);

  const lockApp = useCallback(
    (message) => {
      hideMainApp();
      setSession(null);
      if (message) {
        setRevokedMsg(message);
      }
    },
    [hideMainApp]
  );

  const unlockUserApp = useCallback(
    (nextSession) => {
      setSession(nextSession);
      setRevokedMsg("");
      const appRoot = document.getElementById("root");
      if (appRoot) {
        appRoot.style.display = "";
      }
      if (!appStarted) {
        setAppStarted(true);
        startApp();
      }
    },
    [appStarted, startApp]
  );

  useEffect(() => {
    let unsubSnapshot = null;

    const unsubAuth = observeAuth(async (user) => {
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }

      if (!user) {
        lockApp("");
        setChecking(false);
        return;
      }

      try {
        if (await isAdminEmail(user.email)) {
          hideMainApp();
          setSession({ user, isAdmin: true, username: user.email });
          setRevokedMsg("");
          setChecking(false);
          return;
        }

        const profile = await verifyUserAccess(user.uid);
        if (!profile) {
          await logout().catch(() => {});
          lockApp("Aapko access nahi hai");
          setChecking(false);
          return;
        }

        unlockUserApp({ user, isAdmin: false, username: profile.username });
        setChecking(false);

        unsubSnapshot = subscribeUserAccess(user.uid, async (msg) => {
          await logout().catch(() => {});
          lockApp(msg);
        });
      } catch (err) {
        await logout().catch(() => {});
        lockApp(err?.message || "Aapko access nahi hai");
        setChecking(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubSnapshot) {
        unsubSnapshot();
      }
    };
  }, [hideMainApp, lockApp, unlockUserApp]);

  if (checking) {
    return (
      <div className="xauth-screen">
        <div className="xauth-card">
          <div className="xauth-title">Checking access...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen initialMessage={revokedMsg} />;
  }

  if (session.isAdmin) {
    return <AdminSystemPage adminEmail={session.username} />;
  }

  return (
    <div className="xauth-topbar">
      <button
        type="button"
        className="xauth-btn xauth-btn-sm xauth-btn-secondary"
        onClick={() => logout()}
      >
        Logout
      </button>
    </div>
  );
}

/**
 * Gates the existing React app behind Firebase Auth + Firestore access checks.
 */
export function requireAuth(startApp) {
  const appRoot = document.getElementById("root");
  if (appRoot) {
    appRoot.style.display = "none";
  }

  let authContainer = document.getElementById("xauth-root");
  if (!authContainer) {
    authContainer = document.createElement("div");
    authContainer.id = "xauth-root";
    document.body.appendChild(authContainer);
  }

  const authRoot = ReactDOM.createRoot(authContainer);
  authRoot.render(<AuthGateApp startApp={startApp} />);
}
