// server.js

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Variabili di gioco
let maxSpeed = 60;
let minSpeed = 30;
let players = {}; // Memorizza i dati dei giocatori
let gameActive = true;
let requestCounts = {};
let winner = null;
let objectPosition = { x: 400, y: 300 }; // Posizione iniziale del bersaglio

// Middleware per il rate limiting
const rateLimitMiddleware = (milliseconds, maxRequests) => {
  return (req, res, next) => {
    const player = players[req.token];

    // if (!player) {
    //   return res
    //     .status(400)
    //     .json({ error: "Token non associato a un giocatore" });
    // }
    const rateLimitKey = `${player?.username}_${req.path}`;

    const currentTime = Date.now();
    const requests = requestCounts[rateLimitKey] || [];

    // Rimuove le richieste più vecchie del periodo di rate limit
    requestCounts[rateLimitKey] = requests.filter(
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

// Funzioni di gioco

function resetGame() {
  players = {};
  existingUsernames.clear();
  gameActive = true;
  requestCounts = {};
  winner = null;
  objectPosition = { x: 400, y: 300 };
  objectVelocity = { vx: getRandomVelocity(), vy: getRandomVelocity() };
  console.log("Il gioco è stato resettato");
  io.emit("gameReset");
}

function getRandomVelocity() {
  let velocity = 0;
  while (velocity === 0) {
    velocity = Math.max(
      minSpeed,
      Math.floor(Math.random() * maxSpeed) - Math.floor(maxSpeed / 2)
    );
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
  let attempts = 0;
  const maxAttempts = 1000;

  do {
    username = `${getRandomElement(colors)}${getRandomElement(
      animals
    )}${Math.floor(Math.random() * 10)}`;
    attempts++;
    if (attempts > maxAttempts) {
      throw new Error("Impossibile generare un username unico");
    }
  } while (existingUsernames.has(username));

  existingUsernames.add(username);
  return username;
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

// Inizializza Express
const app = express();
const httpServer = http.createServer(app);
const io = socketIo(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware per servire file statici dalla cartella 'public'
app.use(express.static(path.join(__dirname, "public")));

// Middleware per il parsing di application/json
app.use(express.json());

// Endpoint API per unirsi al gioco
app.post("/api/join", rateLimitMiddleware(60000, 10), (req, res) => {
  const MAX_USERS = 10;

  // Check if maximum number of users is reached
  if (existingUsernames.size >= MAX_USERS) {
    return res
      .status(403)
      .json({ error: "Numero massimo di utenti raggiunto" });
  }

  const token = uuidv4();
  const username = generateUniqueUsername();
  const color = getRandomColor();
  players[token] = { username, color };

  io.emit("updateUserList", Object.values(players));

  res.status(200).json({ token, username, color });
});

// endopoint that let admins configure max speed
app.post("/api/configure", (req, res) => {
  // verify a secret taken from env
  const secret = process.env.SECRET || "foobar";
  if (req.headers["x-secret"] !== secret) {
    return res.status(401).json({ error: "Non autorizzato" });
  }

  const { speed } = req.body;
  if (speed == null || typeof speed !== "number" || speed <= 0) {
    return res.status(400).json({ error: "Velocità non valida" });
  }

  maxSpeed = speed;
  res.status(200).json({ message: "Velocità aggiornata con successo" });
});

// endopoint that let admins configure max speed
app.post("/api/reset", (req, res) => {
  // verify a secret taken from env
  const secret = process.env.SECRET || "foobar";
  if (req.headers["x-secret"] !== secret) {
    return res.status(401).json({ error: "Non autorizzato" });
  }
  resetGame();
  res.status(200).json({ message: "Gioco resettato con successo" });
});

// Endpoint API per effettuare un tiro
app.post(
  "/api/fire",
  extractToken,
  rateLimitMiddleware(2000, 1),
  (req, res) => {
    if (!gameActive) {
      return res
        .status(200)
        .json({ message: "Il gioco è terminato", success: false });
    }

    const { x, y } = req.body;

    if (
      x == null ||
      y == null ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      x < 0 ||
      x > 800 ||
      y < 0 ||
      y > 600
    ) {
      return res.status(400).json({ error: "Coordinate non valide" });
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
      // Reset game status after 20 seconds of inactivity
      setTimeout(resetGame, 20000);
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
app.get(
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
    objectVelocity.vx = getRandomVelocity();
    objectVelocity.vy = getRandomVelocity();
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

// Aggiorna la posizione del bersaglio periodicamente
setInterval(() => {
  if (gameActive) {
    updateObjectPosition();
    io.emit("objectPosition", objectPosition);
  }
}, 50);

// send userList to all clients
setInterval(() => {
  io.emit("updateUserList", Object.values(players));
}, 10000);

// Connessione Socket.IO
io.on("connection", (socket) => {
  console.log("Un client si è connesso");

  // Invia la posizione iniziale del bersaglio
  socket.emit("objectPosition", objectPosition);

  socket.on("disconnect", () => {
    console.log("Un client si è disconnesso");
  });
});

// Avvia il server
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`> Pronto su http://localhost:${PORT}`);
});
