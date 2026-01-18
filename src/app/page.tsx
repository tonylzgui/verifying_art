"use client";
export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import { getSupabase, publicUrl } from "../lib/supabaseClient";

type PhotoRow = {
  id: string;
  storage_path: string;
};

export default function Page() {
  const [session, setSession] = useState<any>(null);

  // auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // reset password flow (working recovery-link flow)
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  // app state
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [currentPhoto, setCurrentPhoto] = useState<PhotoRow | null>(null);

  // Sliders start "unselected" (null)
  const [wealth, setWealth] = useState<number | null>(null);
  const [wealthWhy, setWealthWhy] = useState<string>("");

  const [relevance, setRelevance] = useState<number | null>(null);
  const [relevanceWhy, setRelevanceWhy] = useState<string>("");

  const userId = session?.user?.id as string | undefined;

  const TITLE = "Does this artwork represent the living conditions of its time?";

  const styles = {
    page: {
      minHeight: "100vh",
      padding: "40px 12px",
      background: "#f6f7f9",
      color: "#111",
      fontFamily: "system-ui",
      colorScheme: "light" as const,
    },
    card: {
      border: "1px solid #ddd",
      borderRadius: 12,
      padding: 16,
      background: "white",
    },
    error: {
      border: "1px solid #f2a2a2",
      padding: 12,
      borderRadius: 8,
      color: "#a11",
      whiteSpace: "pre-wrap" as const,
    },
    input: {
      padding: 12,
      fontSize: 16,
      borderRadius: 10,
      border: "1px solid #d6d6d6",
      background: "white",
      color: "#111",
      outline: "none",
    },
    button: {
      padding: "10px 14px",
      borderRadius: 10,
      border: "1px solid #111",
      background: "#111",
      color: "white",
      cursor: "pointer",
    },
    buttonSecondary: {
      padding: "10px 14px",
      borderRadius: 10,
      border: "1px solid #bbb",
      background: "white",
      color: "#111",
      cursor: "pointer",
    },
    disabled: {
      opacity: 0.6,
      cursor: "not-allowed",
    },
  } as const;

  // ---- auth wiring ----
  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data }) => setSession(data.session ?? null));

    const { data: sub } = getSupabase().auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Detect Supabase recovery links (e.g. /#access_token=...&type=recovery)
  // When present, show reset UI instead of the app (even if Supabase "logs them in").
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const qs = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const type = qs.get("type");
    if (type === "recovery") {
      setResetMode(true);
      setErr(null);
    }
  }, []);

  // When we log in, load first photo (but NOT during reset)
  useEffect(() => {
    if (resetMode) return;

    if (session?.user?.id) {
      loadNextPhoto();
    } else {
      setCurrentPhoto(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, resetMode]);

  // ---- helpers ----
  const wealthSelected = wealth !== null;
  const relevanceSelected = relevance !== null;

  const wealthNeedsWhy = wealthSelected && wealth !== 5;
  const relevanceNeedsWhy = relevanceSelected && relevance !== 0;

  const canSave = useMemo(() => {
    if (!userId) return false;
    if (!currentPhoto) return false;

    // must manually select both sliders
    if (!wealthSelected) return false;
    if (!relevanceSelected) return false;

    if (wealthNeedsWhy && wealthWhy.trim().length === 0) return false;
    if (relevanceNeedsWhy && relevanceWhy.trim().length === 0) return false;

    return true;
  }, [
    userId,
    currentPhoto,
    wealthSelected,
    relevanceSelected,
    wealthNeedsWhy,
    wealthWhy,
    relevanceNeedsWhy,
    relevanceWhy,
  ]);

  function resetInputs() {
    setWealth(null);
    setWealthWhy("");
    setRelevance(null);
    setRelevanceWhy("");
  }

  // ---- auth actions ----
  async function signUp() {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.signUp({
        email: email.trim(),
        password,
      });

      if (!error) {
        setErr("Sign up successful. If email confirmation is enabled, confirm then sign in.");
        return;
      }

      const msg = (error.message || "").toLowerCase();
      if (msg.includes("already") && (msg.includes("registered") || msg.includes("exists"))) {
        setErr("That email is already registered. Click “Forgot password?” if you can’t sign in.");
      } else {
        setErr(error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function signIn() {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) setErr(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    setErr(null);

    const em = email.trim();
    if (!em) {
      setErr("Enter your email first, then click “Forgot password?”.");
      return;
    }

    setLoading(true);
    try {
      // Send them back to this page; we detect the recovery hash and show reset UI.
      const { error } = await getSupabase().auth.resetPasswordForEmail(em, {
        redirectTo: window.location.origin,
      });
      if (error) setErr(error.message);
      else setErr("Password reset email sent. Check your inbox.");
    } finally {
      setLoading(false);
    }
  }

  async function setPasswordFromRecovery() {
    setErr(null);

    if (newPassword.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== newPassword2) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password: newPassword });
      if (error) {
        setErr(error.message);
        return;
      }

      // IMPORTANT: sign out so the recovery link doesn't "log them into the app"
      await getSupabase().auth.signOut();
      setSession(null);

      // clear hash + exit reset mode
      window.history.replaceState({}, "", window.location.pathname);
      setResetMode(false);
      setNewPassword("");
      setNewPassword2("");
      setErr("Password updated. Please sign in with your new password.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.signOut();
      if (error) throw error;

      // hard reset local UI so it immediately shows login screen
      setSession(null);
      setCurrentPhoto(null);
      resetInputs();
      setEmail("");
      setPassword("");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // ---- NEW core app: load a random eligible photo ----
  // Eligibility:
  //  - user has not rated it
  //  - total ratings for photo < 20 (otherwise "retired")
  async function loadNextPhoto() {
    if (!userId) return;

    setErr(null);
    setLoading(true);
    try {
      const { data, error } = await getSupabase().rpc("get_random_photo_to_rate", {
        p_user_id: userId,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;

      if (!row) {
        setCurrentPhoto(null);
        return;
      }

      setCurrentPhoto(row as PhotoRow);
      resetInputs();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // ---- save score + next ----
  async function saveAndNext() {
    if (!userId || !currentPhoto) return;
    if (wealth === null || relevance === null) return;

    setErr(null);
    setLoading(true);

    try {
      const payload = {
        user_id: userId,
        photo_id: currentPhoto.id,
        wealth_score: wealth,
        wealth_rationale: wealthNeedsWhy ? wealthWhy.trim() : null,
        relevance_score: relevance,
        relevance_rationale: relevanceNeedsWhy ? relevanceWhy.trim() : null,
      };

      const { error: upErr } = await getSupabase()
        .from("user_photo_scores")
        .upsert(payload, { onConflict: "user_id,photo_id" });

      if (upErr) throw upErr;

      await loadNextPhoto();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // ---- UI (reset mode: show even if session exists) ----
  if (resetMode) {
    return (
      <main style={styles.page}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.15, marginBottom: 18, textAlign: "center" }}>
            Set a new password
          </h1>

          <div style={{ ...styles.card, maxWidth: 520, margin: "0 auto" }}>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                placeholder="new password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={styles.input}
                autoComplete="new-password"
              />
              <input
                placeholder="confirm new password"
                type="password"
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
                style={styles.input}
                autoComplete="new-password"
              />

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={setPasswordFromRecovery}
                  disabled={loading}
                  style={{ ...styles.button, ...(loading ? styles.disabled : {}) }}
                >
                  Update password
                </button>

                <button
                  onClick={async () => {
                    setResetMode(false);
                    setNewPassword("");
                    setNewPassword2("");
                    await getSupabase().auth.signOut();
                    window.history.replaceState({}, "", window.location.pathname);
                  }}
                  disabled={loading}
                  style={{ ...styles.buttonSecondary, ...(loading ? styles.disabled : {}) }}
                >
                  Back
                </button>
              </div>

              {err && <div style={styles.error}>{err}</div>}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---- UI (logged out) ----
  if (!session) {
    return (
      <main style={styles.page}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: "0 0 18px 0", textAlign: "center" }}>
            {TITLE}
          </h1>

          <div style={styles.card}>
            <div style={{ display: "grid", gap: 12 }}>
              <input
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                autoComplete="email"
              />
              <input
                placeholder="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                autoComplete="current-password"
              />

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={signIn}
                  disabled={loading}
                  style={{ ...styles.button, ...(loading ? styles.disabled : {}) }}
                >
                  Sign in
                </button>
                <button
                  onClick={signUp}
                  disabled={loading}
                  style={{ ...styles.buttonSecondary, ...(loading ? styles.disabled : {}) }}
                >
                  Sign up
                </button>
                <button
                  onClick={forgotPassword}
                  disabled={loading}
                  style={{ ...styles.buttonSecondary, ...(loading ? styles.disabled : {}) }}
                >
                  Forgot password?
                </button>
              </div>

              {err && <div style={styles.error}>{err}</div>}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---- UI (logged in) ----
  const bottomBtnBase: React.CSSProperties = {
    height: 44,
    minWidth: 150,
    padding: "0 18px",
    fontSize: 16,
    borderRadius: 10,
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 500,
  };

  return (
    <main style={styles.page}>
      <style jsx global>{`
        .hollow-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          display: block;
          background: transparent;
          outline: none;
        }

        .hollow-range::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
          background: #d1d5db;
        }
        .hollow-range::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: #d1d5db;
        }

        .hollow-range.selected::-webkit-slider-runnable-track {
          background: linear-gradient(
            to right,
            var(--fill, #2563eb) 0%,
            var(--fill, #2563eb) var(--pct, 0%),
            #d1d5db var(--pct, 0%),
            #d1d5db 100%
          );
        }
        .hollow-range.selected::-moz-range-track {
          background: linear-gradient(
            to right,
            var(--fill, #2563eb) 0%,
            var(--fill, #2563eb) var(--pct, 0%),
            #d1d5db var(--pct, 0%),
            #d1d5db 100%
          );
        }

        .hollow-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid #9ca3af;
          background: white;
          cursor: pointer;
          margin-top: -6px;
        }
        .hollow-range::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid #9ca3af;
          background: white;
          cursor: pointer;
        }

        .hollow-range.selected::-webkit-slider-thumb {
          border-color: var(--thumb-color, #2563eb);
          background: var(--thumb-color, #2563eb);
        }
        .hollow-range.selected::-moz-range-thumb {
          border-color: var(--thumb-color, #2563eb);
          background: var(--thumb-color, #2563eb);
        }

        .slider-label-btn {
          appearance: none;
          border: none;
          background: transparent;
          padding: 6px 0;
          margin: 0;
          color: inherit;
          font: inherit;
          cursor: pointer;
          text-align: inherit;
          display: block;
          width: 100%;
          white-space: normal;
        }
        .slider-label-btn:focus-visible {
          outline: 2px solid #111;
          outline-offset: 3px;
          border-radius: 6px;
        }

        /* ✅ KEY FIX: Reserve label-row height so textareas always align */
        .slider-labels {
          min-height: 96px;
        }

        @media (max-width: 720px) {
          .sections-grid {
            grid-template-columns: 1fr !important;
          }

          .slider-labels {
            flex-wrap: wrap;
            gap: 6px;
            min-height: 0 !important; /* don't waste space on mobile */
          }

          .slider-label {
            width: 100% !important;
            text-align: left !important;
          }

          .slider-label-btn {
            padding: 4px 0;
          }
        }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: "0 0 10px 0", textAlign: "center" }}>
          {TITLE}
        </h1>

        {err && <div style={{ ...styles.error, marginBottom: 16 }}>{err}</div>}
        {loading && <div style={{ marginBottom: 12, opacity: 0.75, color: "#111" }}>Loading…</div>}

        {!currentPhoto ? (
          <div style={{ marginTop: 24, fontSize: 18, opacity: 0.85 }}>No more photos available right now.</div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <img
                src={publicUrl(currentPhoto.storage_path)}
                alt=""
                style={{
                  width: "100%",
                  height: "min(520px, 55vh)",
                  objectFit: "contain",
                  background: "#fff",
                }}
              />
            </div>

            <div
              className="sections-grid"
              style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
            >
              <Section
                title="Relevant score"
                value={relevance}
                onChange={setRelevance}
                rationale={relevanceWhy}
                setRationale={setRelevanceWhy}
                defaultValue={0}
                labels={{
                  left: "0 — Not representative",
                  mid: "5 — Neither representative nor unrepresentative",
                  right: "10 — Very representative",
                }}
              />

              <Section
                title="Level of wealth"
                value={wealth}
                onChange={setWealth}
                rationale={wealthWhy}
                setRationale={setWealthWhy}
                defaultValue={5}
                labels={{
                  left: "0 — Extremely poor",
                  mid: "5 — Neither poor nor rich",
                  right: "10 — Extremely rich",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginTop: 22,
              }}
            >
              <button
                onClick={saveAndNext}
                disabled={!canSave || loading}
                style={{
                  ...bottomBtnBase,
                  border: "1px solid #111",
                  background: canSave ? "#111" : "#cfcfcf",
                  color: "white",
                  cursor: canSave ? "pointer" : "not-allowed",
                }}
              >
                Save & Next
              </button>

              <button
                onClick={signOut}
                disabled={loading}
                style={{
                  ...bottomBtnBase,
                  border: "1px solid #bbb",
                  background: "white",
                  color: "#111",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Section({
  title,
  value,
  onChange,
  rationale,
  setRationale,
  defaultValue,
  labels,
}: {
  title: string;
  value: number | null;
  onChange: (v: number | null) => void;
  rationale: string;
  setRationale: (s: string) => void;
  defaultValue: number;
  labels: { left: string; mid: string; right: string };
}) {
  const selected = value !== null;
  const visualValue = selected ? value : defaultValue;

  const needsWhy = selected && value !== defaultValue;
  const sliderColor = !selected ? "#9ca3af" : value === defaultValue ? "#2563eb" : "#16a34a";

  const pct = `${(visualValue / 10) * 100}%`;

  // Clicking thumb/track while unselected should select default
  const ensureSelected = () => {
    if (value === null) onChange(defaultValue);
  };

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16, background: "white" }}>
      <div style={{ fontSize: 18, fontWeight: 650, marginBottom: 10, color: "#111" }}>{title}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 28px", columnGap: 12, alignItems: "center" }}>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={visualValue}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={ensureSelected}
          onMouseDown={ensureSelected}
          onTouchStart={ensureSelected}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") ensureSelected();
          }}
          className={`hollow-range ${selected ? "selected" : ""}`}
          style={
            {
              ["--thumb-color" as any]: sliderColor,
              ["--fill" as any]: sliderColor,
              ["--pct" as any]: pct,
            } as React.CSSProperties
          }
        />
        <div
          style={{
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            color: "#111",
            minHeight: 20,
            lineHeight: "20px",
          }}
        >
          {selected ? value : "\u00A0"}
        </div>

        <div style={{ height: 22 }} />
        <div />

        <div
          className="slider-labels"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            fontSize: 12,
            color: "#333",
            opacity: 0.85,
            lineHeight: "16px",
            alignItems: "flex-start",
          }}
        >
          <div className="slider-label slider-label-left" style={{ width: "33%", textAlign: "left" }}>
            <button type="button" className="slider-label-btn" onClick={() => onChange(0)}>
              {labels.left}
            </button>
          </div>

          <div className="slider-label slider-label-mid" style={{ width: "34%", textAlign: "center" }}>
            <button type="button" className="slider-label-btn" onClick={() => onChange(5)}>
              {labels.mid}
            </button>
          </div>

          <div className="slider-label slider-label-right" style={{ width: "33%", textAlign: "right" }}>
            <button type="button" className="slider-label-btn" onClick={() => onChange(10)}>
              {labels.right}
            </button>
          </div>
        </div>

        <div />
      </div>

      <div style={{ marginTop: 12 }}>
        <textarea
          placeholder={selected ? "Please provide a brief rationale" : "Select a score first"}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: needsWhy ? "1px solid #16a34a" : "1px solid #d6d6d6",
            outline: "none",
            background: "white",
            color: "#111",
          }}
          disabled={!selected}
        />

        {/* Reserve space so this line never shifts the layout */}
        <div style={{ marginTop: 6, minHeight: 16, fontSize: 12, color: "#16a34a" }}>
          {needsWhy && rationale.trim().length === 0 ? "Required." : ""}
        </div>
      </div>
    </div>
  );
}