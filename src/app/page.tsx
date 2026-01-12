"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase, publicUrl } from "../lib/supabaseClient";

type PhotoRow = {
  id: string;
  storage_path: string;
};

export default function Page() {
  const [session, setSession] = useState<any>(null);

  // auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // app state
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [currentPhoto, setCurrentPhoto] = useState<PhotoRow | null>(null);

  const [wealth, setWealth] = useState<number>(5);
  const [wealthWhy, setWealthWhy] = useState<string>("");

  const [relevance, setRelevance] = useState<number>(5);
  const [relevanceWhy, setRelevanceWhy] = useState<string>("");

  // ---- auth wiring ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
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

  const userId = session?.user?.id as string | undefined;

  // ---- helpers ----
  const wealthNeedsWhy = wealth !== 5;
  const relevanceNeedsWhy = relevance !== 5;

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
    setRelevance(5);
    setRelevanceWhy("");
  }

  // ---- auth actions ----
  async function signUp() {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setErr(error.message);
      else setErr("Sign up successful. If email confirmation is enabled, confirm then sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function signIn() {
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setErr(null);
    await supabase.auth.signOut();
  }

  // ---- core app: load next photo for this user ----
  async function loadNextPhoto() {
    await supabase.rpc("ensure_queue", { anchor_n: 20 });
    if (!userId) return;
    setErr(null);
    setLoading(true);
    try {
      // Take the earliest unserved queued photo for this user
      const { data: q, error: qErr } = await supabase
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

      const { data: p, error: pErr } = await supabase
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
      // Upsert score (if they revisit, latest wins)
      const payload = {
        user_id: userId,
        photo_id: currentPhoto.id,
        wealth_score: wealth,
        wealth_rationale: wealthNeedsWhy ? wealthWhy.trim() : null,
        relevance_score: relevance,
        relevance_rationale: relevanceNeedsWhy ? relevanceWhy.trim() : null,
      };

      const { error: upErr } = await supabase
        .from("user_photo_scores")
        .upsert(payload, { onConflict: "user_id,photo_id" });

      if (upErr) throw upErr;

      // Mark this photo as served in queue
      const { error: servedErr } = await supabase
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

  // ---- UI ----
  if (!session) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 40, marginBottom: 24 }}>Verifying Art</h1>

        <div style={{ display: "grid", gap: 12 }}>
          <input
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 12, fontSize: 16 }}
            autoComplete="email"
          />
          <input
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 12, fontSize: 16 }}
            autoComplete="current-password"
          />

          <div style={{ display: "flex", gap: 16 }}>
            <button onClick={signIn} disabled={loading} style={{ padding: "10px 14px" }}>
              Sign in
            </button>
            <button onClick={signUp} disabled={loading} style={{ padding: "10px 14px" }}>
              Sign up
            </button>
          </div>

          {err && (
            <div style={{ border: "1px solid #f2a2a2", padding: 12, borderRadius: 8, color: "#a11" }}>
              {err}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 40, marginBottom: 10 }}>Verifying Art</h1>
        <button onClick={signOut} style={{ padding: "8px 12px" }}>
          Sign out
        </button>
      </div>

      {err && (
        <div style={{ border: "1px solid #f2a2a2", padding: 12, borderRadius: 8, color: "#a11", marginBottom: 16 }}>
          {err}
        </div>
      )}

      {loading && <div style={{ marginBottom: 12, opacity: 0.7 }}>Loading…</div>}

      {!currentPhoto ? (
        <div style={{ marginTop: 24, fontSize: 18, opacity: 0.8 }}>No more photos available right now.</div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              background: "white",
            }}
          >
            <img
              src={publicUrl(currentPhoto.storage_path)}
              alt={currentPhoto.storage_path}
              style={{ width: "100%", height: 520, objectFit: "contain" }}
            />
            {/* <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>{currentPhoto.storage_path}</div> */}
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div style={{ flex: 1 }}>
              <Section
                title="Level of wealth"
                value={wealth}
                onChange={setWealth}
                rationale={wealthWhy}
                setRationale={setWealthWhy}
              />
            </div>

            <div style={{ flex: 1 }}>
              <Section
                title="Relevant score"
                value={relevance}
                onChange={setRelevance}
                rationale={relevanceWhy}
                setRationale={setRelevanceWhy}
              />
            </div>
          </div>

          <div style={{ height: 22 }} />

          <button
            onClick={saveAndNext}
            disabled={!canSave || loading}
            style={{
              padding: "12px 18px",
              fontSize: 16,
              borderRadius: 10,
              border: "1px solid #111",
              background: canSave ? "#111" : "#ccc",
              color: "white",
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            Save & Next
          </button>

          {!canSave && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.7 }}>
              Tip: if you move a slider off 5, you must type a rationale before saving.
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  value,
  onChange,
  rationale,
  setRationale,
}: {
  title: string;
  value: number;
  onChange: (v: number) => void;
  rationale: string;
  setRationale: (s: string) => void;
}) {
  const needsWhy = value !== 5;
  const sliderColor = value === 5 ? "#2563eb" : "#16a34a"; // blue -> green

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16, background: "white" }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>{title}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            width: "100%",
            accentColor: sliderColor, // works in modern browsers
          }}
        />
        <div style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <textarea
          placeholder={needsWhy ? "Rationale (required because you chose a score other than 5)" : "Rationale (optional when score = 5)"}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: needsWhy ? "1px solid #16a34a" : "1px solid #ddd",
            outline: "none",
          }}
        />
        {needsWhy && rationale.trim().length === 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#16a34a" }}>Required.</div>
        )}
      </div>
    </div>
  );
}