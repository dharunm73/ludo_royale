// routes.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const router = express.Router();

// === GAME CONSTANTS ===
const PIECES_PER_PLAYER = 4;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 30;

// === Day 5: GAME LOBBY ROUTES ===

// 1. CREATE A NEW GAME
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

// 2. JOIN A GAME
router.post('/games/:gameId/join', async (req, res) => {
    try {
        const { gameId } = req.params;
        const { playerName } = req.body;

        const gameRes = await db.query("SELECT * FROM Games WHERE gameId = $1 AND status = 'waiting'", [gameId]);
        if (gameRes.rows.length === 0) {
            return res.status(404).json({ message: "Game not found or has already started." });
        }
        
        const playersRes = await db.query("SELECT COUNT(*) FROM Players WHERE gameId = $1", [gameId]);
        const playerCount = parseInt(playersRes.rows[0].count);

        if (playerCount >= MAX_PLAYERS) {
            return res.status(400).json({ message: "Game is full."});
        }
        
        const newPlayerId = uuidv4();
        const turnOrder = playerCount + 1;
        await db.query("INSERT INTO Players (playerId, gameId, playerName, turnOrder) VALUES ($1, $2, $3, $4)", [newPlayerId, gameId, playerName, turnOrder]);

        for (let i = 0; i < PIECES_PER_PLAYER; i++) {
            const newPieceId = uuidv4();
            await db.query("INSERT INTO Pieces (pieceId, ownerPlayerId, position) VALUES ($1, $2, 0)", [newPieceId, newPlayerId]);
        }
        
        res.status(200).json({ message: `${playerName} has joined the game!`, playerId: newPlayerId });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// 3. START A GAME
router.post('/games/:gameId/start', async (req, res) => {
    try {
        const { gameId } = req.params;
        const playersRes = await db.query("SELECT COUNT(*) FROM Players WHERE gameId = $1", [gameId]);
        const playerCount = parseInt(playersRes.rows[0].count);

        if (playerCount < MIN_PLAYERS) {
            return res.status(400).json({ message: `Cannot start a game with fewer than ${MIN_PLAYERS} players.` });
        }
        
        await db.query("UPDATE Games SET status = 'in-progress', currentTurnIndex = 1 WHERE gameId = $1", [gameId]);
        
        res.status(200).json({ message: "The game has started!" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// 4. GET GAME STATE
router.get('/games/:gameId/state', async (req, res) => {
    try {
        const { gameId } = req.params;
        const gameRes = await db.query("SELECT * FROM Games WHERE gameId = $1", [gameId]);
        if (gameRes.rows.length === 0) {
            return res.status(404).json({ message: "Game not found." });
        }

        const playersRes = await db.query("SELECT playerId, playerName, turnOrder FROM Players WHERE gameId = $1 ORDER BY turnOrder", [gameId]);
        
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


// === Day 6: GAMEPLAY ROUTES ===

// 5. ROLL THE DICE
router.post('/games/:gameId/roll-dice', async (req, res) => {
    try {
        const { gameId } = req.params;
        const { playerId } = req.body;

        // --- Validation ---
        const gameRes = await db.query("SELECT * FROM Games WHERE gameId = $1 AND status = 'in-progress'", [gameId]);
        if (gameRes.rows.length === 0) return res.status(404).json({ message: "Game not found or not in progress." });
        
        const playerRes = await db.query("SELECT * FROM Players WHERE playerId = $1 AND gameId = $2", [playerId, gameId]);
        if (playerRes.rows.length === 0) return res.status(404).json({ message: "Player not found in this game." });
        
        const game = gameRes.rows[0];
        const player = playerRes.rows[0];

        if (player.turnorder !== game.currentturnindex) {
            return res.status(403).json({ message: "It's not your turn." });
        }

        // --- Action ---
        const diceRoll = Math.floor(Math.random() * 6) + 1;
        await db.query("UPDATE Games SET lastDiceRoll = $1 WHERE gameId = $2", [diceRoll, gameId]);
        
        res.status(200).json({ message: `${player.playername} rolled a ${diceRoll}`, diceRoll });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// 6. MOVE A PIECE
router.post('/games/:gameId/move-piece', async (req, res) => {
    try {
        const { gameId } = req.params;
        const { playerId, pieceId } = req.body;

        // --- Validation ---
        const gameRes = await db.query("SELECT * FROM Games WHERE gameId = $1 AND status = 'in-progress'", [gameId]);
        if (gameRes.rows.length === 0) return res.status(404).json({ message: "Game not found or not in progress." });
        const game = gameRes.rows[0];

        if (game.lastdiceroll == null) return res.status(400).json({ message: "You must roll the dice first." });
        
        const playerRes = await db.query("SELECT * FROM Players WHERE playerId = $1 AND gameId = $2", [playerId, gameId]);
        if (playerRes.rows.length === 0) return res.status(404).json({ message: "Player not found." });
        const player = playerRes.rows[0];

        if (player.turnorder !== game.currentturnindex) return res.status(403).json({ message: "It's not your turn." });

        const pieceRes = await db.query("SELECT * FROM Pieces WHERE pieceId = $1 AND ownerPlayerId = $2", [pieceId, playerId]);
        if (pieceRes.rows.length === 0) return res.status(404).json({ message: "Piece not found or does not belong to you." });
        const piece = pieceRes.rows[0];

        // --- Game Rule Logic ---
        // Rule: If a piece is at home (position 0), it needs a 6 to get out.
        if (piece.position === 0 && game.lastdiceroll !== 6) {
            return res.status(400).json({ message: "You need to roll a 6 to move a piece from home." });
        }
        
        // --- Action ---
        const startPosition = piece.position === 0 ? 1 : piece.position; // If at home, start at tile 1
        const newPosition = startPosition + game.lastdiceroll;
        
        // TODO: Add logic for "killing" an opponent's piece. This is a great next step!
        
        // Find the total number of players to wrap the turn index correctly
        const playerCountRes = await db.query("SELECT COUNT(*) FROM Players WHERE gameId = $1", [gameId]);
        const playerCount = parseInt(playerCountRes.rows[0].count);
        const nextTurnIndex = (game.currentturnindex % playerCount) + 1;

        // Update database in a transaction
        const client = await db.pool.connect(); // Using the pool directly for transactions
        try {
            await client.query('BEGIN');
            // 1. Move the player's piece
            await client.query("UPDATE Pieces SET position = $1 WHERE pieceId = $2", [newPosition, pieceId]);
            // 2. Update the game to the next turn and reset the dice roll
            await client.query("UPDATE Games SET currentTurnIndex = $1, lastDiceRoll = NULL WHERE gameId = $2", [nextTurnIndex, gameId]);
            await client.query('COMMIT');

            res.status(200).json({ message: `Moved piece to position ${newPosition}. It is now turn for player ${nextTurnIndex}.` });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;
