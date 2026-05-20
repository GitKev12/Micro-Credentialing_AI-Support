function AppLayout({ children }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="brand-kicker">Capstone Project Dev</p>
          <h1 className="brand-title">MERN foundation with a clean split between client and server.</h1>
          <p className="brand-copy">
            This starter ships with a React client, an Express API, Mongoose-ready database
            configuration, and root scripts that keep daily development simple.
          </p>
        </div>
        <div className="status-pill">React + Express + MongoDB + Node</div>
      </header>
      <main>{children}</main>
    </div>
  );
}

export default AppLayout;
