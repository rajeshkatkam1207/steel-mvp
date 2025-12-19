import React from "react";
import Scene from "../viwer/Scene";
import Panel from "../ui/panel";
import Topbar from "../ui/topbar";
import "./layout.css";

export default function App() {
  return (
    <div className="app">
      <Topbar />
      <Scene />
      <Panel />
    </div>
  );
}