import { NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          Bridge Tutor
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>
            Lessons
          </NavLink>
          <NavLink to="/progress">Progress</NavLink>
          <NavLink to="/mistakes">Mistakes</NavLink>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
