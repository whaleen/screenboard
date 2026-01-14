import React, { useEffect, useMemo, useState } from "react";

interface Viewport {
  id: string;
  name: string;
  width: number;
  height: number;
}

interface StateItem {
  id: string;
  name: string;
  storageState?: string;
}

interface Screen {
  id: string;
  name: string;
  url?: string;
  template?: string;
  params?: Record<string, string[]>;
  states?: string[];
  viewports?: string[];
}

interface FlowStep {
  type: string;
}

interface Flow {
  id: string;
  name: string;
  steps: FlowStep[];
}

interface Config {
  app?: { baseUrl?: string; command?: string; cwd?: string };
  output?: { dir?: string; title?: string };
  viewports?: Viewport[];
  states?: StateItem[];
  screens?: Screen[];
  flows?: Flow[];
}

interface Status {
  connected: boolean;
  url?: string;
  baseUrl?: string;
  recording?: boolean;
}

const defaultViewport: Viewport = { id: "desktop", name: "Desktop", width: 1280, height: 720 };
const defaultState: StateItem = { id: "default", name: "Default" };

export default function App() {
  const [config, setConfig] = useState<Config>({});
  const [status, setStatus] = useState<Status>({ connected: false });
  const [captureName, setCaptureName] = useState("Home");
  const [captureUrl, setCaptureUrl] = useState("/");
  const [launchBaseUrl, setLaunchBaseUrl] = useState("");
  const [gotoUrl, setGotoUrl] = useState("/");
  const [viewportId, setViewportId] = useState("desktop");
  const [stateId, setStateId] = useState("default");
  const [selectorType, setSelectorType] = useState("css");
  const [selectorValue, setSelectorValue] = useState("");
  const [selectorResult, setSelectorResult] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Flow");

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/config");
      const data = await res.json();
      const suggestionsRes = await fetch("/api/suggestions");
      const suggestions = await suggestionsRes.json();
      if (suggestions && (!data.screens || data.screens.length === 0)) {
        setConfig(suggestions);
      } else {
        setConfig(data);
      }
      if (data.app?.baseUrl) {
        setLaunchBaseUrl(data.app.baseUrl);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch("/api/status");
      const data = await res.json();
      setStatus(data);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const viewports = config.viewports && config.viewports.length > 0 ? config.viewports : [defaultViewport];
  const states = config.states && config.states.length > 0 ? config.states : [defaultState];

  useEffect(() => {
    if (!viewports.find((item) => item.id === viewportId)) {
      setViewportId(viewports[0].id);
    }
  }, [viewports, viewportId]);

  useEffect(() => {
    if (!states.find((item) => item.id === stateId)) {
      setStateId(states[0].id);
    }
  }, [states, stateId]);

  const capturedScreens = config.screens ?? [];
  const flows = config.flows ?? [];

  const selectorPayload = useMemo(() => {
    if (!selectorValue) return null;
    switch (selectorType) {
      case "testId":
        return { testId: selectorValue };
      case "text":
        return { text: selectorValue };
      case "role": {
        const [role, name] = selectorValue.split(":");
        return { role, name };
      }
      default:
        return { css: selectorValue };
    }
  }, [selectorType, selectorValue]);

  const handleLaunch = async () => {
    await fetch("/api/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: launchBaseUrl, viewportId, stateId, config })
    });
  };

  const handleGoto = async () => {
    await fetch("/api/goto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: gotoUrl || "/" })
    });
  };

  const handleCapture = async () => {
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: captureName, url: captureUrl || undefined, viewportId, stateId, config })
    });
    const data = await res.json();
    const screen = data.screen ?? data;
    setConfig((prev) => ({
      ...prev,
      screens: [...(prev.screens ?? []), screen]
    }));
  };

  const handleValidate = async () => {
    if (!selectorPayload) return;
    const res = await fetch("/api/validateSelector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selector: selectorPayload })
    });
    const data = await res.json();
    setSelectorResult(`${data.count} matches`);
  };

  const handleSave = async () => {
    const payload = {
      ...config,
      app: {
        ...(config.app ?? {}),
        baseUrl: launchBaseUrl || config.app?.baseUrl
      }
    };
    await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  };

  const handleAddViewport = () => {
    const next: Viewport = {
      id: `viewport-${viewports.length + 1}`,
      name: `Viewport ${viewports.length + 1}`,
      width: 375,
      height: 812
    };
    setConfig((prev) => ({
      ...prev,
      viewports: [...(prev.viewports ?? []), next]
    }));
  };

  const handleAddState = () => {
    const next: StateItem = {
      id: `state-${states.length + 1}`,
      name: `State ${states.length + 1}`
    };
    setConfig((prev) => ({
      ...prev,
      states: [...(prev.states ?? []), next]
    }));
  };

  const handleStartRecording = async () => {
    await fetch("/api/record/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: flowName })
    });
  };

  const handleStopRecording = async () => {
    const res = await fetch("/api/record/stop", { method: "POST" });
    const data = await res.json();
    if (data) {
      setConfig((prev) => ({
        ...prev,
        flows: [...(prev.flows ?? []), data]
      }));
    }
  };

  return (
    <div className="studio">
      <header>
        <div>
          <p className="eyebrow">Screenboard Studio</p>
          <h1>Build your UI board in real time.</h1>
          <p className="subcopy">Capture screens, record flows, and save JSON configs without touching your app UI.</p>
        </div>
        <div className="status">
          <span className={status.connected ? "pill active" : "pill"}>
            {status.connected ? "Browser live" : "Browser idle"}
          </span>
          <span className="pill">{status.url ? `On ${status.url}` : "No page"}</span>
        </div>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>Session</h2>
          <label>
            Base URL
            <input value={launchBaseUrl} onChange={(event) => setLaunchBaseUrl(event.target.value)} placeholder="http://localhost:5173" />
          </label>
          <div className="row">
            <label>
              Viewport
              <select value={viewportId} onChange={(event) => setViewportId(event.target.value)}>
                {viewports.map((viewport) => (
                  <option key={viewport.id} value={viewport.id}>
                    {viewport.name} ({viewport.width}×{viewport.height})
                  </option>
                ))}
              </select>
            </label>
            <label>
              State
              <select value={stateId} onChange={(event) => setStateId(event.target.value)}>
                {states.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={handleLaunch}>Launch browser</button>
          <div className="row">
            <label>
              Go to
              <input value={gotoUrl} onChange={(event) => setGotoUrl(event.target.value)} placeholder="/settings" />
            </label>
            <button className="ghost" onClick={handleGoto}>
              Navigate
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Capture</h2>
          <label>
            Screen name
            <input value={captureName} onChange={(event) => setCaptureName(event.target.value)} />
          </label>
          <label>
            URL (optional)
            <input value={captureUrl} onChange={(event) => setCaptureUrl(event.target.value)} placeholder="/" />
          </label>
          <button onClick={handleCapture}>Capture screen</button>
          <div className="divider" />
          <h3>Flow recorder</h3>
          <label>
            Flow name
            <input value={flowName} onChange={(event) => setFlowName(event.target.value)} />
          </label>
          <div className="row">
            <button onClick={handleStartRecording}>Start</button>
            <button className="ghost" onClick={handleStopRecording}>
              Stop & save
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Selector validator</h2>
          <div className="row">
            <select value={selectorType} onChange={(event) => setSelectorType(event.target.value)}>
              <option value="css">CSS</option>
              <option value="testId">data-testid</option>
              <option value="text">Text</option>
              <option value="role">Role:name</option>
            </select>
            <input value={selectorValue} onChange={(event) => setSelectorValue(event.target.value)} placeholder=".btn.primary" />
          </div>
          <button className="ghost" onClick={handleValidate}>
            Validate
          </button>
          {selectorResult && <p className="hint">{selectorResult}</p>}
        </section>

        <section className="panel">
          <h2>Viewports</h2>
          <div className="list">
            {viewports.map((viewport) => (
              <div key={viewport.id} className="list-item">
                <strong>{viewport.name}</strong>
                <span>
                  {viewport.width}×{viewport.height}
                </span>
              </div>
            ))}
          </div>
          <button className="ghost" onClick={handleAddViewport}>
            Add viewport
          </button>
        </section>

        <section className="panel">
          <h2>States</h2>
          <div className="list">
            {states.map((state) => (
              <div key={state.id} className="list-item">
                <strong>{state.name}</strong>
                <span>{state.storageState ?? "default"}</span>
              </div>
            ))}
          </div>
          <button className="ghost" onClick={handleAddState}>
            Add state
          </button>
        </section>

        <section className="panel wide">
          <h2>Captured screens</h2>
          {capturedScreens.length === 0 ? (
            <p className="hint">No screens captured yet.</p>
          ) : (
            <div className="table">
              {capturedScreens.map((screen) => (
                <div key={screen.id} className="table-row">
                  <div>
                    <strong>{screen.name}</strong>
                    <span>{screen.url ?? screen.template ?? ""}</span>
                  </div>
                  <span className="tag">{screen.id}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel wide">
          <h2>Flows</h2>
          {flows.length === 0 ? (
            <p className="hint">No flows recorded yet.</p>
          ) : (
            <div className="table">
              {flows.map((flow) => (
                <div key={flow.id} className="table-row">
                  <div>
                    <strong>{flow.name}</strong>
                    <span>{flow.steps.length} steps</span>
                  </div>
                  <span className="tag">{flow.id}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer>
        <button onClick={handleSave}>Save screenboard.json</button>
      </footer>
    </div>
  );
}
