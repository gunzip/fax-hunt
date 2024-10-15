// server.js

const express = require("express");
const next = require("next");
const http = require("http");
const { WebSocketServer } = require("ws"); // Import WebSocketServer from 'ws'
const { v4: uuidv4 } = require("uuid");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

let players = {}; // Stores player data
let gameActive = true;
let requestCounts = {};
let winner = null;
let objectPosition = { x: 400, y: 300 }; // Initial target position

const rateLimitMiddleware = (milliseconds, maxRequests) => {
  return (req, res, next) => {
    const player = players[req.token];

    if (!player) {
      return res
        .status(400)
        .json({ error: "Token not associated with a player" });
    }
    const rateLimitKey = `${player.username}_${req.path}`;

    const currentTime = Date.now();
    const playerRequests = requestCounts[rateLimitKey] || [];

    // Remove requests older than the rate limit period
    requestCounts[rateLimitKey] = playerRequests.filter(
      (timestamp) => currentTime - timestamp < milliseconds
    );

    if (requestCounts[rateLimitKey].length >= maxRequests) {
      const waitTime = Math.ceil(
        (milliseconds - (currentTime - requestCounts[rateLimitKey][0])) / 1000
      ); // Wait time in seconds

      // Set the Retry-After header
      res.set("Retry-After", waitTime.toString());

      return res.status(429).json({
        error: "Too many requests. Please wait before retrying.",
        retryAfter: waitTime,
      });
    }

    // Add the current request timestamp
    requestCounts[rateLimitKey].push(currentTime);
    next();
  };
};

function resetGame() {
  players = {};
  gameActive = true;
  requestCounts = {};
  winner = null;
  objectPosition = { x: 400, y: 300 }; // Reset position example
  console.log("The game has been reset");
  broadcastMessage({
    type: "gameReset",
    data: { message: "Game has been reset." },
  });
}

// Function to get a random velocity between -3 and 3, excluding zero
function getRandomVelocity() {
  let velocity = 0;
  while (velocity === 0) {
    velocity = Math.floor(Math.random() * 7) - 3; // From -3 to 3
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
    return res.status(401).json({ error: "Missing authentication token" });
  }

  const token = authHeader.split(" ")[1]; // Assuming header is "Bearer <token>"
  if (!token) {
    return res.status(400).json({ error: "Invalid authentication token" });
  }

  req.token = token;
  next();
}

// Set initial velocity
let objectVelocity = { vx: getRandomVelocity(), vy: getRandomVelocity() };

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);

  // Initialize WebSocket server
  const wss = new WebSocketServer({ port: 4000 });

  // Set of connected clients
  const clients = new Set();

  server.use(express.json()); // For parsing application/json

  // API endpoint to join the game
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
          .json({ message: "The game has ended", success: false });
      }

      const { x, y } = req.body;

      if (x == null || y == null) {
        return res.status(400).json({ error: "Missing coordinates" });
      }

      const player = players[req.token];

      if (!player) {
        return res.status(400).json({ error: "Invalid token" });
      }

      // Create a shot object
      const shot = {
        x,
        y,
        username: player.username,
        color: player.color,
        timestamp: Date.now(),
      };

      // Broadcast the new shot to all clients
      broadcastMessage({ type: "newShot", data: shot });

      // Check if the shot hit the target
      let hit = false;
      if (checkHit({ x, y }, objectPosition)) {
        gameActive = false;
        winner = player.username;
        console.log(`Player ${player.username} has won!`, req.token);
        broadcastMessage({ type: "gameOver", data: { winner } });
        hit = true;
        // Reset game status after 60 seconds of inactivity
        setTimeout(resetGame, 60000);
      }

      // Respond to the player with the outcome
      if (hit) {
        res
          .status(200)
          .json({ message: "Hit! You won!", success: true, hit: true });
      } else {
        res.status(200).json({
          message: "You missed the target.",
          success: true,
          hit: false,
        });
      }
    }
  );

  // API endpoint to get the current target position with rate limiting and delay
  server.get(
    "/api/target",
    extractToken,
    rateLimitMiddleware(1000, 1),
    (req, res) => {
      // Save the current position
      const currentPosition = { x: objectPosition.x, y: objectPosition.y };

      // Set a delay in the response
      setTimeout(() => {
        // Add noise to the coordinates
        const noiseLevel = 10; // Adjust this value as needed
        const noisyPosition = {
          x: currentPosition.x + (Math.random() * noiseLevel - noiseLevel / 2),
          y: currentPosition.y + (Math.random() * noiseLevel - noiseLevel / 2),
        };

        res.status(200).json(noisyPosition);
      }, 100);
    }
  );

  // Handle all other Next.js pages
  server.get("*", (req, res) => {
    return handle(req, res);
  });

  // Handle WebSocket connections
  wss.on("connection", (ws, req) => {
    console.log("A client has connected");
    clients.add(ws);

    // Send the initial object position to the newly connected client
    ws.send(JSON.stringify({ type: "objectPosition", data: objectPosition }));

    // Handle incoming messages from clients
    ws.on("message", (message) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === "resetGame") {
          existingUsernames.clear();
          gameActive = true;
          winner = null;
          objectPosition = { x: 400, y: 300 };
          objectVelocity = { vx: getRandomVelocity(), vy: getRandomVelocity() };
          handleGameEnd();
          broadcastMessage({
            type: "gameReset",
            data: { message: "Game has been reset by a client." },
          });
        }
        // Handle other message types as needed
      } catch (err) {
        console.error("Invalid message received:", message);
      }
    });

    // Handle client disconnection
    ws.on("close", () => {
      console.log("A client has disconnected");
      clients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      clients.delete(ws);
    });
  });

  // Periodically update the target's position
  setInterval(() => {
    if (gameActive) {
      updateObjectPosition();
      broadcastMessage({ type: "objectPosition", data: objectPosition });
    }
  }, 50);

  const PORT = process.env.PORT || 3000;

  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });

  // Function to broadcast messages to all connected clients
  function broadcastMessage(message) {
    const messageString = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(messageString);
      }
    }
  }

  // Function to get a random color
  function getRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  // Function to update the target's position using velocity vectors
  function updateObjectPosition() {
    // Occasionally add a random change to velocity
    if (Math.random() < 0.05) {
      // 5% chance each update
      objectVelocity.vx += Math.random() * 40 - 20;
      objectVelocity.vy += Math.random() * 40 - 20;

      // Limit maximum velocity
      objectVelocity.vx = Math.max(-15, Math.min(15, objectVelocity.vx));
      objectVelocity.vy = Math.max(-15, Math.min(15, objectVelocity.vy));
    }

    // Update position based on velocity
    objectPosition.x += objectVelocity.vx;
    objectPosition.y += objectVelocity.vy;

    // Check for collisions with the canvas edges (800x600)
    objectPosition.x = Math.max(20, Math.min(780, objectPosition.x));
    objectPosition.y = Math.max(20, Math.min(580, objectPosition.y));

    if (objectPosition.x === 20 || objectPosition.x === 780) {
      objectVelocity.vx = -objectVelocity.vx; // Reverse X velocity
    }
    if (objectPosition.y === 20 || objectPosition.y === 580) {
      objectVelocity.vy = -objectVelocity.vy; // Reverse Y velocity
    }
  }

  // Function to check if a shot hit the target
  function checkHit(shot, object) {
    const distance = Math.sqrt(
      (shot.x - object.x) ** 2 + (shot.y - object.y) ** 2
    );
    return distance <= 15; // Adjust the hit radius as needed
  }
});
