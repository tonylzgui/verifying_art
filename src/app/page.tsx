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

  const [wealth, setWealth] = useState<number>(5);
  const [wealthWhy, setWealthWhy] = useState<string>("");

  const [relevance, setRelevance] = useState<number>(0);
  const [relevanceWhy, setRelevanceWhy] = useState<string>("");

  const userId = session?.user?.id as string | undefined;

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

  // detect supabase recovery links (/#access_token=...&type=recovery)
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
  const wealthNeedsWhy = wealth !== 5;
  const relevanceNeedsWhy = relevance !== 0;

  const canSave = useMemo(() => {
    if (!userId) return false;
    if (!currentPhoto) return false;
    if (wealthNeedsWhy && wealthWhy.trim().length === 0) return false;
    if (relevanceNeedsWhy && relevanceWhy.trim().length === 0) return false;
    return true;
  }, [userId, currentPhoto, wealthNeedsWhy, wealthWhy, relevanceNeedsWhy, relevanceWhy]);

  function resetInputs() {
    setWealth(5);
    setWealthWhy("");
    setRelevance(0);
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
      // send them back to your app root; we detect the recovery hash and show reset UI
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
    await getSupabase().auth.signOut();
  }

  // ---- core app: load next photo for this user ----
  async function loadNextPhoto() {
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

  // ---------- styles ----------
  const styles = (
    <style>{`
      :root { color-scheme: light dark; }
      body { background: #f6f7f9; color: #111; }
      @media (prefers-color-scheme: dark) {
        body { background: #0b0f17; color: #f3f4f6; }
      }
    `}</style>
  );

  // ---- UI (reset mode) ----
  if (resetMode) {
    return (
      <>
        {styles}
        <main style={{ maxWidth: 520, margin: "44px auto", padding: "0 16px", fontFamily: "system-ui" }}>
          <h1 style={{ fontSize: 34, margin: "0 0 18px 0", lineHeight: 1.15 }}>Set a new password</h1>

          <div style={{ border: "1px solid rgba(0,0,0,.12)", borderRadius: 14, padding: 16, background: "white" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <input
                placeholder="new password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ddd" }}
                autoComplete="new-password"
              />
              <input
                placeholder="confirm new password"
                type="password"
                value={newPassword2}
                onChange={(e) => setNewPassword2(e.target.value)}
                style={{ padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ddd" }}
                autoComplete="new-password"
              />

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  onClick={setPasswordFromRecovery}
                  disabled={loading}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "white" }}
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
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "transparent" }}
                >
                  Back
                </button>
              </div>
            </div>

            {err && (
              <div style={{ marginTop: 14, border: "1px solid rgba(220,38,38,.55)", padding: 12, borderRadius: 10, color: "rgb(220,38,38)", background: "rgba(220,38,38,.08)", whiteSpace: "pre-wrap" }}>
                {err}
              </div>
            )}
          </div>
        </main>
      </>
    );
  }

  // ---- UI (logged out) ----
  if (!session) {
    return (
      <>
        {styles}
        <main style={{ maxWidth: 520, margin: "44px auto", padding: "0 16px", fontFamily: "system-ui" }}>
          <h1 style={{ fontSize: 40, marginBottom: 24 }}>Sign in</h1>

          <div style={{ display: "grid", gap: 12 }}>
            <input
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ddd" }}
              autoComplete="email"
            />
            <input
              placeholder="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ddd" }}
              autoComplete="current-password"
            />

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={signIn} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "white" }}>
                Sign in
              </button>
              <button onClick={signUp} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}>
                Sign up
              </button>
              <button onClick={forgotPassword} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd" }}>
                Forgot password?
              </button>
            </div>

            {err && (
              <div style={{ border: "1px solid rgba(220,38,38,.55)", padding: 12, borderRadius: 10, color: "rgb(220,38,38)", background: "rgba(220,38,38,.08)", whiteSpace: "pre-wrap" }}>
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
      <main style={{ maxWidth: 980, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui" }}>
        {/* FIXED HEADER LAYOUT */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "start", marginBottom: 14 }}>
          <div /> {/* left spacer */}
          <h1 style={{ fontSize: 34, margin: 0, textAlign: "center", lineHeight: 1.2 }}>
            Does this artwork represent the living conditions of its time?
          </h1>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={signOut}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "transparent",
                color: "inherit",
                marginLeft: 12,
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        {err && (
          <div style={{ border: "1px solid rgba(220,38,38,.55)", padding: 12, borderRadius: 10, color: "rgb(220,38,38)", background: "rgba(220,38,38,.08)", marginBottom: 16, whiteSpace: "pre-wrap" }}>
            {err}
          </div>
        )}

        {loading && <div style={{ marginBottom: 12, opacity: 0.7 }}>Loading…</div>}

        {!currentPhoto ? (
          <div style={{ marginTop: 24, fontSize: 18, opacity: 0.8 }}>No more photos available right now.</div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <div style={{ border: "1px solid rgba(0,0,0,.12)", borderRadius: 14, padding: 16, marginBottom: 16, background: "white" }}>
              <img
                src={publicUrl(currentPhoto.storage_path)}
                alt=""
                style={{ width: "100%", height: 560, objectFit: "contain", borderRadius: 10 }}
              />
            </div>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              {/* Relevant score on LEFT */}
              <Section
                title="Relevant score"
                value={relevance}
                onChange={setRelevance}
                rationale={relevanceWhy}
                setRationale={setRelevanceWhy}
                baseline={0}
                scaleLabels={{
                  left: "0 — Not representative",
                  mid: "5 — Neither representative nor unrepresentative",
                  right: "10 — Very representative",
                }}
              />

              {/* Wealth score on RIGHT */}
              <Section
                title="Level of wealth"
                value={wealth}
                onChange={setWealth}
                rationale={wealthWhy}
                setRationale={setWealthWhy}
                baseline={5}
                scaleLabels={{
                  left: "0 — Extremely poor",
                  mid: "5 — Neither poor nor rich",
                  right: "10 — Extremely rich",
                }}
              />
            </div>

            <div style={{ height: 22 }} />

            <button
              onClick={saveAndNext}
              disabled={!canSave || loading}
              style={{
                padding: "12px 18px",
                fontSize: 16,
                borderRadius: 12,
                border: "1px solid #111",
                background: canSave ? "#111" : "#c9c9c9",
                color: "white",
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
  baseline,
  scaleLabels,
}: {
  title: string;
  value: number;
  onChange: (v: number) => void;
  rationale: string;
  setRationale: (s: string) => void;
  baseline: number;
  scaleLabels: { left: string; mid: string; right: string };
}) {
  const needsWhy = value !== baseline;

  return (
    <div style={{ border: "1px solid rgba(0,0,0,.12)", borderRadius: 14, padding: 16, background: "white" }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input type="range" min={0} max={10} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} />
        <div style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>{scaleLabels.left}</span>
        <span style={{ textAlign: "center", flex: 1 }}>{scaleLabels.mid}</span>
        <span style={{ textAlign: "right" }}>{scaleLabels.right}</span>
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
            border: needsWhy ? "1px solid rgba(22,163,74,.9)" : "1px solid rgba(0,0,0,.18)",
            outline: "none",
          }}
        />
        {needsWhy && rationale.trim().length === 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "rgb(22,163,74)" }}>Required.</div>
        )}
      </div>
    </div>
  );
}