// pages/index.js

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

let socket;

export default function Home() {
  const canvasRef = useRef(null);
  const [objectPosition, setObjectPosition] = useState({ x: 400, y: 300 });
  const [shots, setShots] = useState([]);
  const [gameActive, setGameActive] = useState(true);
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    socketInitializer();
  }, []);

  const socketInitializer = async () => {
    socket = io();

    socket.on("connect", () => {
      console.log("Connected to server");
    });

    // Listen for new shots
    socket.on("newShot", (shot) => {
      setShots((prevShots) => [...prevShots, shot]);

      // Remove the shot after 1 second
      setTimeout(() => {
        setShots((prevShots) => prevShots.filter((s) => s !== shot));
      }, 1000);
    });

    // Listen for object position updates
    socket.on("objectPosition", (position) => {
      setObjectPosition(position);
    });

    // Listen for game over event
    socket.on("gameOver", ({ winner }) => {
      setGameActive(false);
      setWinner(winner);
    });

    // Listen for game reset
    socket.on("gameReset", () => {
      setGameActive(true);
      setWinner(null);
      setShots([]);
      setObjectPosition({ x: 400, y: 300 });
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    let animationFrameId;

    const render = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      if (gameActive) {
        // Draw the moving object
        context.beginPath();
        context.arc(objectPosition.x, objectPosition.y, 10, 0, 2 * Math.PI);
        context.fillStyle = "blue";
        context.fill();
      }

      // Draw shots
      shots.forEach((shot) => {
        context.beginPath();
        context.arc(shot.x, shot.y, 5, 0, 2 * Math.PI);
        context.fillStyle = shot.color;
        context.fill();

        // Draw username
        context.font = "12px Arial";
        context.fillStyle = "black";
        context.fillText(shot.username, shot.x + 8, shot.y - 8);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [objectPosition, shots, gameActive]);

  const handleResetGame = () => {
    socket.emit("resetGame");
  };

  return (
    <div style={{ textAlign: "center" }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ border: "1px solid black" }}
      />
      {!gameActive && winner && <h1>{`${winner} wins the game!`}</h1>}
      {!gameActive && (
        <button
          onClick={handleResetGame}
          style={{ fontSize: "16px", padding: "10px 20px" }}
        >
          Restart Game
        </button>
      )}
    </div>
  );
}
