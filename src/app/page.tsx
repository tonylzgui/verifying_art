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

  // reset password flow
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  // app state
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [currentPhoto, setCurrentPhoto] = useState<PhotoRow | null>(null);

  // scoring state
  const [relevance, setRelevance] = useState<number>(0);
  const [relevanceWhy, setRelevanceWhy] = useState<string>("");

  const [wealth, setWealth] = useState<number>(5);
  const [wealthWhy, setWealthWhy] = useState<string>("");

  const userId = session?.user?.id as string | undefined;

  // ---- auth wiring ----
  useEffect(() => {
    // detect password recovery links so we show reset UI on this same page (no /reset route needed)
    if (typeof window !== "undefined") {
      const u = new URL(window.location.href);
      const isRecovery =
        u.searchParams.get("type") === "recovery" ||
        u.searchParams.get("reset") === "1" ||
        window.location.hash.includes("access_token") ||
        window.location.hash.includes("recovery");

      if (isRecovery) setResetMode(true);
    }

    getSupabase()
      .auth.getSession()
      .then(({ data }) => setSession(data.session ?? null));

    const { data: sub } = getSupabase().auth.onAuthStateChange((event, s) => {
      setSession(s);

      // Supabase will fire this when the user lands via recovery link
      if (event === "PASSWORD_RECOVERY") {
        setResetMode(true);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // When we log in, load first photo
  useEffect(() => {
    if (session?.user?.id) {
      loadNextPhoto();
    } else {
      setCurrentPhoto(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // ---- helpers ----
  const relevanceNeedsWhy = relevance !== 0; // required if moved off 0
  const wealthNeedsWhy = wealth !== 5; // required if moved off 5

  const canSave = useMemo(() => {
    if (!userId) return false;
    if (!currentPhoto) return false;
    if (relevanceNeedsWhy && relevanceWhy.trim().length === 0) return false;
    if (wealthNeedsWhy && wealthWhy.trim().length === 0) return false;
    return true;
  }, [userId, currentPhoto, relevanceNeedsWhy, relevanceWhy, wealthNeedsWhy, wealthWhy]);

  function resetInputs() {
    setRelevance(0);
    setRelevanceWhy("");
    setWealth(5);
    setWealthWhy("");
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
        // Supabase may intentionally not reveal whether email exists.
        setErr(
          "If this is a new account, check your email to confirm. If you already have an account, try “Sign in” or “Forgot password?”."
        );
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
      // Redirect back to / so we don't need a /reset route
      const { error } = await getSupabase().auth.resetPasswordForEmail(em, {
        redirectTo: `${window.location.origin}/?reset=1`,
      });
      if (error) setErr(error.message);
      else setErr("Password reset email sent. Check your inbox.");
    } finally {
      setLoading(false);
    }
  }

  async function setPasswordFromRecovery() {
    setErr(null);

    if (!newPassword || newPassword.length < 8) {
      setErr("New password must be at least 8 characters.");
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

      setErr("Password updated. You can now sign in.");
      setResetMode(false);
      setNewPassword("");
      setNewPassword2("");

      // Clean URL so refresh doesn't keep showing reset mode
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setErr(null);
    await getSupabase().auth.signOut();
  }

  // ---- core app: load next photo for this user ----
  async function loadNextPhoto() {
    // creates/ensures per-user queue (RPC should exist in your DB)
    await getSupabase().rpc("ensure_queue", { anchor_n: 20 });
    if (!userId) return;

    setErr(null);
    setLoading(true);
    try {
      const { data: q, error: qErr } = await getSupabase()
        .from("photo_queue")
        .select("photo_id, order_index")
        .eq("user_id", userId)
        .eq("served", false)
        .order("order_index", { ascending: true })
        .limit(1);

      if (qErr) throw qErr;

      if (!q || q.length === 0) {
        setCurrentPhoto(null);
        return;
      }

      const photoId = q[0].photo_id as string;

      const { data: p, error: pErr } = await getSupabase()
        .from("photos")
        .select("id, storage_path")
        .eq("id", photoId)
        .single();

      if (pErr) throw pErr;

      setCurrentPhoto(p as PhotoRow);
      resetInputs();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // ---- save score + mark served + next ----
  async function saveAndNext() {
    if (!userId || !currentPhoto) return;
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

      const { error: servedErr } = await getSupabase()
        .from("photo_queue")
        .update({ served: true, served_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("photo_id", currentPhoto.id);

      if (servedErr) throw servedErr;

      await loadNextPhoto();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  // ---- styles (dark mode safe) ----
  const styles = (
    <style>{`
      :root{
        --bg: #f6f7f8;
        --text: #0b0c0f;
        --muted: rgba(0,0,0,.65);
        --card: #ffffff;
        --border: #d7dbe0;
        --input: #ffffff;
        --inputText: #0b0c0f;
        --placeholder: rgba(0,0,0,.45);
        --btn: #111111;
        --btnText: #ffffff;
      }
      @media (prefers-color-scheme: dark){
        :root{
          --bg: #0b0c0f;
          --text: #f5f7fb;
          --muted: rgba(245,247,251,.70);
          --card: #111827;
          --border: #334155;
          --input: #0f172a;
          --inputText: #f5f7fb;
          --placeholder: rgba(245,247,251,.55);
          --btn: #f5f7fb;
          --btnText: #0b0c0f;
        }
      }
      html, body { height: 100%; }
      body {
        background: var(--bg);
        color: var(--text);
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      input, textarea, button { font-family: inherit; }
      input::placeholder, textarea::placeholder { color: var(--placeholder); }
    `}</style>
  );

  // ---- UI (logged out) ----
  if (!session) {
    return (
      <>
        {styles}
        <main style={{ maxWidth: 520, margin: "44px auto", padding: "0 16px" }}>
          <h1 style={{ fontSize: 34, margin: "0 0 18px 0", lineHeight: 1.15 }}>
            Does this artwork represent the living conditions of its time?
          </h1>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 16,
              background: "var(--card)",
            }}
          >
            {resetMode ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 650, marginBottom: 10 }}>Set a new password</div>

                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    placeholder="new password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{
                      padding: 12,
                      fontSize: 16,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--input)",
                      color: "var(--inputText)",
                    }}
                    autoComplete="new-password"
                  />
                  <input
                    placeholder="confirm new password"
                    type="password"
                    value={newPassword2}
                    onChange={(e) => setNewPassword2(e.target.value)}
                    style={{
                      padding: 12,
                      fontSize: 16,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--input)",
                      color: "var(--inputText)",
                    }}
                    autoComplete="new-password"
                  />

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={setPasswordFromRecovery}
                      disabled={loading}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--btn)",
                        color: "var(--btnText)",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      Update password
                    </button>

                    <button
                      onClick={() => setResetMode(false)}
                      disabled={loading}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    placeholder="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      padding: 12,
                      fontSize: 16,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--input)",
                      color: "var(--inputText)",
                    }}
                    autoComplete="email"
                  />
                  <input
                    placeholder="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      padding: 12,
                      fontSize: 16,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--input)",
                      color: "var(--inputText)",
                    }}
                    autoComplete="current-password"
                  />

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={signIn}
                      disabled={loading}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--btn)",
                        color: "var(--btnText)",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      Sign in
                    </button>

                    <button
                      onClick={signUp}
                      disabled={loading}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      Sign up
                    </button>

                    <button
                      onClick={forgotPassword}
                      disabled={loading}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>
              </>
            )}

            {err && (
              <div
                style={{
                  marginTop: 14,
                  border: "1px solid rgba(220, 38, 38, .55)",
                  padding: 12,
                  borderRadius: 10,
                  color: "rgba(220, 38, 38, 1)",
                  background: "rgba(220, 38, 38, .08)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {err}
              </div>
            )}
          </div>
        </main>
      </>
    );
  }

  // ---- UI (logged in) ----
  return (
    <>
      {styles}
      <main style={{ maxWidth: 980, margin: "30px auto 60px", padding: "0 16px" }}>
        {/* header: never overlaps; title centered; sign out pinned right */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr minmax(0, 980px) 1fr",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div />
            <h1 style={{ margin: 0, fontSize: 34, textAlign: "center", lineHeight: 1.15 }}>
              Does this artwork represent the living conditions of its time?
            </h1>
            <div style={{ justifySelf: "end" }}>
              <button
                onClick={signOut}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Sign out
              </button>
            </div>
          </div>
          <div />
        </div>

        {err && (
          <div
            style={{
              border: "1px solid rgba(220, 38, 38, .55)",
              padding: 12,
              borderRadius: 10,
              color: "rgba(220, 38, 38, 1)",
              background: "rgba(220, 38, 38, .08)",
              marginBottom: 16,
              whiteSpace: "pre-wrap",
            }}
          >
            {err}
          </div>
        )}

        {loading && <div style={{ marginBottom: 12, opacity: 0.8, color: "var(--muted)" }}>Loading…</div>}

        {!currentPhoto ? (
          <div style={{ marginTop: 24, fontSize: 18, opacity: 0.85, color: "var(--muted)" }}>
            No more photos available right now.
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
                background: "var(--card)",
              }}
            >
              <img
                src={publicUrl(currentPhoto.storage_path)}
                alt=""
                style={{ width: "100%", height: 560, objectFit: "contain", borderRadius: 10 }}
              />
            </div>

            {/* Relevant on the LEFT, Wealth on the RIGHT */}
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <Section
                title="Relevant score"
                value={relevance}
                onChange={setRelevance}
                rationale={relevanceWhy}
                setRationale={setRelevanceWhy}
                baseValue={0}
                labels={{
                  left: "0 — Not representative",
                  middle: "5 — Neither representative nor unrepresentative",
                  right: "10 — Very representative",
                }}
              />

              <Section
                title="Level of wealth"
                value={wealth}
                onChange={setWealth}
                rationale={wealthWhy}
                setRationale={setWealthWhy}
                baseValue={5}
                labels={{
                  left: "0 — Extremely poor",
                  middle: "5 — Neither poor nor rich",
                  right: "10 — Extremely rich",
                }}
              />
            </div>

            <div style={{ height: 20 }} />

            <button
              onClick={saveAndNext}
              disabled={!canSave || loading}
              style={{
                padding: "12px 18px",
                fontSize: 16,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: canSave ? "var(--btn)" : "rgba(0,0,0,.20)",
                color: canSave ? "var(--btnText)" : "rgba(255,255,255,.85)",
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              Save & Next
            </button>
          </div>
        )}
      </main>
    </>
  );
}

function Section({
  title,
  value,
  onChange,
  rationale,
  setRationale,
  baseValue,
  labels,
}: {
  title: string;
  value: number;
  onChange: (v: number) => void;
  rationale: string;
  setRationale: (s: string) => void;
  baseValue: number;
  labels: { left: string; middle: string; right: string };
}) {
  const needsWhy = value !== baseValue;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 16,
        background: "var(--card)",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <div style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
          marginTop: 8,
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <div style={{ textAlign: "left" }}>{labels.left}</div>
        <div style={{ textAlign: "center" }}>{labels.middle}</div>
        <div style={{ textAlign: "right" }}>{labels.right}</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <textarea
          placeholder="Please provide a brief rationale"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 12,
            border: needsWhy ? "1px solid rgba(34,197,94,.9)" : "1px solid var(--border)",
            background: "var(--input)",
            color: "var(--inputText)",
            outline: "none",
            resize: "vertical",
          }}
        />
        {needsWhy && rationale.trim().length === 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "rgba(34,197,94,1)" }}>Required.</div>
        )}
      </div>
    </div>
  );
}
