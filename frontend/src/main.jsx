import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";

// If anything crashes, show what happened instead of a blank page.
class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="shell"><div className="card">
        <h2>Something went wrong</h2>
        <p className="muted">{String(this.state.error.message || this.state.error)}</p>
        <button onClick={() => { this.setState({ error: null }); location.href = "/"; }}>Back to start</button>
      </div></div>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <Boundary><BrowserRouter><App /></BrowserRouter></Boundary>
);
