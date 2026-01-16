"use client";
export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import { getSupabase, publicUrl } from "../lib/supabaseClient";

type PhotoRow = {
  id: string;
  storage_path: string;
};

// Optional: make anchor count configurable later via Vercel env
const ANCHOR_N = Number(process.env.NEXT_PUBLIC_ANCHOR_N || "20");

export default function Page() {
  const [session, setSession] = useState<any>(null);

  // auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // app state
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [currentPhoto, setCurrentPhoto] = useState<PhotoRow | null>(null);

  // Wealth defaults to 5, rationale required if moved off 5
  const [wealth, setWealth] = useState<number>(5);
  const [wealthWhy, setWealthWhy] = useState<string>("");

  // Relevance defaults to 0, rationale required if moved off 0
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
      const { error } = await getSupabase().auth.resetPasswordForEmail(em, {
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) setErr(error.message);
      else setErr("Password reset email sent. Check your inbox.");
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
    await getSupabase().rpc("ensure_queue", { anchor_n: ANCHOR_N });
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

  const pageWrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f6f7f9",
    color: "#111",
    padding: "32px 16px",
    fontFamily: "system-ui",
  };

  const card: React.CSSProperties = {
    background: "white",
    border: "1px solid #ddd",
    borderRadius: 12,
  };

  // ---- UI (logged out) ----
  if (!session) {
    return (
      <div style={pageWrap}>
        <main style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 32, lineHeight: 1.2, textAlign: "center", margin: "6px 0 22px" }}>
            Does this artwork represent the living conditions of its time?
          </h1>

          <div style={{ display: "grid", gap: 12 }}>
            <input
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ccc", background: "white", color: "#111" }}
              autoComplete="email"
            />
            <input
              placeholder="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #ccc", background: "white", color: "#111" }}
              autoComplete="current-password"
            />

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <button onClick={signIn} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111" }}>
                Sign in
              </button>
              <button onClick={signUp} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111" }}>
                Sign up
              </button>
              <button onClick={forgotPassword} disabled={loading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111" }}>
                Forgot password?
              </button>
            </div>

            {err && (
              <div style={{ border: "1px solid #f2a2a2", padding: 12, borderRadius: 10, color: "#a11", background: "white" }}>
                {err}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ---- UI (logged in) ----
  return (
    <div style={pageWrap}>
      <main style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <h1 style={{ fontSize: 32, lineHeight: 1.2, textAlign: "center", margin: "6px 0 0" }}>
            Does this artwork represent the living conditions of its time?
          </h1>

          <button
            onClick={signOut}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "white",
              color: "#111",
            }}
          >
            Sign out
          </button>
        </div>

        {err && (
          <div style={{ border: "1px solid #f2a2a2", padding: 12, borderRadius: 10, color: "#a11", background: "white", marginBottom: 12 }}>
            {err}
          </div>
        )}

        {loading && <div style={{ marginBottom: 12, opacity: 0.7 }}>Loading…</div>}

        {!currentPhoto ? (
          <div style={{ marginTop: 24, fontSize: 18, opacity: 0.8 }}>No more photos available right now.</div>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...card, padding: 16, marginBottom: 16 }}>
              <img
                src={publicUrl(currentPhoto.storage_path)}
                alt=""
                style={{ width: "100%", height: 520, objectFit: "contain", display: "block" }}
              />
            </div>

            {/* Relevant LEFT, Wealth RIGHT */}
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <Section
                title="Relevant score"
                value={relevance}
                onChange={setRelevance}
                rationale={relevanceWhy}
                setRationale={setRelevanceWhy}
                neutralValue={0}
                labels={{
                  left: "0 — Not representative",
                  middle: "5 — Neither representative",
                  right: "10 — Very representative",
                }}
              />

              <Section
                title="Level of wealth"
                value={wealth}
                onChange={setWealth}
                rationale={wealthWhy}
                setRationale={setWealthWhy}
                neutralValue={5}
                labels={{
                  left: "0 — Extremely poor",
                  middle: "5 — Neither poor nor rich",
                  right: "10 — Extremely rich",
                }}
              />
            </div>

            <div style={{ height: 18 }} />

            <button
              onClick={saveAndNext}
              disabled={!canSave || loading}
              style={{
                padding: "12px 18px",
                fontSize: 16,
                borderRadius: 10,
                border: "1px solid #111",
                background: canSave ? "#111" : "#e5e7eb",
                color: canSave ? "white" : "#666",
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              Save & Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  value,
  onChange,
  rationale,
  setRationale,
  neutralValue,
  labels,
}: {
  title: string;
  value: number;
  onChange: (v: number) => void;
  rationale: string;
  setRationale: (s: string) => void;
  neutralValue: number;
  labels: { left: string; middle: string; right: string };
}) {
  const needsWhy = value !== neutralValue;
  const sliderColor = value === neutralValue ? "#2563eb" : "#16a34a"; // blue if neutral, green if moved

  return (
    <div style={{ background: "white", border: "1px solid #e5e5e5", borderRadius: 12, padding: 16, color: "#111" }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%", accentColor: sliderColor }}
        />
        <div style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8, fontSize: 12, opacity: 0.75 }}>
        <div>{labels.left}</div>
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
            borderRadius: 10,
            border: needsWhy ? "1px solid #16a34a" : "1px solid #ddd",
            outline: "none",
            background: "white",
            color: "#111",
          }}
        />
        {needsWhy && rationale.trim().length === 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#16a34a" }}>Required.</div>
        )}
      </div>
    </div>
  );
}
