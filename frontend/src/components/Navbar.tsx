import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, Settings, X } from 'lucide-react';

const navigation = [
  { label: 'Compiler', to: '/' },
  { label: 'Resources', to: '/resources' },
  { label: 'Docs', to: '/docs' },
  { label: 'About', to: '/about' },
];

export default function Navbar({ onSettings }: { onSettings: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="container nav-inner">
        <Link className="brand" to="/" onClick={closeMenu} aria-label="CForge home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>CForge</span>
        </Link>

        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button className="settings-button" type="button" aria-label="Settings" onClick={onSettings}>
          <Settings size={18} strokeWidth={1.8} />
          <span>Settings</span>
        </button>

        <button className="menu-button" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `mobile-nav-link${isActive ? ' active' : ''}`} onClick={closeMenu}>
              {item.label}
            </NavLink>
          ))}
          <button className="mobile-settings" type="button" onClick={() => { closeMenu(); onSettings(); }}>
            <Settings size={18} /> Settings
          </button>
        </nav>
      )}
    </header>
  );
}
