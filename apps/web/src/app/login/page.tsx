import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <main className="login-page">
      <section className="login-visual" aria-label="VECTRIX product introduction">
        <div style={{ position: "relative", zIndex: 1 }}>
          <span className="brand">
            <BrandMark className="brand-mark" />
            <span>
              <span className="brand-word">VECTRIX</span>
              <span className="brand-sub">ENGINEERING WORKSPACE</span>
            </span>
          </span>
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 540 }}>
          <p
            className="mono"
            style={{
              color: "#e5a33a",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              margin: "0 0 14px",
            }}
          >
            Plan · Circuit · Route · Verify · Issue
          </p>
          <h2
            style={{
              margin: 0,
              fontSize: "clamp(26px, 3.4vw, 44px)",
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              fontWeight: 640,
              maxWidth: "19ch",
            }}
          >
            One model from drawing sheet to bill of quantities.
          </h2>
          <p
            style={{
              margin: "16px 0 0",
              color: "#b9c0b7",
              fontSize: 14,
              lineHeight: 1.6,
              maxWidth: "46ch",
            }}
          >
            Move an outlet and its circuit load, route length, voltage-drop result and open
            findings move with it. No reconciliation spreadsheet.
          </p>
        </div>

        <LoginPlan />

        <div
          className="mono"
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            gap: 24,
            color: "#7f887d",
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          <span>Advisory calculations</span>
          <span>Not a compliance certificate</span>
          <span>PT / EU reference</span>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 26,
            }}
          >
            <span className="chip">Engineer access</span>
            <ThemeToggle compact />
          </div>
          <h1 className="login-title">Sign in to the workspace</h1>
          <p className="login-lede">
            Your organisation provisions accounts. A session is scoped to its projects and
            permissions.
          </p>
          <LoginForm />
          <div className="demo-note">
            <div
              className="field-label"
              style={{ marginBottom: 7, display: "flex", justifyContent: "space-between" }}
            >
              <span>Demo project access</span>
              <span>VX-DEMO-001</span>
            </div>
            <p className="mono" style={{ margin: 0, lineHeight: 1.7 }}>
              engineer@vectrix.pt
              <br />
              VectrixDemo!2026
            </p>
            <p
              style={{
                margin: "7px 0 0",
                color: "var(--ink-muted)",
                fontSize: 11,
                lineHeight: 1.45,
              }}
            >
              Engineer role: design and validation. A technician account is also seeded, with
              read access to design data.
            </p>
          </div>
          <div className="login-foot">
            <span>VECTRIX OS · MVP</span>
            <span>Calculations advisory</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoginPlan() {
  return (
    <svg
      className="login-plan"
      viewBox="0 0 760 460"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <pattern id="login-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" stroke="#ffffff" strokeOpacity="0.045" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="760" height="460" fill="url(#login-grid)" />
      <g opacity="0.9">
        <path d="M80 90H700V390H80V90Z" stroke="#e8ece3" strokeOpacity="0.24" strokeWidth="2" />
        <path
          d="M80 250H320M320 90V390M320 250H520M520 90V390M520 250H700"
          stroke="#e8ece3"
          strokeOpacity="0.16"
          strokeWidth="1.2"
        />
        <path d="M320 250H520V390" stroke="#e8ece3" strokeOpacity="0.16" strokeWidth="1.2" />
      </g>

      <g stroke="#e5a33a" strokeOpacity="0.8" strokeWidth="1.4">
        <path d="M160 390V342H255V390" />
        <path d="M255 342H160" />
      </g>
      <g>
        <circle cx="255" cy="342" r="4" fill="#e5a33a" />
        <circle cx="160" cy="342" r="3" fill="#e5a33a" fillOpacity="0.65" />
      </g>

      <g stroke="#7fa9e6" strokeWidth="1.6" strokeDasharray="7 4" opacity="0.9">
        <path d="M114 330H160V298H255V230H420V198" />
        <path d="M420 198H604" />
      </g>
      <g fill="#7fa9e6">
        <circle cx="114" cy="330" r="3.4" />
        <circle cx="420" cy="198" r="3.4" />
        <circle cx="604" cy="198" r="3.4" />
      </g>

      <g>
        {[
          [130, 150],
          [205, 150],
          [280, 150],
          [390, 130],
          [470, 130],
          [550, 130],
          [630, 150],
          [390, 320],
          [470, 320],
          [550, 320],
          [630, 320],
        ].map(([x, y], index) => (
          <g key={index}>
            <circle cx={x} cy={y} r="9" stroke="#dfe5db" strokeOpacity="0.5" strokeWidth="1" />
            <circle cx={x} cy={y} r="2.2" fill="#dfe5db" fillOpacity="0.7" />
          </g>
        ))}
      </g>

      <g stroke="#ffffff" strokeOpacity="0.12" strokeWidth="0.7">
        <path d="M80 420H700" />
        <path d="M80 414V426M700 414V426" />
      </g>
      <text x="390" y="440" textAnchor="middle" fill="#ffffff" fillOpacity="0.3" fontSize="8" fontFamily="JetBrains Mono Variable, monospace" letterSpacing="1.5">
        11 000 mm
      </text>

      <g opacity="0.7">
        <rect x="560" y="360" width="140" height="30" stroke="#ffffff" strokeOpacity="0.15" />
        <text x="570" y="379" fill="#ffffff" fillOpacity="0.45" fontSize="7" fontFamily="JetBrains Mono Variable, monospace" letterSpacing="1">
          T2 · LEVEL 0 · REV A
        </text>
      </g>
    </svg>
  );
}
