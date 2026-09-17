import React, { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { User, Lock, Mail, ArrowLeft, Loader2 } from "lucide-react";
import { auth, db } from "../firebase";

/**
 * Sign in / sign up for a real Owner'sLOCAL Customer account -- its own
 * Firebase Auth user plus a customer_accounts/{uid} doc, completely
 * separate from Owner/Employee accounts (see App.tsx's onAuthStateChanged,
 * which checks customer_accounts first and renders CustomerAppShell
 * instead of the business dashboard once this succeeds). This component
 * never sets any app-level session state itself -- that listener does it
 * for every login, this or the business one, so there's exactly one place
 * that decides who's logged in as what.
 */
export const CustomerLoginPanel: React.FC<{ onSwitchToBusiness: () => void }> = ({ onSwitchToBusiness }) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const friendlyError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || "";
    if (code === "auth/email-already-in-use") return "An account already exists with that email -- sign in instead.";
    if (code === "auth/invalid-email") return "Enter a valid email address.";
    if (code === "auth/weak-password") return "Use a password with at least 6 characters.";
    if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") return "Email or password is incorrect.";
    return "That didn't work -- check your connection and try again.";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      setError("Enter your email and password.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Enter your name.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        await setDoc(doc(db, "customer_accounts", credential.user.uid), {
          id: credential.user.uid,
          name: name.trim(),
          email: cleanEmail,
          createdAt: new Date().toISOString(),
          updatedAt: serverTimestamp()
        });
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      }
      // No further action needed -- App.tsx's onAuthStateChanged listener
      // picks up the new session and renders CustomerAppShell.
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto rounded-3xl border border-[#9EC8EF] bg-white/95 shadow-2xl p-6 sm:p-8">
      <button type="button" onClick={onSwitchToBusiness} className="flex items-center gap-1.5 text-xs font-bold text-[#5E7393] hover:text-[#1F3557] mb-5">
        <ArrowLeft className="w-3.5 h-3.5" /> Business Login
      </button>

      <h1 className="text-xl font-black text-[#1F3557] mb-1">{mode === "signin" ? "Customer Login" : "Create Your Free Account"}</h1>
      <p className="text-xs text-[#5E7393] font-semibold mb-5">
        {mode === "signin" ? "See your jobs, estimates, invoices, and messages -- from every service professional you use." : "One free account works with every Owner'sLOCAL business you use -- your landscaper, your roofer, your pool guy, all in one place."}
      </p>

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <label className="block">
            <span className="sr-only">Full name</span>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9EC8EF]" />
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full pl-9 pr-3 py-2.5 border border-[#9EC8EF] rounded-xl text-sm focus:outline-none focus:border-[#315C9F]" />
            </div>
          </label>
        )}
        <label className="block">
          <span className="sr-only">Email</span>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9EC8EF]" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full pl-9 pr-3 py-2.5 border border-[#9EC8EF] rounded-xl text-sm focus:outline-none focus:border-[#315C9F]" />
          </div>
        </label>
        <label className="block">
          <span className="sr-only">Password</span>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9EC8EF]" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full pl-9 pr-3 py-2.5 border border-[#9EC8EF] rounded-xl text-sm focus:outline-none focus:border-[#315C9F]" />
          </div>
        </label>

        {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

        <button type="submit" disabled={busy} className="w-full py-3 bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-50 text-white rounded-xl text-sm font-black uppercase tracking-wide flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === "signin" ? "Log In" : "Create Free Account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
        className="mt-4 w-full text-center text-xs font-bold text-[#315C9F]"
      >
        {mode === "signin" ? "New here? Create a free account" : "Already have an account? Log in"}
      </button>
    </div>
  );
};
