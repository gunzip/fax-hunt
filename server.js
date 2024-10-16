// server.js

const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const getClientSecret = require("./src/client-secret");

let maxSpeed = 60;
let minSpeed = 20;
let players = {};
let gameActive = true;
let requestCounts = {};
let winner = null;
let objectPosition = { x: 400, y: 300 };

const serverSecret = process.env.SECRET || "foobar";

// Middleware per il rate limiting
const rateLimitMiddleware = (milliseconds, maxRequests) => {
  return (req, res, next) => {
    const player = players[req.token];

    const rateLimitKey = `${player?.username}_${req.path}`;

    const currentTime = Date.now();
    const requests = requestCounts[rateLimitKey] || [];

    // Removes old requests
    requestCounts[rateLimitKey] = requests.filter(
      (timestamp) => currentTime - timestamp < milliseconds
    );

    if (requestCounts[rateLimitKey].length >= maxRequests) {
      const waitTime = Math.ceil(
        (milliseconds - (currentTime - requestCounts[rateLimitKey][0])) / 1000
      );

      res.set("Retry-After", waitTime.toString());

      return res.status(429).json({
        error: "Too many requests",
        retryAfter: waitTime,
      });
    }

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
  console.log("Game reset");
  io.emit("gameReset");
}

function getRandomVelocity() {
  let velocity = 0;
  while (velocity === 0) {
    // Set velocity to a valut between -maxSpeed and maxSpeed
    velocity = Math.floor((Math.random() - 0.5) * 2 * maxSpeed);

    // Speed may be negative, but absolute value should be at least minSpeed
    if (Math.abs(velocity) < minSpeed) {
      velocity = Math.sign(velocity) * minSpeed;
    }
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
      throw new Error("Unable to generate a unique username");
    }
  } while (existingUsernames.has(username));

  existingUsernames.add(username);
  return username;
}

function extractToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  // Assumes the token is in the format "Bearer <token>"
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res
      .status(400)
      .json({ error: "Invalid Authorization header format" });
  }

  req.token = token;
  next();
}

let objectVelocity = { vx: getRandomVelocity(), vy: getRandomVelocity() };

const app = express();
const httpServer = http.createServer(app);
const io = socketIo(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.post("/api/join", rateLimitMiddleware(60000, 10), (req, res) => {
  const MAX_USERS = 10;

  if (existingUsernames.size >= MAX_USERS) {
    return res
      .status(403)
      .json({ error: "Max number of users reached. Please try again later." });
  }

  const { clientId, secret } = req.body;
  if (!clientId || !secret) {
    return res.status(400).json({ error: "Invalid join request" });
  }

  const expectedSecret = getClientSecret(clientId, serverSecret);
  if (secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = uuidv4();
  const username = clientId;
  const color = getRandomColor();
  players[token] = { username, color };

  io.emit("updateUserList", Object.values(players));
  console.log(`Player ${username} joined the game`, token);

  res.status(200).json({ token, username, color });
});

app.post("/api/configure", (req, res) => {
  if (req.headers["x-secret"] !== serverSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { speed } = req.body;
  if (speed == null || typeof speed !== "number" || speed <= 0) {
    return res.status(400).json({ error: "Invalid speed value" });
  }

  maxSpeed = speed;
  console.log(`Speed updated to ${maxSpeed} ${minSpeed}`);
  res.status(200).json({ message: "Speed updated successfully" });
});

app.post("/api/reset", (req, res) => {
  const secret = process.env.SECRET || "foobar";
  if (req.headers["x-secret"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  resetGame();
  res.status(200).json({ message: "Game reset successfully" });
});

app.post(
  "/api/fire",
  extractToken,
  rateLimitMiddleware(2000, 1),
  (req, res) => {
    if (!gameActive) {
      return res.status(200).json({ message: "Game Over", success: false });
    }

    const { x, y } = req.body;

    if (
      x == null ||
      y == null ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      x < 0 ||
      x > 1024 ||
      y < 0 ||
      y > 600
    ) {
      return res.status(400).json({ error: "Invalid shot coordinates" });
    }

    const player = players[req.token];

    if (!player) {
      return res.status(400).json({ error: "Invalid token" });
    }

    const shot = {
      x,
      y,
      username: player.username,
      color: player.color,
      timestamp: Date.now(),
    };

    io.emit("newShot", shot);

    let hit = false;
    if (checkHit({ x, y }, objectPosition)) {
      gameActive = false;
      winner = player.username;
      console.log(`Player ${player.username} won!`, req.token);
      io.emit("gameOver", { winner });
      hit = true;
      // Reset game status after 20 seconds of inactivity
      setTimeout(resetGame, 20000);
    }

    if (hit) {
      res.status(200).json({
        message: "Target hit! You won the game!",
        success: true,
        hit: true,
      });
    } else {
      res.status(200).json({
        message: "Missed the target",
        success: true,
        hit: false,
      });
    }
  }
);

app.get(
  "/api/target",
  extractToken,
  rateLimitMiddleware(1000, 1),
  (req, res) => {
    const currentPosition = { x: objectPosition.x, y: objectPosition.y };

    // Adds a delay to simulate network latency
    setTimeout(() => {
      // Adds some noise to the target position
      const noiseLevel = 10;
      const noisyPosition = {
        x: currentPosition.x + (Math.random() * noiseLevel - noiseLevel / 2),
        y: currentPosition.y + (Math.random() * noiseLevel - noiseLevel / 2),
      };

      res.status(200).json(noisyPosition);
    }, 100);
  }
);

function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function updateObjectPosition() {
  // Change direction randomly
  if (Math.random() < 0.05) {
    objectVelocity.vx = getRandomVelocity();
    objectVelocity.vy = getRandomVelocity();
  }

  objectPosition.x += objectVelocity.vx;
  objectPosition.y += objectVelocity.vy;

  // Check for collisions with walls
  objectPosition.x = Math.max(20, Math.min(1000, objectPosition.x));
  objectPosition.y = Math.max(20, Math.min(580, objectPosition.y));

  if (objectPosition.x === 20 || objectPosition.x === 1000) {
    objectVelocity.vx = -objectVelocity.vx;
  }
  if (objectPosition.y === 20 || objectPosition.y === 580) {
    objectVelocity.vy = -objectVelocity.vy;
  }
}

function checkHit(shot, object) {
  const distance = Math.sqrt(
    (shot.x - object.x) ** 2 + (shot.y - object.y) ** 2
  );
  // Check if the shot is within a certain range araound the object
  return distance <= 30;
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
  console.log("Client connected");

  // Invia la posizione iniziale del bersaglio
  socket.emit("objectPosition", objectPosition);

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Avvia il server
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`> Ready on http://localhost:${PORT}`);
});
