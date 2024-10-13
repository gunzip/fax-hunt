// server.js

const express = require("express");
const next = require("next");
const http = require("http");
const socketIo = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const players = {}; // Memorizza i dati dei giocatori
let gameActive = true;
let winner = null;
let objectPosition = { x: 400, y: 300 }; // Posizione iniziale del bersaglio

// Funzione per ottenere una velocità casuale tra -3 e 3, escluso zero
function getRandomVelocity() {
  let velocity = 0;
  while (velocity === 0) {
    velocity = Math.floor(Math.random() * 7) - 3; // Da -3 a 3
  }
  return velocity;
}

// Imposta la velocità iniziale
let objectVelocity = { vx: getRandomVelocity(), vy: getRandomVelocity() };

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = socketIo(httpServer);

  server.use(express.json()); // Per il parsing di application/json

  // Endpoint API per unirsi al gioco
  server.post("/api/join", (req, res) => {
    const token = uuidv4();
    const username = `Player_${Math.floor(Math.random() * 10000)}`;
    const color = getRandomColor();
    players[token] = { username, color };

    res.status(200).json({ token, username, color });
  });

  // Endpoint API per interagire (sparare)
  server.post("/api/interact", (req, res) => {
    const { token, x, y } = req.body;

    if (!token || x == null || y == null) {
      return res
        .status(400)
        .json({ error: "Token e coordinate sono richiesti" });
    }

    const player = players[token];

    if (!player) {
      return res.status(400).json({ error: "Token non valido" });
    }

    if (!gameActive) {
      return res
        .status(200)
        .json({ message: "Il gioco è terminato", success: false });
    }

    // Crea un oggetto per il colpo
    const shot = {
      x,
      y,
      username: player.username,
      color: player.color,
      timestamp: Date.now(),
    };

    // Emette il colpo al client
    io.emit("newShot", shot);

    // Controlla se il colpo ha colpito il bersaglio
    let hit = false;
    if (checkHit({ x, y }, objectPosition)) {
      gameActive = false;
      winner = player.username;
      io.emit("gameOver", { winner });
      hit = true;
    }

    // Risponde al giocatore con informazioni sull'esito
    if (hit) {
      res
        .status(200)
        .json({ message: "Colpito! Hai vinto!", success: true, hit: true });
    } else {
      res.status(200).json({
        message: "Hai mancato il bersaglio.",
        success: true,
        hit: false,
      });
    }
  });

  // Endpoint API per ottenere la posizione attuale del bersaglio
  server.get("/api/target", (req, res) => {
    res.status(200).json({ x: objectPosition.x, y: objectPosition.y });
  });

  // Servizio delle pagine Next.js
  server.get("*", (req, res) => {
    return handle(req, res);
  });

  // Connessione Socket.IO
  io.on("connection", (socket) => {
    console.log("Un client si è connesso");

    // Invia la posizione iniziale del bersaglio
    socket.emit("objectPosition", objectPosition);

    // Gestisce il reset del gioco
    socket.on("resetGame", () => {
      gameActive = true;
      winner = null;
      objectPosition = { x: 400, y: 300 };
      objectVelocity = { vx: getRandomVelocity(), vy: getRandomVelocity() };
      io.emit("gameReset");
    });
  });

  // Aggiorna la posizione del bersaglio periodicamente
  setInterval(() => {
    if (gameActive) {
      updateObjectPosition();
      io.emit("objectPosition", objectPosition);
    }
  }, 20); // Aggiorna ogni 20ms per un movimento più fluido

  httpServer.listen(3000, (err) => {
    if (err) throw err;
    console.log("> Pronto su http://localhost:3000");
  });

  // Funzione per ottenere un colore casuale
  function getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  // Funzione per aggiornare la posizione del bersaglio utilizzando vettori di velocità
  function updateObjectPosition() {
    // Aggiorna la posizione in base alla velocità
    objectPosition.x += objectVelocity.vx;
    objectPosition.y += objectVelocity.vy;

    // Controlla le collisioni con i bordi del canvas (800x600)
    if (objectPosition.x <= 10 || objectPosition.x >= 790) {
      objectVelocity.vx = -objectVelocity.vx; // Inverte la velocità X
    }
    if (objectPosition.y <= 10 || objectPosition.y >= 590) {
      objectVelocity.vy = -objectVelocity.vy; // Inverte la velocità Y
    }
  }

  // Funzione per verificare se un colpo ha colpito il bersaglio
  function checkHit(shot, object) {
    const distance = Math.sqrt(
      (shot.x - object.x) ** 2 + (shot.y - object.y) ** 2
    );
    return distance <= 15; // Regola il raggio di impatto secondo necessità
  }
});
