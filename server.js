const express = require('express');
const http = require('http');
const socketIo = require('socket.io');


const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
      origin: "*", // Remplace par ton origine autorisée
      methods: ["GET", "POST"],
      credentials: true, // Parfois utile pour les cookies ou authentification
    }
  });

let players = [];
let deck = [];
let discardPile = [];
let currentPlayer = 0;
let direction = 1;
let gameInProgress = false;
let allPlayersReady = false;

function createDeck() {
    const colors = ['red', 'green', 'blue', 'yellow'];
    const values = [...Array(10).keys(), ...Array(10).keys(), 'skip', 'reverse', '+2'];
    let newDeck = [];
    colors.forEach(color => {
        values.forEach(value => {
            newDeck.push({ color, value });
        });
    });
    ['wild', '+4'].forEach(special => {
        for (let i = 0; i < 4; i++) newDeck.push({ color: 'wild', value: special });
    });

    for (let i = 0; i < newDeck.length; i++) newDeck[i]['id'] = i;

    return newDeck.sort(() => Math.random() - 0.5);
}

deck = createDeck();

function dealCards() {
    players.forEach(player => {
        player.hand = deck.splice(0, 7);
    });
    discardPile.push(deck.pop());
}

function startGame() {
    if (players.length < 2) {
        io.emit('gameStatus', { message: "Il faut au moins 2 joueurs pour commencer." });
        return;
    }

    gameInProgress = true;
    deck = createDeck();
    discardPile = [];
    dealCards();

    currentPlayer = 0;
    direction = 1;

    console.log(players)

    io.emit('gameStart', { players, currentPlayer, discardPile });
}


function handleSpecialCard(card) {
    switch (card.value) {
        case 'skip':
            currentPlayer = (currentPlayer + direction + players.length) % players.length;
            break;
        case 'reverse':
            direction = -direction;
            break;
        case '+2':
            currentPlayer = (currentPlayer + direction + 2 * players.length) % players.length;
            return(2);
        case 'wild':
        case '+4':
            break;
        default:
            break;
    }
}

io.on('connection', (socket) => {
    console.log(`Player ${socket.id} connected`);

    // Ajouter un joueur avec son état initial (prêt = false)
    players.push({ id: socket.id, hand: [], name: '', isReady: false });

    socket.on('joinGame', (name) => {
        if (!Array.isArray(players)) {
            console.error("Erreur : players n'est pas un tableau !");
            players = [];
        }
    
        let player = players.find(player => player.id === socket.id);
        
        if (player) {
            player.name = name;
        } else {
            console.error("Erreur : joueur introuvable", socket.id);
        }
    
        socket.emit('joinGameStatus', { message: `Welcome, ${name}!` });
        io.emit('updatePlayers', [...players]); // Envoie une copie propre
    });

    socket.on('playerReady', () => {
        let player = players.find(player => player.id === socket.id);
        player.isReady = true;

        // Vérifier si tous les joueurs sont prêts
        allPlayersReady = players.every(player => player.isReady);

        io.emit('updatePlayers', players);
        console.log(allPlayersReady, players.length >= 2, !gameInProgress)
        // Si il y a au moins 2 joueurs, qu'ils sont tous prêt et qu'on a pas déjà une game en cours
        if (allPlayersReady && players.length >= 2 && !gameInProgress) {
            startGame();
        }
    });

    socket.on('playCard', ({ card }) => {
        if (players[currentPlayer].id !== socket.id) return;
        let lastCard = discardPile[discardPile.length - 1];
        if (card.color === lastCard.color || card.value === lastCard.value || card.color === 'wild') {
            discardPile.push(card);
            players[currentPlayer].hand = players[currentPlayer].hand.filter(c => c.id !== card.id);
            const previousPlayer = players[currentPlayer]
            currentPlayer = (currentPlayer + direction + players.length) % players.length;
            
            // Check if there's a special treatment for this card
            let specialCardHandlingReturn = handleSpecialCard(card)
            // If yes, get how many cards have to be drawn
            if(specialCardHandlingReturn){
                // Force the draw of those cards
                forceDraw(specialCardHandlingReturn, currentPlayer)
            }
            
            console.log(previousPlayer)

            console.log(players[currentPlayer].id)
            io.emit('cardPlayed', { card, currentPlayer, previousPlayer, discardPile });
            io.emit('updatePlayers', players);  // Notify all players of the updated player list
        }
    });

    function forceDraw(cardQuantity, targetedPlayer){
        for(let i = 0; i < cardQuantity; i++){
            console.log('forced draw')
            let drawnCard = deck.pop();
            // nextPlayer = (currentPlayer + direction + players.length) % players.length;
            players[targetedPlayer].hand.push(drawnCard);
            console.log(drawnCard)
            // currentPlayer = (currentPlayer + direction + players.length) % players.length;
            io.emit('cardDrawn', { playerId: socket.id, drawnCard, currentPlayer });
            io.emit('updatePlayers', players);  // Notify all players of the updated player list
        }
    }

    socket.on('drawCard', () => {
        console.log('draw')
        if (players[currentPlayer].id !== socket.id) return;
        console.log(players[currentPlayer].id)
        let drawnCard = deck.pop();
        players[currentPlayer].hand.push(drawnCard);
        console.log(drawnCard)
        currentPlayer = (currentPlayer + direction + players.length) % players.length;
        io.emit('cardDrawn', { playerId: socket.id, drawnCard, currentPlayer });
        io.emit('updatePlayers', players);  // Notify all players of the updated player list
    });

    socket.on('disconnect', () => {
        players = players.filter(player => player.id !== socket.id);
        console.log('disconnect', players)
        if (players.length === 0) {
            gameInProgress = false;
            deck = createDeck();
            discardPile = [];
        } else {
            io.emit('updatePlayers', players);  // Notify all players when someone disconnects
        }
    });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

app.get('/', (req, res) => {
    res.send('Hello, World, ça marche !');
  });