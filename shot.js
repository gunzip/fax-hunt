// server.js
const axios = require("axios");

// Configuration
// const BASE_URL = "https://fax-hunt.onrender.com";
const BASE_URL = "http://localhost:3000";
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const NUM_SHOTS = 5;
const SPREAD = 30; // pixels
const API_DELAY = 500; // milliseconds
const EXPECTED_DT = 400; // milliseconds

// State
let token = "";
let username = "";
let color = "";
let positionsX = [];
let positionsY = [];
let timestamps = [];

// Join the game
async function joinGame() {
  try {
    const response = await axios.post(`${BASE_URL}/api/join`, {});
    token = response.data.token;
    username = response.data.username;
    color = response.data.color;
    console.log(
      `Giocatore unito al gioco:\nUsername: ${username}\nToken: ${token}\nColore: ${color}\n`
    );
    if (!token) {
      console.error("Errore nell'ottenere il token.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Errore nel join del gioco:", error.message);
    process.exit(1);
  }
}

// Get target position
async function getTargetPosition() {
  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    try {
      const response = await axios.get(`${BASE_URL}/api/target`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (status) => true,
      });

      if (response.status === 429) {
        const retryAfter = response.headers["retry-after"]
          ? parseInt(response.headers["retry-after"])
          : 5;
        console.log(
          `Troppe richieste. Attendi ${retryAfter} secondi prima di ritentare.`
        );
        await new Promise((res) => setTimeout(res, retryAfter * 1000));
        retries++;
        continue;
      }

      if (response.status >= 200 && response.status < 300) {
        const { x, y } = response.data;
        if (typeof x !== "number" || typeof y !== "number") {
          console.log(`Valori di posizione non validi: x=${x}, y=${y}`);
          retries++;
          await new Promise((res) => setTimeout(res, 1000));
          continue;
        }

        const currentTime = Date.now(); // Milliseconds
        positionsX.push(x);
        positionsY.push(y);
        timestamps.push(currentTime);

        // Keep only the last 5 data points
        if (positionsX.length > 5) {
          positionsX.shift();
          positionsY.shift();
          timestamps.shift();
        }

        return { x, y };
      } else {
        console.log(`Errore nella richiesta: HTTP status ${response.status}.`);
        retries++;
        await new Promise((res) => setTimeout(res, 1000));
      }
    } catch (error) {
      console.log(`Errore nella richiesta: ${error.message}`);
      retries++;
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  console.log(
    "Massimo numero di tentativi raggiunto. Impossibile ottenere la posizione del bersaglio."
  );
  return null;
}

// Send shots
async function sendShots() {
  if (positionsX.length < 3) {
    console.log(
      "Dati insufficienti per prevedere la posizione. Attendi il prossimo aggiornamento."
    );
    return;
  }

  // Calculate average velocity
  let totalVx = 0;
  let totalVy = 0;
  let validVelocities = 0;

  for (let i = 1; i < positionsX.length; i++) {
    const dt = timestamps[i] - timestamps[i - 1];
    if (dt <= 0) continue;
    const seconds = dt / 1000;
    const vx = (positionsX[i] - positionsX[i - 1]) / seconds;
    const vy = (positionsY[i] - positionsY[i - 1]) / seconds;
    totalVx += vx;
    totalVy += vy;
    validVelocities++;
  }

  if (validVelocities === 0) {
    console.log("Impossibile calcolare la velocità media.");
    return;
  }

  const avgVx = totalVx / validVelocities;
  const avgVy = totalVy / validVelocities;

  // Predict future position
  const lastX = positionsX[positionsX.length - 1];
  const lastY = positionsY[positionsY.length - 1];
  const predictedX = Math.round(lastX + avgVx * (EXPECTED_DT / 1000));
  const predictedY = Math.round(lastY + avgVy * (EXPECTED_DT / 1000));

  // Ensure within canvas
  const clampedX = Math.min(Math.max(predictedX, 0), CANVAS_WIDTH);
  const clampedY = Math.min(Math.max(predictedY, 0), CANVAS_HEIGHT);

  // Generate and send shots
  for (let i = 0; i < NUM_SHOTS; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * SPREAD;
    let shotX = Math.round(clampedX + distance * Math.cos(angle));
    let shotY = Math.round(clampedY + distance * Math.sin(angle));

    shotX = Math.min(Math.max(shotX, 0), CANVAS_WIDTH);
    shotY = Math.min(Math.max(shotY, 0), CANVAS_HEIGHT);

    try {
      const fireResponse = await axios.post(
        `${BASE_URL}/api/fire`,
        { x: shotX, y: shotY },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          validateStatus: (status) => true,
        }
      );

      if (fireResponse.status === 429) {
        const retryAfter = fireResponse.headers["retry-after"]
          ? parseInt(fireResponse.headers["retry-after"])
          : 5;
        console.log(
          `Troppe richieste per fire. Attendi ${retryAfter} secondi prima di ritentare.`
        );
        await new Promise((res) => setTimeout(res, retryAfter * 1000));
        return;
      }

      if (fireResponse.status >= 200 && fireResponse.status < 300) {
        const { message, success, hit } = fireResponse.data;
        console.log(`Tentativo di colpire a (${shotX}, ${shotY}): ${message}`);

        if (hit === true) {
          console.log("Hai colpito il bersaglio e vinto il gioco!");
          process.exit(0);
        }

        if (success === false) {
          console.log("Il gioco è terminato.");
          process.exit(0);
        }
      } else {
        console.log(
          `Errore nella richiesta fire: HTTP status ${fireResponse.status}.`
        );
      }
    } catch (error) {
      console.log(`Errore nella richiesta fire: ${error.message}`);
    }

    // Brief pause between shots
    await new Promise((res) => setTimeout(res, 100));
  }
}

// Main loop
async function mainLoop() {
  while (true) {
    const target = await getTargetPosition();
    if (target) {
      await sendShots();
      await new Promise((res) => setTimeout(res, 2000));
    } else {
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
}

// Start the script
(async () => {
  await joinGame();
  await mainLoop();
})();
