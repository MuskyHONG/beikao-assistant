import React from "react";
import { createRoot } from "react-dom/client";
import { ProductionApp } from './ProductionApp';
import "./styles.css";
import { EngineeringNotice } from './EngineeringNotice';

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <EngineeringNotice />
    <ProductionApp />
  </React.StrictMode>,
);
