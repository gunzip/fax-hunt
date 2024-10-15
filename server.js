// server.js

const express = require("express");
const next = require("next");
const http = require("http");
const socketIo = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

let players = {}; // Memorizza i dati dei giocatori
let gameActive = true;
let requestCounts = {};
let winner = null;
let objectPosition = { x: 400, y: 300 }; // Posizione iniziale del bersaglio

const rateLimitMiddleware = (milliseconds, maxRequests) => {
  return (req, res, next) => {
    const player = players[req.token];

    if (!player) {
      return res
        .status(400)
        .json({ error: "Token non associato a un giocatore" });
    }
    const rateLimitKey = `${player.username}_${req.path}`;

    const currentTime = Date.now();
    const playerRequests = requestCounts[rateLimitKey] || [];

    // Rimuove le richieste più vecchie del periodo di rate limit
    requestCounts[rateLimitKey] = playerRequests.filter(
      (timestamp) => currentTime - timestamp < milliseconds
    );

    if (requestCounts[rateLimitKey].length >= maxRequests) {
      const waitTime = Math.ceil(
        (milliseconds - (currentTime - requestCounts[rateLimitKey][0])) / 1000
      ); // Tempo di attesa in secondi

      // Imposta l'intestazione Retry-After
      res.set("Retry-After", waitTime.toString());

      return res.status(429).json({
        error: "Troppe richieste. Attendi prima di riprovare.",
        retryAfter: waitTime,
      });
    }

    // Aggiunge il timestamp della richiesta corrente
    requestCounts[rateLimitKey].push(currentTime);
    next();
  };
};

function resetGame() {
  players = {};
  gameActive = true;
  requestCounts = {};
  winner = null;
  objectPosition = { x: 400, y: 300 }; // Esempio di reset della posizione
  console.log("Il gioco è stato resettato");
}

// Funzione per ottenere una velocità casuale tra -3 e 3, escluso zero
function getRandomVelocity() {
  let velocity = 0;
  while (velocity === 0) {
    velocity = Math.floor(Math.random() * 7) - 3; // Da -3 a 3
  }
  return velocity;
}

const colors = [
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Pink",
  "Purple",
  "Orange",
  "Black",
  "White",
  "Gray",
  "Brown",
  "Cyan",
  "Magenta",
  "Lime",
  "Olive",
  "Maroon",
  "Navy",
  "Teal",
  "Aqua",
  "Silver",
  "Gold",
  "Beige",
  "Coral",
  "Ivory",
  "Khaki",
  "Lavender",
  "Mint",
  "Peach",
  "Plum",
  "Salmon",
];

const animals = [
  "Tiger",
  "Lion",
  "Bear",
  "Wolf",
  "Eagle",
  "Shark",
  "Panther",
  "Leopard",
  "Fox",
  "Hawk",
  "Falcon",
  "Cheetah",
  "Jaguar",
  "Cougar",
  "Lynx",
  "Bobcat",
  "Ocelot",
  "Puma",
  "Hyena",
  "Jackal",
  "Otter",
  "Badger",
  "Wolverine",
  "Raccoon",
  "Skunk",
  "Weasel",
  "Mongoose",
  "Meerkat",
  "Ferret",
  "Mink",
];

const existingUsernames = new Set();

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUniqueUsername() {
  let username;
  do {
    username = `${getRandomElement(colors)}${getRandomElement(
      animals
    )}${Math.floor(Math.random() * 10)}`;
  } while (existingUsernames.has(username));
  existingUsernames.add(username);
  return username;
}

function deletePlayer(token) {
  if (players[token]) {
    existingUsernames.delete(players[token].username);
    delete players[token];
  }
}

function handleGameEnd() {
  for (const token in players) {
    deletePlayer(token);
  }
}

function extractToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "Token di autenticazione mancante" });
  }

  const token = authHeader.split(" ")[1]; // Assumendo che l'header sia del tipo "Bearer <token>"
  if (!token) {
    return res
      .status(400)
      .json({ error: "Token di autenticazione non valido" });
  }

  req.token = token;
  next();
}

// Imposta la velocità iniziale
let objectVelocity = { vx: getRandomVelocity(), vy: getRandomVelocity() };

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = socketIo(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  server.use(express.json()); // Per il parsing di application/json

  // Endpoint API per unirsi al gioco
  server.post("/api/join", (req, res) => {
    const token = uuidv4();
    const username = generateUniqueUsername();
    const color = getRandomColor();
    players[token] = { username, color };

    res.status(200).json({ token, username, color });
  });

  server.post(
    "/api/fire",
    extractToken,
    rateLimitMiddleware(1000, 2),
    (req, res) => {
      if (!gameActive) {
        return res
          .status(200)
          .json({ message: "Il gioco è terminato", success: false });
      }

      const { x, y } = req.body;

      if (x == null || y == null) {
        return res.status(400).json({ error: "Coordinate richieste" });
      }

      const player = players[req.token];

      if (!player) {
        return res.status(400).json({ error: "Token non valido" });
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
        console.log(`Il giocatore ${player.username} ha vinto!`, req.token);
        io.emit("gameOver", { winner });
        hit = true;
        // reset game status after 60 seconds of inactivity
        setTimeout(resetGame, 60000);
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
    }
  );

  // Endpoint API per ottenere la posizione attuale del bersaglio con rate limiting e ritardo
  server.get(
    "/api/target",
    extractToken,
    rateLimitMiddleware(1000, 1),
    (req, res) => {
      // Salva la posizione attuale
      const currentPosition = { x: objectPosition.x, y: objectPosition.y };

      // Imposta un ritardo nella risposta
      setTimeout(() => {
        // Aggiungi rumore alle coordinate
        const noiseLevel = 10; // Puoi regolare questo valore
        const noisyPosition = {
          x: currentPosition.x + (Math.random() * noiseLevel - noiseLevel / 2),
          y: currentPosition.y + (Math.random() * noiseLevel - noiseLevel / 2),
        };

        res.status(200).json(noisyPosition);
      }, 100);
    }
  );

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
      existingUsernames.clear();
      gameActive = true;
      winner = null;
      objectPosition = { x: 400, y: 300 };
      objectVelocity = { vx: getRandomVelocity(), vy: getRandomVelocity() };
      handleGameEnd();
      io.emit("gameReset");
    });
  });

  // Aggiorna la posizione del bersaglio periodicamente
  setInterval(() => {
    if (gameActive) {
      updateObjectPosition();
      io.emit("objectPosition", objectPosition);
    }
  }, 50);

  const PORT = process.env.PORT || 3000;

  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Pronto su http://localhost:${PORT}`);
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
    // Aggiungi un cambiamento casuale di velocità occasionalmente
    if (Math.random() < 0.05) {
      // 5% di probabilità ogni aggiornamento
      // objectVelocity.vx += Math.random() * 2 - 1; // Cambia la velocità tra -1 e 1
      // objectVelocity.vy += Math.random() * 2 - 1;

      objectVelocity.vx += Math.random() * 40 - 20;
      objectVelocity.vy += Math.random() * 40 - 20;

      // Limita la velocità massima
      objectVelocity.vx = Math.max(-15, Math.min(15, objectVelocity.vx));
      objectVelocity.vy = Math.max(-15, Math.min(15, objectVelocity.vy));
    }

    // Aggiorna la posizione in base alla velocità
    objectPosition.x += objectVelocity.vx;
    objectPosition.y += objectVelocity.vy;

    // Controlla le collisioni con i bordi del canvas (800x600)
    objectPosition.x = Math.max(20, Math.min(780, objectPosition.x));
    objectPosition.y = Math.max(20, Math.min(580, objectPosition.y));

    if (objectPosition.x === 20 || objectPosition.x === 780) {
      objectVelocity.vx = -objectVelocity.vx; // Inverte la velocità X
    }
    if (objectPosition.y === 20 || objectPosition.y === 580) {
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
