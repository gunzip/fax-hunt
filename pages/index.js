// pages/index.js

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const canvasRef = useRef(null);
  const objectPositionRef = useRef({ x: 400, y: 300 });
  const shotsRef = useRef([]);
  const gameActiveRef = useRef(true);
  const winnerRef = useRef(null);
  const [, setRender] = useState(0);
  const backgroundImageRef = useRef(null);
  const spriteImageRef = useRef(null);
  const targetPosition = useRef({ x: 400, y: 300 });
  const lastUpdateTime = useRef(Date.now());
  const wsRef = useRef(null); // Reference to WebSocket instance

  useEffect(() => {
    // Disable console and fetch to prevent cheating or unauthorized access
    console.log = () => {};
    window.fetch = () => {};

    initializeWebSocket();
    preloadImages();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    const handleClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    if (canvas) {
      canvas.addEventListener("click", handleClick);
      canvas.addEventListener("mouseover", handleClick);
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener("click", handleClick);
        canvas.removeEventListener("mouseover", handleClick);
      }
    };
  }, []);

  const initializeWebSocket = () => {
    // Define the WebSocket URL
    const wsUrl = process.env.NEXT_PUBLIC_SOCKET_URL || `ws://localhost:4000`;

    // Initialize WebSocket connection
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Connected to WebSocket server");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
      // Optionally implement reconnection logic here
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };
  };

  const handleWebSocketMessage = (message) => {
    switch (message.type) {
      case "newShot":
        handleNewShot(message.data);
        break;
      case "objectPosition":
        handleObjectPosition(message.data);
        break;
      case "gameOver":
        handleGameOver(message.data);
        break;
      case "gameReset":
        handleGameReset(message.data);
        break;
      default:
        console.warn("Unknown message type:", message.type);
    }
  };

  const handleNewShot = (shot) => {
    shotsRef.current.push(shot);
    setRender((prev) => prev + 1);
    const laserSound = document.getElementById("laserSound");
    if (laserSound) laserSound.play();
    setTimeout(() => {
      shotsRef.current = shotsRef.current.filter((s) => s !== shot);
      setRender((prev) => prev + 1);
    }, 1000);
  };

  const handleObjectPosition = (position) => {
    targetPosition.current = position;
    lastUpdateTime.current = Date.now();
  };

  const handleGameOver = ({ winner }) => {
    const explosion = document.getElementById("explosion");
    const winning = document.getElementById("winning");
    if (explosion) explosion.play();
    if (winning) winning.play();
    gameActiveRef.current = false;
    winnerRef.current = winner;
    setRender((prev) => prev + 1);
  };

  const handleGameReset = (data) => {
    gameActiveRef.current = true;
    winnerRef.current = null;
    shotsRef.current = [];
    objectPositionRef.current = { x: 400, y: 300 };
    targetPosition.current = { x: 400, y: 300 };
    setRender((prev) => prev + 1);
  };

  const preloadImages = () => {
    const background = new Image();
    background.src = "/background.png";
    background.onload = () => {
      backgroundImageRef.current = background;
      const sprite = new Image();
      sprite.src = "/fax2.webp";
      sprite.onload = () => {
        spriteImageRef.current = sprite;
        draw();
      };
    };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    const renderFrame = () => {
      if (!backgroundImageRef.current || !spriteImageRef.current) {
        requestAnimationFrame(renderFrame);
        return;
      }

      const now = Date.now();
      const deltaTime = now - lastUpdateTime.current;
      const lerpFactor = Math.min(deltaTime / 100, 1);

      objectPositionRef.current.x +=
        (targetPosition.current.x - objectPositionRef.current.x) * lerpFactor;
      objectPositionRef.current.y +=
        (targetPosition.current.y - objectPositionRef.current.y) * lerpFactor;

      // Clear canvas
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background
      context.drawImage(
        backgroundImageRef.current,
        0,
        0,
        canvas.width,
        canvas.height
      );

      if (gameActiveRef.current) {
        const spriteWidth = 64;
        const spriteHeight = 64;
        context.drawImage(
          spriteImageRef.current,
          objectPositionRef.current.x - spriteWidth / 2,
          objectPositionRef.current.y - spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );
      }

      shotsRef.current.forEach((shot) => {
        context.beginPath();
        context.arc(shot.x, shot.y, 5, 0, 2 * Math.PI);
        context.fillStyle = shot.color;
        context.fill();
        context.font = "12px Arial";
        context.fillStyle = "black";
        context.fillText(shot.username, shot.x + 8, shot.y - 8);
      });

      requestAnimationFrame(renderFrame);
    };
    renderFrame();
  };

  const handleResetGame = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "resetGame", data: {} }));
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <audio id="laserSound" src="/laser-shot.mp3" preload="auto"></audio>
      <audio id="winning" src="/winning.mp3" preload="auto"></audio>
      <audio id="explosion" src="/explosion.mp3" preload="auto"></audio>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <p
          style={{
            fontSize: "18px",
            color: "#333",
            backgroundColor: "#f0f0f0",
            padding: "10px",
            borderRadius: "8px",
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
            marginBottom: "20px",
            width: "80ch",
            lineHeight: "1.6",
          }}
        >
          Join the game via API (
          <a
            href="/openapi.yaml"
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginBottom: "10px", color: "#0070f3" }}
          >
            OpenAPI specs here
          </a>
          ), get a token, and shoot at a moving target by sending API requests
          with X, Y coordinates. Hit the target first to win.
        </p>
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          style={{ border: "1px solid black" }}
        />
      </div>
      {!gameActiveRef.current && winnerRef.current && (
        <h1>{`${winnerRef.current} vince il gioco!`}</h1>
      )}
      {!gameActiveRef.current && (
        <button
          onClick={handleResetGame}
          style={{
            fontSize: "16px",
            padding: "10px 20px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          Reset Game
        </button>
      )}
    </div>
  );
}
