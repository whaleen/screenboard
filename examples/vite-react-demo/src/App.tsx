import React, { useEffect, useState } from "react";

const routes: Record<string, React.ReactNode> = {
  "/": <Home />,
  "/pricing": <Pricing />,
  "/settings": <Settings />
};

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const navigate = (next: string) => {
    window.history.pushState({}, "", next);
    setPath(next);
  };

  return (
    <div className="app">
      <nav>
        <button data-testid="nav-home" onClick={() => navigate("/")}>Home</button>
        <button data-testid="nav-pricing" onClick={() => navigate("/pricing")}>Pricing</button>
        <button data-testid="nav-settings" onClick={() => navigate("/settings")}>Settings</button>
      </nav>
      <main>{routes[path] ?? <NotFound />}</main>
    </div>
  );
}

function Home() {
  return (
    <section className="card">
      <h1 data-testid="home-title">Welcome to Screenboard</h1>
      <p>Explore the UI flows and capture screens with confidence.</p>
      <div className="grid">
        <div className="tile" data-testid="tile-analytics">
          <h3>Analytics</h3>
          <p>Track conversion and engagement.</p>
        </div>
        <div className="tile" data-testid="tile-releases">
          <h3>Releases</h3>
          <p>Ship updates with clarity.</p>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="card">
      <h1>Plans that scale</h1>
      <div className="grid">
        <div className="tile">
          <h3>Starter</h3>
          <p>Capture up to 10 screens.</p>
        </div>
        <div className="tile">
          <h3>Team</h3>
          <p>Unlimited flows and viewports.</p>
        </div>
      </div>
      <button data-testid="cta-upgrade">Upgrade</button>
    </section>
  );
}

function Settings() {
  return (
    <section className="card">
      <h1>Workspace settings</h1>
      <form className="form">
        <label>
          Workspace name
          <input data-testid="input-workspace" placeholder="Studio" />
        </label>
        <label>
          Notification email
          <input data-testid="input-email" placeholder="team@screenboard.dev" />
        </label>
        <button data-testid="save-settings" type="button">
          Save changes
        </button>
      </form>
    </section>
  );
}

function NotFound() {
  return (
    <section className="card">
      <h1>Page not found</h1>
      <p>Pick a route from the navigation.</p>
    </section>
  );
}
