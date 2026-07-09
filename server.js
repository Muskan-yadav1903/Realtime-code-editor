const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Actions');

const server = http.createServer(app);

// Enable CORS
app.use(cors());

// Socket.IO with CORS
const io = new Server(server, {
    cors: {
        origin: "*", // Change to your Vercel URL later
        methods: ["GET", "POST"],
    },
});

// Health check
app.get("/", (req, res) => {
    res.send("Realtime Code Editor Backend is Running 🚀");
});

// Serve React build (optional for local use)
app.use(express.static(path.join(__dirname, "build")));

app.get("*", (req, res) => {
    const buildPath = path.join(__dirname, "build", "index.html");

    if (require("fs").existsSync(buildPath)) {
        res.sendFile(buildPath);
    } else {
        res.status(404).send("Frontend not found");
    }
});

const userSocketMap = {};

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => ({
            socketId,
            username: userSocketMap[socketId],
        })
    );
}

io.on("connection", (socket) => {
    console.log("Socket Connected:", socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;

        socket.join(roomId);

        const clients = getAllConnectedClients(roomId);

        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, {
            code,
        });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, {
            code,
        });
    });

    socket.on("disconnecting", () => {
        const rooms = [...socket.rooms];

        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });

        delete userSocketMap[socket.id];

        socket.leave();
    });

    socket.on("disconnect", () => {
        console.log("Socket Disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});