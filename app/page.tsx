import Brand from "@/components/Brand";
import TopUp from "@/components/TopUp";

export default function Home() {
  return (
    <div className="site-shell">
      <a href="#top-up" className="skip-link">Skip to top-up</a>
      <header className="site-header">
        <Brand />
        <span className="header-note"><span className="status-dot" /> Client payments</span>
      </header>

      <main className="main-grid">
        <section className="intro" aria-labelledby="page-heading">
          <div className="intro-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> Fuel your next move</p>
            <h1 id="page-heading">Top up your<br className="desktop-break" /> ad spend for<br className="desktop-break" /> the period<span className="accent-text">.</span></h1>
            <p className="intro-description">
              More fuel. More momentum. Add to your ad budget with ACH, bank wire, SEPA, or EU bank transfer. We’ll take it from here.
            </p>
            <div className="intro-detail"><span className="detail-line" /> Your next phase of growth starts here.</div>
          </div>
          <p className="settlement-note">
            A little heads-up: bank transfers and wires typically settle in 1–3 business days. Your budget is credited once payment is confirmed.
          </p>
        </section>

        <section id="top-up" className="top-up-region" aria-label="Top up your ad spend">
          <TopUp />
        </section>
      </main>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Unlimited Scaling</span>
        <span>Built for your next level.</span>
      </footer>
    </div>
  );
}
