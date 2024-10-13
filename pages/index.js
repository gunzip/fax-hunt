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

  // Ref per l'immagine di sfondo
  const backgroundImageRef = useRef(null);

  useEffect(() => {
    socketInitializer();
    preloadBackgroundImage();
    // Pulizia socket alla disconnessione del componente
    return () => {
      if (socket) socket.disconnect();
    };
  }, []);

  const socketInitializer = () => {
    socket = io();

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

  const preloadBackgroundImage = () => {
    const background = new Image();
    background.src = "/background.png";
    background.onload = () => {
      backgroundImageRef.current = background;
      draw(); // Inizia il rendering una volta caricata l'immagine
    };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    const render = () => {
      if (!backgroundImageRef.current) {
        requestAnimationFrame(render);
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
        // Disegna l'oggetto mobile
        context.beginPath();
        context.arc(
          objectPositionRef.current.x,
          objectPositionRef.current.y,
          10,
          0,
          2 * Math.PI
        );
        context.fillStyle = "blue";
        context.fill();
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

      requestAnimationFrame(render);
    };

    render();
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
        <a
          href="/openapi.yaml"
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginBottom: "10px" }}
        >
          Read the OpenAPI Specification in order to start playing the game!
        </a>

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
          style={{ fontSize: "16px", padding: "10px 20px" }}
        >
          Riavvia Gioco
        </button>
      )}
    </div>
  );
}
