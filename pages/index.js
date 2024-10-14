// pages/index.js

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

let socket;

export default function Home() {
  const canvasRef = useRef(null);

  // Utilizziamo useRef per valori che cambiano frequentemente
  const objectPositionRef = useRef({ x: 400, y: 300 });
  const shotsRef = useRef([]);
  const gameActiveRef = useRef(true);
  const winnerRef = useRef(null);

  // Stato per triggerare re-render solo quando necessario (es. mostrare vincitore)
  const [, setRender] = useState(0);

  // Ref per l'immagine di sfondo e per lo sprite
  const backgroundImageRef = useRef(null);
  const spriteImageRef = useRef(null); // Nuovo ref per lo sprite

  useEffect(() => {
    socketInitializer();
    preloadImages();
    // Pulizia socket alla disconnessione del componente
    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const socketInitializer = () => {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000");

    socket.on("connect", () => {
      console.log("Connesso al server");
    });

    // Ascolta per nuovi colpi
    socket.on("newShot", (shot) => {
      shotsRef.current.push(shot);
      // Triggera il render
      setRender((prev) => prev + 1);

      const laserSound = document.getElementById("laserSound");
      laserSound.play();

      // Rimuove il colpo dopo 1 secondo
      setTimeout(() => {
        shotsRef.current = shotsRef.current.filter((s) => s !== shot);
        setRender((prev) => prev + 1);
      }, 1000);
    });

    // Ascolta per aggiornamenti della posizione dell'oggetto
    socket.on("objectPosition", (position) => {
      objectPositionRef.current = position;
    });

    // Ascolta per l'evento di fine gioco
    socket.on("gameOver", ({ winner }) => {
      const explosion = document.getElementById("explosion");
      explosion.play();

      const winning = document.getElementById("winning");
      winning.play();

      gameActiveRef.current = false;
      winnerRef.current = winner;
      setRender((prev) => prev + 1);
    });

    // Ascolta per il reset del gioco
    socket.on("gameReset", () => {
      gameActiveRef.current = true;
      winnerRef.current = null;
      shotsRef.current = [];
      objectPositionRef.current = { x: 400, y: 300 };
      setRender((prev) => prev + 1);
    });
  };

  const preloadImages = () => {
    // Precarica l'immagine di sfondo
    const background = new Image();
    background.src = "/background.png";
    background.onload = () => {
      backgroundImageRef.current = background;
      // Precarica lo sprite
      const sprite = new Image();
      sprite.src = "/fax2.webp";
      sprite.onload = () => {
        spriteImageRef.current = sprite;
        draw(); // Inizia il rendering una volta caricate le immagini
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
        // Disegna lo sprite invece del cerchio blu
        const spriteWidth = 64; // Regola la larghezza desiderata
        const spriteHeight = 64; // Regola l'altezza desiderata
        context.drawImage(
          spriteImageRef.current,
          objectPositionRef.current.x - spriteWidth / 2,
          objectPositionRef.current.y - spriteHeight / 2,
          spriteWidth,
          spriteHeight
        );
      }

      // Disegna i colpi
      shotsRef.current.forEach((shot) => {
        context.beginPath();
        context.arc(shot.x, shot.y, 5, 0, 2 * Math.PI);
        context.fillStyle = shot.color;
        context.fill();

        // Disegna il nome utente
        context.font = "12px Arial";
        context.fillStyle = "black";
        context.fillText(shot.username, shot.x + 8, shot.y - 8);
      });

      requestAnimationFrame(renderFrame);
    };

    renderFrame();
  };

  const handleResetGame = () => {
    socket.emit("resetGame");
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
            // increase line height for better readability
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
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
            transition: "background-color 0.3s ease",
          }}
          onMouseOver={(e) => (e.target.style.backgroundColor = "#45a049")}
          onMouseOut={(e) => (e.target.style.backgroundColor = "#4CAF50")}
        >
          Riavvia Gioco
        </button>
      )}
    </div>
  );
}
