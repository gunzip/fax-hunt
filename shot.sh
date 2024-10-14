#!/bin/bash

# URL base del server
BASE_URL="http://localhost:3000"
# BASE_URL="https://b9dscf5d-3000.euw.devtunnels.ms"

# Unisci il gioco e ottieni il token
JOIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/join" -d"{}")
TOKEN=$(echo "$JOIN_RESPONSE" | jq -r '.token')
USERNAME=$(echo "$JOIN_RESPONSE" | jq -r '.username')
COLOR=$(echo "$JOIN_RESPONSE" | jq -r '.color')

echo "Giocatore unito al gioco:"
echo "Username: $USERNAME"
echo "Token: $TOKEN"
echo "Colore: $COLOR"
echo ""

# Verifica se il token è stato ottenuto correttamente
if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "Errore nell'ottenere il token."
  exit 1
fi

# Array per memorizzare le posizioni e i tempi
declare -a positions_x
declare -a positions_y
declare -a timestamps

# Funzione per ottenere la posizione del bersaglio
function get_target_position() {
  TARGET_RESPONSE=$(curl -s -i -X GET "$BASE_URL/api/target")

  # Controlla se la risposta include un 429
  HTTP_STATUS=$(echo "$TARGET_RESPONSE" | grep HTTP | awk '{print $2}')

  if [ "$HTTP_STATUS" == "429" ]; then
    # Estrai il valore di Retry-After dalle intestazioni
    RETRY_AFTER=$(echo "$TARGET_RESPONSE" | grep "Retry-After:" | awk '{print $2}' | tr -d '\r')
    echo "Troppe richieste. Attendi $RETRY_AFTER secondi."
    sleep $RETRY_AFTER
    return 1
  fi

  # Estrai il corpo della risposta
  TARGET_BODY=$(echo "$TARGET_RESPONSE" | sed -n '/^\r$/,$p' | sed '1d')

  TARGET_X=$(echo "$TARGET_BODY" | jq '.x')
  TARGET_Y=$(echo "$TARGET_BODY" | jq '.y')

  # Memorizza la posizione e il timestamp
  # Usa node per ottenere il timestamp in millisecondi
  current_time=$(node -e 'console.log(Date.now())')
  timestamps+=("$current_time")
  positions_x+=("$TARGET_X")
  positions_y+=("$TARGET_Y")

  # Mantieni solo gli ultimi 2 dati
  if [ "${#positions_x[@]}" -gt 2 ]; then
    positions_x=("${positions_x[@]: -2}")
    positions_y=("${positions_y[@]: -2}")
    timestamps=("${timestamps[@]: -2}")
  fi

  return 0
}

# Funzione per inviare colpi multipli attorno alla posizione prevista
function send_shots() {
  # Controlla se abbiamo abbastanza dati per prevedere
  if [ "${#positions_x[@]}" -lt 2 ]; then
    echo "Dati insufficienti per prevedere la posizione. Attendi il prossimo aggiornamento."
    return
  fi

  # Calcola la velocità stimata
  local x1=${positions_x[0]}
  local y1=${positions_y[0]}
  local t1=${timestamps[0]}

  local x2=${positions_x[1]}
  local y2=${positions_y[1]}
  local t2=${timestamps[1]}

  # Calcola la differenza di tempo in millisecondi
  local dt=$((t2 - t1))
  if [ "$dt" -eq 0 ]; then
    echo "Intervallo di tempo zero, impossibile calcolare la velocità."
    return
  fi

  # Calcola le velocità in pixel per millisecondo
  local vx=$(echo "scale=5; ($x2 - $x1) / $dt" | bc)
  local vy=$(echo "scale=5; ($y2 - $y1) / $dt" | bc)

  # Prevedi la posizione futura tenendo conto del ritardo dell'API
  local api_delay=500 # Ritardo in millisecondi
  local expected_dt=$((api_delay + 500)) # Consideriamo anche il tempo di elaborazione

  local predicted_x=$(echo "scale=5; $x2 + ($vx * $expected_dt)" | bc)
  local predicted_y=$(echo "scale=5; $y2 + ($vy * $expected_dt)" | bc)

  # Assicurati che le coordinate siano all'interno del canvas
  local canvas_width=800
  local canvas_height=600

  predicted_x=$(echo "$predicted_x" | awk -v max="$canvas_width" '{ if ($1 < 0) print 0; else if ($1 > max) print max; else print $1 }')
  predicted_y=$(echo "$predicted_y" | awk -v max="$canvas_height" '{ if ($1 < 0) print 0; else if ($1 > max) print max; else print $1 }')

  # Invia colpi multipli attorno alla posizione prevista
  local num_shots=5
  local spread=30 # Raggio di dispersione dei colpi

  for ((i=0; i<num_shots; i++)); do
    # Genera un angolo casuale
    local angle=$(echo "scale=5; $RANDOM * 2 * 3.14159 / 32768" | bc)
    # Genera una distanza casuale
    local distance=$(echo "scale=5; $RANDOM * $spread / 32768" | bc)
    # Calcola le coordinate del colpo
    local shot_x=$(echo "scale=5; $predicted_x + $distance * c($angle)" | bc -l)
    local shot_y=$(echo "scale=5; $predicted_y + $distance * s($angle)" | bc -l)

    # Arrotonda le coordinate
    shot_x=$(printf "%.0f" "$shot_x")
    shot_y=$(printf "%.0f" "$shot_y")

    # Assicurati che le coordinate siano all'interno del canvas
    shot_x=$(echo "$shot_x" | awk -v max="$canvas_width" '{ if ($1 < 0) print 0; else if ($1 > max) print max; else print $1 }')
    shot_y=$(echo "$shot_y" | awk -v max="$canvas_height" '{ if ($1 < 0) print 0; else if ($1 > max) print max; else print $1 }')

    # Invia il colpo all'API /api/interact
    INTERACT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/interact" \
      -H "Content-Type: application/json" \
      -d "{\"token\":\"$TOKEN\",\"x\":$shot_x,\"y\":$shot_y}")

    MESSAGE=$(echo "$INTERACT_RESPONSE" | jq -r '.message')
    SUCCESS=$(echo "$INTERACT_RESPONSE" | jq '.success')
    HIT=$(echo "$INTERACT_RESPONSE" | jq '.hit')

    # Stampa il risultato del colpo
    echo "Tentativo di colpire a ($shot_x, $shot_y): $MESSAGE"

    # Se il colpo ha colpito, termina lo script
    if [ "$HIT" == "true" ]; then
      echo "Hai colpito il bersaglio e vinto il gioco!"
      exit 0
    fi

    # Se il gioco è terminato, esci dallo script
    if [ "$SUCCESS" == "false" ]; then
      echo "Il gioco è terminato."
      exit 0
    fi

    # Attendi un breve intervallo tra i colpi
    sleep 0.1
  done
}

# Ciclo principale
while true; do
  # Ottieni la posizione del bersaglio
  get_target_position
  if [ $? -ne 0 ]; then
    # Se c'è stato un errore (ad esempio rate limiting), salta alla prossima iterazione
    continue
  fi

  # Invia colpi basati sulla predizione
  send_shots

  # Attendi fino a quando puoi richiedere nuovamente la posizione
  sleep 2
done
