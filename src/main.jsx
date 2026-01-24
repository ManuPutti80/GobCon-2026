import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// QUESTA RIGA QUI SOTTO È FONDAMENTALE! Senza questa, niente grafica.
import './index.css' 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)