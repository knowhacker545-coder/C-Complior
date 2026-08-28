import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Code2, Heart, Search, Star } from 'lucide-react';
import { resources, type Resource } from '../data/resources';

const FAVORITES_KEY = 'cforge-resource-favorites';
const RECENT_KEY = 'cforge-resource-recent';

type Category = 'All' | Resource['category'];
type Difficulty = 'All' | Resource['difficulty'];

function readIds(key: string): number[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

export default function ResourcesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('All');
  const [difficulty, setDifficulty] = useState<Difficulty>('All');
  const [favorites, setFavorites] = useState<number[]>(() => readIds(FAVORITES_KEY));
  const [recent, setRecent] = useState<number[]>(() => readIds(RECENT_KEY));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((resource) => {
      const matchesQuery = !q || `${resource.name} ${resource.description} ${resource.category} ${resource.difficulty}`.toLowerCase().includes(q);
      const matchesCategory = category === 'All' || resource.category === category;
      const matchesDifficulty = difficulty === 'All' || resource.difficulty === difficulty;
      return matchesQuery && matchesCategory && matchesDifficulty;
    });
  }, [query, category, difficulty]);

  const openResource = (resource: Resource) => {
    localStorage.setItem('cforge-resource-code', resource.code);
    const next = [resource.id, ...recent.filter((id) => id !== resource.id)].slice(0, 10);
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    navigate('/');
  };

  const toggleFavorite = (id: number) => {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [id, ...favorites];
    setFavorites(next);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  };

  return (
    <section className="resources-page">
      <div className="container">
        <header className="resources-hero">
          <div>
            <span className="eyebrow"><BookOpen size={13} /> C PROGRAMMING RESOURCES</span>
            <h1>Learn by building.</h1>
            <p>60 working C programs you can read, edit, and compile in CForge.</p>
          </div>
          <Link className="resource-hero-link" to="/">Open Compiler <Code2 size={16} /></Link>
        </header>

        <div className="resource-controls">
          <label className="resource-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search programs…" aria-label="Search resources" /></label>
          <div className="filter-row">
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Filter by category">
              <option>All</option><option>Beginner</option><option>Games</option><option>Arrays & Strings</option><option>Intermediate</option>
            </select>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} aria-label="Filter by difficulty">
              <option>All</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option>
            </select>
          </div>
        </div>

        <div className="resource-summary"><span>{filtered.length} program{filtered.length === 1 ? '' : 's'}</span><span>{favorites.length} favorites · {recent.length} recent</span></div>
        {(favorites.length > 0 || recent.length > 0) && <div className="resource-shelves">
          {favorites.length > 0 && <Shelf title="Favorites" ids={favorites} resources={resources} onOpen={openResource} />}
          {recent.length > 0 && <Shelf title="Recent" ids={recent} resources={resources} onOpen={openResource} />}
        </div>}

        <div className="resource-grid">
          {filtered.map((resource) => (
            <article className="resource-card" key={resource.id}>
              <div className="resource-card-top">
                <span className="resource-number">#{String(resource.id).padStart(2, '0')}</span>
                <button className={`favorite-button${favorites.includes(resource.id) ? ' active' : ''}`} type="button" onClick={() => toggleFavorite(resource.id)} aria-label={`${favorites.includes(resource.id) ? 'Remove' : 'Add'} ${resource.name} favorite`} aria-pressed={favorites.includes(resource.id)}>
                  <Heart size={17} fill={favorites.includes(resource.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              <h2>{resource.name}</h2>
              <p>{resource.description}</p>
              <div className="resource-meta"><span>{resource.category}</span><span><Star size={12} /> {resource.difficulty}</span></div>
              <button className="open-resource" type="button" onClick={() => openResource(resource)}>Open in Editor <Code2 size={15} /></button>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <div className="resource-empty"><Search size={22}/><strong>No programs found</strong><span>Try another search or filter.</span></div>}
      </div>
    </section>
  );
}

function Shelf({ title, ids, resources, onOpen }: { title: string; ids: number[]; resources: Resource[]; onOpen: (resource: Resource) => void }) {
  const items = ids.map(id => resources.find(r => r.id === id)).filter(Boolean) as Resource[];
  return <section className="resource-shelf"><div className="shelf-heading"><h2>{title}</h2><span>{items.length}</span></div><div className="shelf-list">{items.slice(0, 6).map(r => <button key={r.id} type="button" className="shelf-item" onClick={() => onOpen(r)}><span className="shelf-number">#{String(r.id).padStart(2,'0')}</span><span><strong>{r.name}</strong><small>{r.category} · {r.difficulty}</small></span><Code2 size={14}/></button>)}</div></section>;
}
