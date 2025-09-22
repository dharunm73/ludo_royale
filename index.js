// index.js
const express = require('express');
require('dotenv').config();
const gameRoutes = require('./routes');

const app = express();

// Middleware to parse JSON
app.use(express.json());

// Main Route
app.get('/', (req, res) => {
    res.send('Ludo Royale API is up and running!');
});

// Use the game routes
app.use('/', gameRoutes);


// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
