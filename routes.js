// routes.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const router = express.Router();

// === 1. CREATE A NEW GAME ===
router.post('/games', async (req, res) => {
    try {
        const newGameId = uuidv4();
        await db.query("INSERT INTO Games (gameId, status) VALUES ($1, 'waiting')", [newGameId]);
        res.status(201).json({ message: "New game created!", gameId: newGameId });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// === 2. JOIN A GAME ===
router.post('/games/:gameId/join', async (req, res) => {
    try {
        const { gameId } = req.params;
        const { playerName } = req.body;

        // Check if game exists and is waiting for players
        const gameRes = await db.query("SELECT * FROM Games WHERE gameId = $1 AND status = 'waiting'", [gameId]);
        if (gameRes.rows.length === 0) {
            return res.status(404).json({ message: "Game not found or has already started." });
        }
        
        // Get current player count
        const playersRes = await db.query("SELECT COUNT(*) FROM Players WHERE gameId = $1", [gameId]);
        const playerCount = parseInt(playersRes.rows[0].count);

        if (playerCount >= 30) {
            return res.status(400).json({ message: "Game is full."});
        }
        
        // Add new player
        const newPlayerId = uuidv4();
        const turnOrder = playerCount + 1;
        await db.query("INSERT INTO Players (playerId, gameId, playerName, turnOrder) VALUES ($1, $2, $3, $4)", [newPlayerId, gameId, playerName, turnOrder]);

        // Create 4 pieces for the new player
        for (let i = 0; i < 4; i++) {
            const newPieceId = uuidv4();
            await db.query("INSERT INTO Pieces (pieceId, ownerPlayerId, position) VALUES ($1, $2, 0)", [newPieceId, newPlayerId]);
        }
        
        res.status(200).json({ message: `${playerName} has joined the game!`, playerId: newPlayerId });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// === 3. START A GAME ===
router.post('/games/:gameId/start', async (req, res) => {
    try {
        const { gameId } = req.params;
        // Check player count
        const playersRes = await db.query("SELECT COUNT(*) FROM Players WHERE gameId = $1", [gameId]);
        const playerCount = parseInt(playersRes.rows[0].count);

        if (playerCount < 2) {
            return res.status(400).json({ message: "Cannot start a game with fewer than 2 players." });
        }
        
        // Update game status to 'in-progress'
        await db.query("UPDATE Games SET status = 'in-progress', currentTurnIndex = 1 WHERE gameId = $1", [gameId]);
        
        res.status(200).json({ message: "The game has started!" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// === 4. GET GAME STATE ===
router.get('/games/:gameId/state', async (req, res) => {
    try {
        const { gameId } = req.params;
        const gameRes = await db.query("SELECT * FROM Games WHERE gameId = $1", [gameId]);
        if (gameRes.rows.length === 0) {
            return res.status(404).json({ message: "Game not found." });
        }

        const playersRes = await db.query("SELECT playerId, playerName, turnOrder FROM Players WHERE gameId = $1 ORDER BY turnOrder", [gameId]);
        
        // For each player, get their pieces
        const playersWithPieces = await Promise.all(playersRes.rows.map(async (player) => {
            const piecesRes = await db.query("SELECT pieceId, position FROM Pieces WHERE ownerPlayerId = $1", [player.playerid]);
            return { ...player, pieces: piecesRes.rows };
        }));

        const gameState = {
            ...gameRes.rows[0],
            players: playersWithPieces
        };

        res.status(200).json(gameState);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;
