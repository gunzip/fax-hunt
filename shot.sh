#!/bin/bash

# URL base del server
BASE_URL="http://localhost:3000"

# Unisci il gioco e ottieni il token
JOIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/join")
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

# Funzione per inviare un colpo
function send_shot() {
  # Ottieni la posizione attuale del bersaglio
  TARGET_RESPONSE=$(curl -s -X GET "$BASE_URL/api/target")
  TARGET_X=$(echo "$TARGET_RESPONSE" | jq '.x')
  TARGET_Y=$(echo "$TARGET_RESPONSE" | jq '.y')

  # Arrotonda le coordinate per evitare problemi di precisione
  SHOT_X=$(printf "%.0f" "$TARGET_X")
  SHOT_Y=$(printf "%.0f" "$TARGET_Y")

  # Invia il colpo all'API /api/interact
  INTERACT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/interact" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\",\"x\":$SHOT_X,\"y\":$SHOT_Y}")

  MESSAGE=$(echo "$INTERACT_RESPONSE" | jq -r '.message')
  SUCCESS=$(echo "$INTERACT_RESPONSE" | jq '.success')
  HIT=$(echo "$INTERACT_RESPONSE" | jq '.hit')

  # Stampa il risultato del colpo
  echo "Tentativo di colpire il bersaglio a ($SHOT_X, $SHOT_Y): $MESSAGE"

  # Se il colpo ha colpito, termina lo script
  if [ "$HIT" == "true" ]; then
    echo "Hai colpito il bersaglio e vinto il gioco!"
    exit 0
  fi

  # Se il gioco è terminato, esci dal ciclo
  if [ "$SUCCESS" == "false" ]; then
    echo "Il gioco è terminato."
    exit 0
  fi
}

# Ciclo continuo per inviare colpi
while true; do
  send_shot
  # Attendi 0.1 secondi prima del prossimo tentativo
  sleep 0.1
done
