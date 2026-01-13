"use client";

import React, { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabaseClient";

export default function ResetPage() {
  const supabase = getSupabase();

  const [status, setStatus] = useState<string>("Loading…");
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Supabase recovery links often arrive with tokens in the URL hash:
  // #access_token=...&refresh_token=...&type=recovery
  useEffect(() => {
    async function init() {
      setErr(null);

      try {
        // 1) If tokens are in the URL hash, set the session
        const hash = window.location.hash?.startsWith("#")
          ? window.location.hash.slice(1)
          : "";
        const params = new URLSearchParams(hash);

        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const type = params.get("type");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;
        }

        // 2) Confirm we actually have a session
        const { data, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;

        if (!data.session) {
          setStatus(
            "This reset link is invalid or expired. Please request a new password reset email."
          );
          setReady(false);
          return;
        }

        if (type && type !== "recovery") {
          // Not strictly required, but helps debugging
          setStatus("This link is not a password recovery link.");
          setReady(false);
          return;
        }

        setStatus("Choose a new password.");
        setReady(true);
      } catch (e: any) {
        setStatus("Could not open reset session.");
        setErr(e?.message ?? String(e));
        setReady(false);
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updatePassword() {
    setErr(null);

    if (!password1 || password1.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (password1 !== password2) {
      setErr("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password1,
      });
      if (error) throw error;

      setStatus("Password updated. Redirecting…");
      setReady(false);

      // Optional: sign out so they log in fresh
      await supabase.auth.signOut();

      window.location.href = "/";
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 34, marginBottom: 14 }}>Reset password</h1>

      <div style={{ marginBottom: 14, opacity: 0.85 }}>{status}</div>

      {err && (
        <div style={{ border: "1px solid #f2a2a2", padding: 12, borderRadius: 8, color: "#a11", marginBottom: 12 }}>
          {err}
        </div>
      )}

      {ready && (
        <div style={{ display: "grid", gap: 12 }}>
          <input
            type="password"
            placeholder="New password"
            value={password1}
            onChange={(e) => setPassword1(e.target.value)}
            style={{ padding: 12, fontSize: 16 }}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            style={{ padding: 12, fontSize: 16 }}
            autoComplete="new-password"
          />

          <button onClick={updatePassword} disabled={saving} style={{ padding: "10px 14px" }}>
            {saving ? "Saving…" : "Update password"}
          </button>
        </div>
      )}
    </main>
  );
}