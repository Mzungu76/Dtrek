#!/usr/bin/env bash
# Misura (dry-run) la dimensione di un estratto Protomaps (PMTiles) per un bbox, a più maxzoom.
# Pensato per Termux su Android (funziona anche su Linux/macOS). Nessuna scrittura oltre a ./pmtiles-probe/,
# nessun account, nessuna chiave. --dry-run legge solo header e directory del file remoto (range request):
# pochi MB di traffico in tutto, ma meglio su Wi-Fi. Non scarica nessun tile.
#
# Uso (Termux):
#   pkg install curl tar
#   bash scripts/maps/probe-protomaps-size.sh
#   BBOX="6.6,35.4,18.6,47.1" MAXZOOMS="13 14 15" BUILD_DATE=20260929 bash scripts/maps/probe-protomaps-size.sh
#
# Se la rete dal binario Go fallisce su Termux (errori tipo "lookup ... [::1]:53"): il binario Go non trova
# /etc/resolv.conf. Lo script riprova da solo dentro `termux-chroot` se è installato (pkg install proot).
set -uo pipefail

BBOX="${BBOX:-6.6,35.4,18.6,47.1}"   # Italia indicativa (include un po' di paesi vicini)
MAXZOOMS="${MAXZOOMS:-13 14 15}"
BUILD_DATE="${BUILD_DATE:-}"         # YYYYMMDD; vuoto = la più recente degli ultimi 14 giorni
WORK="${WORK:-./pmtiles-probe}"

mkdir -p "$WORK"
cd "$WORK" || exit 1
: > risultati.txt
log() { echo "$*" | tee -a risultati.txt; }

case "$(uname -m)" in
  aarch64|arm64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x86_64" ;;
  *) echo "Architettura non supportata: $(uname -m)" >&2; exit 1 ;;
esac
case "$(uname -s)" in
  Linux)  OS="Linux" ;;
  Darwin) OS="Darwin" ;;
  *) echo "Sistema non supportato: $(uname -s)" >&2; exit 1 ;;
esac

# 1) CLI ufficiale go-pmtiles (ultima release su GitHub)
if [ ! -x ./pmtiles ]; then
  echo "Cerco l'ultima release di go-pmtiles per ${OS}_${ARCH}..."
  ASSET_URL="$(curl -fsSL https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
    | grep -o "https://[^\"]*${OS}_${ARCH}\.tar\.gz" | head -1)"
  [ -n "$ASSET_URL" ] || { echo "Nessun asset ${OS}_${ARCH} trovato nella release." >&2; exit 1; }
  echo "Scarico $ASSET_URL"
  curl -fsSL "$ASSET_URL" -o pmtiles.tar.gz || exit 1
  tar -xzf pmtiles.tar.gz pmtiles || exit 1
  chmod +x pmtiles
fi
log "CLI: $(./pmtiles version 2>&1 | head -1)"

# 2) Build Protomaps da usare
if [ -n "$BUILD_DATE" ]; then
  SRC="https://build.protomaps.com/${BUILD_DATE}.pmtiles"
  curl -fsSI "$SRC" >/dev/null || { echo "Build non trovata: $SRC" >&2; exit 1; }
else
  SRC=""
  for i in $(seq 0 14); do
    D="$(date -u -d "-${i} day" +%Y%m%d 2>/dev/null || date -u -v-"${i}"d +%Y%m%d)"
    if curl -fsSI "https://build.protomaps.com/${D}.pmtiles" >/dev/null 2>&1; then
      SRC="https://build.protomaps.com/${D}.pmtiles"; break
    fi
  done
  [ -n "$SRC" ] || { echo "Nessuna build negli ultimi 14 giorni (o rete bloccata)." >&2; exit 1; }
fi
log "Sorgente: $SRC"
log "Bbox: $BBOX"
log "Dimensione pianeta (byte): $(curl -fsSI "$SRC" | grep -i '^content-length' | tr -d '\r' | awk '{print $2}')"

# 3) Il binario Go su Termux può non risolvere i DNS: prova diretto, altrimenti con termux-chroot
RUN=""
if ! ./pmtiles show "$SRC" >/dev/null 2>&1; then
  if command -v termux-chroot >/dev/null 2>&1; then
    echo "Il binario non raggiunge la rete da solo: riprovo dentro termux-chroot."
    RUN="termux-chroot"
    $RUN ./pmtiles show "$SRC" >/dev/null 2>&1 \
      || { echo "Fallisce anche con termux-chroot. Vedi l'errore con: ./pmtiles show $SRC" >&2; exit 1; }
  else
    echo "Il binario non raggiunge la rete. Su Termux: pkg install proot, poi rilancia lo script." >&2
    ./pmtiles show "$SRC" 2>&1 | tail -3 >&2
    exit 1
  fi
fi

# 4) Dry-run per ogni maxzoom
for Z in $MAXZOOMS; do
  log ""
  log "=== maxzoom $Z ==="
  $RUN ./pmtiles extract "$SRC" "estratto-z${Z}.pmtiles" --bbox="$BBOX" --maxzoom="$Z" --dry-run 2>&1 \
    | tee -a risultati.txt
done

echo
echo "Fatto. Risultati salvati in $(pwd)/risultati.txt"
echo "Il file 'estratto-z*.pmtiles' NON viene creato (dry-run). Incollami il testo sopra."
