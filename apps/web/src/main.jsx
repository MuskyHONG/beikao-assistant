import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProductionApp } from './ProductionApp';
import './styles.css';
import './whiteboard-theme.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ProductionApp />
  </React.StrictMode>,
);
