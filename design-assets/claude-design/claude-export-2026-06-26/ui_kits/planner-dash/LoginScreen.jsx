// Login — branded magic-link / OTP entry (mirrors the real OTP login flow).
function LoginScreen({ onLogin }) {
  const { Input, FormField, Button } = window.SignalThreadDesignSystem_204ca3;
  const { Mail } = window.STIcons;
  const [step, setStep] = React.useState("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-canvas)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <img src="../../assets/signalthread-logo.png" alt="SignalThread" style={{ height: 38 }} />
        </div>
        <div style={{ background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", padding: 28 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 600, color: "var(--text-strong)" }}>
            {step === "email" ? "Sign in" : "Enter your code"}
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--text-muted)" }}>
            {step === "email" ? "We'll email you a 6-digit sign-in code." : `Sent to ${email || "your inbox"}.`}
          </p>

          {step === "email" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <FormField label="Email" htmlFor="login-email">
                <Input id="login-email" icon={Mail} type="email" placeholder="you@company.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <Button variant="primary" onClick={() => setStep("code")} style={{ width: "100%" }}>Send code</Button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <FormField label="6-digit code" htmlFor="login-code">
                <Input id="login-code" placeholder="123456" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  style={{ letterSpacing: "0.3em", fontFamily: "var(--font-mono)" }} />
              </FormField>
              <Button variant="primary" onClick={onLogin} style={{ width: "100%" }}>Verify &amp; continue</Button>
              <button type="button" onClick={() => setStep("email")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--text-muted)", textDecoration: "underline" }}>Use a different email</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
window.LoginScreen = LoginScreen;
