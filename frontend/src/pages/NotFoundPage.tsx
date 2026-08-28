import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="page-state" aria-labelledby="not-found-title">
      <div className="page-state-card">
        <span className="eyebrow">404</span>
        <h1 id="not-found-title">Page not found</h1>
        <p>The page you requested does not exist.</p>
        <Link className="resource-hero-link" to="/">Back to CForge</Link>
      </div>
    </section>
  );
}
