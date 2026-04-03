const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir archivos estáticos
app.use(express.static(__dirname));

let players = {};
const spawnPoints = [
    {x: 200, y: 200}, {x: 1800, y: 200},
    {x: 200, y: 1800}, {x: 1800, y: 1800},
    {x: 1000, y: 500}, {x: 1000, y: 1500},
    {x: 500, y: 1000}, {x: 1500, y: 1000}
];

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        const startPos = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
        players[socket.id] = {
            id: socket.id,
            x: startPos.x,
            y: startPos.y,
            name: data.name || "Kat",
            color: data.color || "rojo",
            health: 100,
            lastAction: Date.now(),
            isDead: false
        };
        socket.emit('currentPlayers', players);
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('playerMovement', (m) => {
        if (players[socket.id] && !players[socket.id].isDead) {
            players[socket.id].x = m.x;
            players[socket.id].y = m.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('playerShoot', () => {
        if (players[socket.id]) players[socket.id].lastAction = Date.now();
    });

    socket.on('playerHit', (data) => {
        const victimId = data.id;
        const attackerId = socket.id;
        if (players[victimId] && !players[victimId].isDead && players[attackerId]) {
            players[victimId].health -= 10;
            players[victimId].lastAction = Date.now();
            if (players[victimId].health <= 0) {
                players[victimId].isDead = true;
                io.emit('killMessage', { attacker: players[attackerId].name, victim: players[victimId].name });
                let bestSpawn = spawnPoints[0];
                let maxDist = 0;
                spawnPoints.forEach(p => {
                    const d = Math.hypot(p.x - players[attackerId].x, p.y - players[attackerId].y);
                    if (d > maxDist) { maxDist = d; bestSpawn = p; }
                });
                io.to(victimId).emit('youDied', { cooldown: 3 });
                setTimeout(() => {
                    if (players[victimId]) {
                        players[victimId].isDead = false;
                        players[victimId].health = 100;
                        players[victimId].x = bestSpawn.x;
                        players[victimId].y = bestSpawn.y;
                        io.to(victimId).emit('respawn', players[victimId]);
                        io.emit('updateEnemyHealth', { id: victimId, health: 100 });
                        io.emit('playerMoved', players[victimId]);
                    }
                }, 3000);
            }
            io.emit('updateEnemyHealth', { id: victimId, health: players[victimId].health });
            io.to(victimId).emit('updateLocalHealth', players[victimId].health);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

setInterval(() => {
    Object.keys(players).forEach(id => {
        let p = players[id];
        if (!p.isDead && Date.now() - p.lastAction > 5000 && p.health < 100) {
            p.health = Math.min(100, p.health + 5);
            io.emit('updateEnemyHealth', { id: p.id, health: p.health });
            io.to(p.id).emit('updateLocalHealth', p.health);
        }
    });
}, 1000);

// AJUSTE PARA LA WEB: Usar el puerto que asigne el servidor o el 3000 por defecto
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
});