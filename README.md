# 🥾 Diario Trekking

App Next.js per registrare e visualizzare le tue escursioni tramite file TCX.

## Funzionalità

- **Upload drag & drop** di file `.tcx` (Garmin, Amazfit, Polar, Suunto…)
- **Mappa GPS interattiva** del tracciato (Leaflet + OpenStreetMap)
- **Grafici**: Frequenza Cardiaca, Profilo Altimetrico, Velocità
- **Export Excel** (.xlsx) con riepilogo, trackpoint e statistiche per minuto
- **Export Word** (.docx) documento narrativo formattato
- **Note e tag** personalizzabili per ogni escursione
- **Statistiche globali** con grafici aggregati

## Avvio in locale

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000)

## Deploy su Vercel

1. Crea un repo GitHub e carica tutti i file
2. Vai su [vercel.com](https://vercel.com) → "New Project"
3. Importa il repo GitHub
4. Vercel rileva automaticamente Next.js → clicca **Deploy**

Il deploy è automatico ad ogni `git push` sul branch `main`.

## Stack

- [Next.js 14](https://nextjs.org/) — React framework
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [Leaflet.js](https://leafletjs.com/) — mappe interattive
- [Recharts](https://recharts.org/) — grafici
- [SheetJS](https://sheetjs.com/) — export Excel
- [docx](https://docx.js.org/) — export Word
- [date-fns](https://date-fns.org/) — formattazione date

## Note tecniche

I dati sono salvati nel `localStorage` del browser. Non è necessario un backend.
