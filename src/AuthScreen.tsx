import { useState } from "react";
import type { FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { auth, firebaseConfigured } from "./lib/firebase";
import { ArrowRight, LockKeyhole, Mail, Radar, UserRound } from "lucide-react";

type AuthMode = "login" | "register" | "reset";

const messageForAuthError = (code: string) => {
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "Este e-mail já possui uma conta. Entre ou recupere sua senha.",
    "auth/invalid-email": "Informe um endereço de e-mail válido.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-disabled": "Esta conta foi desativada.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    "auth/operation-not-allowed": "Ative o login por e-mail e senha no Firebase Authentication."
  };
  return messages[code] || "Não foi possível concluir a operação. Confira os dados e tente novamente.";
};

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!auth) throw new Error("Firebase ainda não foi configurado neste ambiente.");
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
        setNotice("Conta criada. Bem-vindo ao LeadHunter AI!");
      } else if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice("Se existir uma conta para esse e-mail, enviaremos as instruções de recuperação.");
      }
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      setError(code ? messageForAuthError(code) : err instanceof Error ? err.message : "Ocorreu um erro inesperado.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-screen">
    <section className="auth-card">
      <div className="auth-brand"><div className="auth-mark"><Radar size={23}/></div><div><b>lead<span>hunter</span></b><small>INTELLIGENCE SUITE</small></div></div>
      <div className="auth-eyebrow">PROSPECÇÃO INTELIGENTE</div>
      <h1>{mode === "register" ? "Crie sua conta" : mode === "reset" ? "Recupere seu acesso" : "Bem-vindo de volta"}</h1>
      <p className="auth-description">{mode === "register" ? "Crie seu espaço privado para organizar oportunidades comerciais." : mode === "reset" ? "Informe seu e-mail para receber o link de redefinição de senha." : "Entre para acessar sua carteira de leads de qualquer dispositivo."}</p>

      {!firebaseConfigured && <div className="auth-warning"><b>Configuração necessária</b><p>O código de autenticação já está preparado. Para ativá-lo, configure as variáveis VITE_FIREBASE_* na Vercel e no arquivo .env.local, seguindo o README.</p></div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      {notice && <div className="auth-success" role="status">{notice}</div>}

      <form onSubmit={submit}>
        {mode === "register" && <label className="auth-label"><span><UserRound size={14}/> Nome</span><input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" required minLength={2}/></label>}
        <label className="auth-label"><span><Mail size={14}/> E-mail</span><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" required/></label>
        {mode !== "reset" && <label className="auth-label"><span><LockKeyhole size={14}/> Senha</span><input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" required minLength={6}/></label>}
        <button className="auth-submit" type="submit" disabled={busy || !firebaseConfigured}>{busy ? "Aguarde..." : mode === "register" ? "Criar minha conta" : mode === "reset" ? "Enviar recuperação" : "Entrar"} <ArrowRight size={16}/></button>
      </form>
      <div className="auth-links">
        {mode === "login" && <><button onClick={() => { setMode("reset"); setError(""); setNotice(""); }}>Esqueci minha senha</button><span>·</span><button onClick={() => { setMode("register"); setError(""); setNotice(""); }}>Criar conta</button></>}
        {mode !== "login" && <button onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Voltar para entrar</button>}
      </div>
      <div className="auth-security"> <LockKeyhole size={13}/> Seus leads ficam privados na sua conta.</div>
    </section>
  </main>;
}
