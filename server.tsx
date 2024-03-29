require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const dbpass = process.env.DB_PASSWORD;
const { createServer } = require('http');
const port = process.env.PORT || 3001;
const { WebSocketServer } = require('ws');
process.env.NODE_ENV = process.env.NODE_ENV || "development";
const { OAuth2Client } =require("google-auth-library");

let dbUrl;

if (process.env.NODE_ENV === "development") {
  // Set local backend URL
  dbUrl = process.env.LOCAL_URL;
} else {
  // Set production backend URL
  dbUrl = process.env.DB_URL;
}

const app = express();

// Enable CORS for all routes
app.use(cors());

// define a route for the root path
app.get('/', (req, res) => {
  res.send('Hello, world!');
});

async function verify(client_id, jwtToken) {
  const client = new OAuth2Client(client_id);
  // Call the verifyIdToken to
  // varify and decode it
  const ticket = await client.verifyIdToken({
      idToken: jwtToken,
      audience: client_id,
  });
  // Get the JSON with all the user info
  const payload = ticket.getPayload();
  // This is a JSON object that contains
  // all the user info
  return payload;
}

// Create a regular HTTP server
const server = app.listen(port, () => console.log('Server started on port ' + port));

const wss = new WebSocketServer({ server });

const clients = new Array
const clientId = '376031314448-4tudk4nv5fose7kvfoffrqu8oen54v60.apps.googleusercontent.com';


// app.listen(port, () => console.log('Server started on port ' + port));

const heartbeat = () => {
  clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log(`closing connection to ${ws.userId}`)
      // Client is inactive, terminate the connection
      return ws.terminate();
    } else {
      console.log(`socket is alive`)
    }

    // Set the client as inactive and send a heartbeat message
    ws.isAlive = false;
    ws.ping();
  });
};

const heartbeatInterval = 25000; // 25 seconds

// Start the heartbeat interval
// const interval = setInterval(heartbeat, heartbeatInterval);

setInterval(() => {
  clients.forEach((client) => {
    client.send(JSON.stringify(new Date().toTimeString()));
  });
}, 1000);

wss.on('connection', function connection(ws, req) {
  console.log(`CONNECTED TO WS ON BACKEND`)
  let hasUserId = false;

  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  const urlParams = new URLSearchParams(req.url.replace('/?', ''));
  const userId = urlParams.get('userId');
  const uuid = urlParams.get('uuid');
  ws.userId = userId;
  ws.uuid = uuid;

  clients.forEach((element) => {
    console.log(`UUID: ${element.uuid}`)
    console.log(`UserId: ${element.userId}`)
    if (element.userId === ws.userId) {
      hasUserId = true;
    }
  });
  
  if (hasUserId) {
    console.log(`At least one websocket contains the userId ${ws.userId}`);
  } else {
    console.log(`None of the websockets contain the userId ${ws.userId}`);
    clients.push(ws);
  }

  console.log(`Client list before connection:`)
    clients.forEach(element => {
      console.log(element.userId)
  });

  console.log(`User ${userId} connected to the WebSocket server.`);
  
  console.log(`Client list after connection:`)
    clients.forEach(element => {
      console.log(`${element.userId} at place ${clients.indexOf(element)}`)
  });

  // Handle messages from the client
ws.on('message', function incoming(message) {
  console.log('received: %s', message);

  const data = JSON.parse(message)

  // Send all clients a message to navigate to the stats page to force navigation at game's end
  if (data.payload === 'end') {
    clients.forEach((client) => {
      const end_game = data.payload;
      console.log(`Sending end_game message`)
  
      client.send(JSON.stringify({ end_game }))
    })
  }

  if (data.payload === 'start') {
    clients.forEach((client) => {
      const start_game = data.payload;
      console.log(`Sending start_game message`)
  
      client.send(JSON.stringify({ start_game }))
    })
  }

  if (data.payload === 'reset') {

    clients.forEach((client) => {
      const reset = data.payload;
      
      client.send(JSON.stringify({ reset }))
    })
  }

  if (data.payload === 'logout') {
    const index = clients.indexOf(ws);
    clients.forEach((client) => {
      const logout = data.payload;
      client.send(JSON.stringify({ logout }))
    })

    clients.splice(index, 1)
  }

  if (data.payload === 'leave') {
    clients.forEach((client) => {
      const leave = data.payload;

      client.send(JSON.stringify({ leave }))
    })
  }

  if (data.type === 'user_status_update') {
    clients.forEach((client) => {
      const user_status_update = data.payload;

      client.send(JSON.stringify({ user_status_update }))
    })
  }

  if (data.type === 'invite') {
    clients.forEach((client) => {
      console.log(`${client.userId}`)
      if (client.userId === data.payload.recipient.toString()) {
        const invite = data.payload;

        console.log(`sender ${client.userId}`)
        console.log(`recipient ${data.payload.recipient}`)

        client.send(JSON.stringify({ invite }))
      }
    })
  }

  if (data.type === 'invitee') {
    clients.forEach((client) => {
      console.log(`CLIENT ID: ${client.userId}`)
      if (client.userId === data.payload.userId.toString()) {
        const invitee = data.payload;

        console.log(`INVITING ${data.payload.userId}`)

        client.send(JSON.stringify({ invitee }))
      }
    })
  }

  if (data.type === 'user_rejected') {
    console.log(`REJECTED: ${data.payload.reject}`)
    console.log(`REQUESTED ${data.payload.request}`)
    clients.forEach((client) => {
      console.log(`CLIENT ID: ${client.userId}`)
      if (client.userId === data.payload.request.toString()) {
        const user_rejected = data.payload;
        console.log(`${data.payload.reject} rejected`)

        client.send(JSON.stringify({ user_rejected }))
      }
    })
  }

  if (data.type === 'refresh') {
    clients.forEach((client) => {
      console.log(`CLIENT ID: ${client.userId} REFRESHING ------------------------------------------------`)
      // if (client.userId === data.payload.user1.toString() || client.userId === data.payload.user2.toString()) {
        const refresh = data.payload;
        console.log(`refreshing ${client.userId }`)

        client.send(JSON.stringify({ refresh }))
      // }
    })
  }

  if (data.type === 'set_genre') {
    console.log(`xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxGENRE CLICKED`)
    console.log(`UUID: ${data.payload.uuid}`)
    const genreToSet = data.payload;

    clients.forEach((client) => {
      if (client.uuid === data.payload.uuid) {
        client.send(JSON.stringify({ genreToSet }))
      } else {
        console.log(`CLIENT ${client} UUID IS: ${client.uuid}`)
      }
    })
  }
  
  if (data.type === 'connected') {
    const connected = data.payload;

    clients.forEach((client) => {
      client.send(JSON.stringify({ connected }))
    })
  }
});

  // Handle the WebSocket connection being closed
ws.on('close', function close() {
  // clearInterval(interval)

  console.log('WebSocket connection closed');
  console.log(`Client list after close:`)
  clients.forEach(element => {
    console.log(`${element.userId} at place ${clients.indexOf(element)}`)
  });
  
  // Remove the client's socket object from the clients array
  const index = clients.indexOf(ws);
  if (index > -1) {
    clients.splice(index, 1);
  }
  });
});

// server.listen(process.env.WS || 3002, () => {
//   console.log(`WebSocket server listening on port ${process.env.WS}`);
// });

const pool = new Pool({
    user: 'postgres',
    host: dbUrl,
    database: 'trivia',
    password: dbpass,
    port: 5432, // the default PostgreSQL port
  });

  pool.query('SELECT * FROM users', (err, res) => {
    if (err) {
      console.error(err);
    } else {
      console.log(res.rows);
    }
  });

let data;

app.use(express.json())
app.use(cors())

app.get('/games', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM games WHERE player1_id IS NULL or player2_id IS NULL');
    if (result.rows.length > 0) {
      console.log(`/clients - Step 1`)
      res.json(result);
      console.log(`result for game rows: ${result}`)
    } else if (result.rows.length === 0) {
      console.log(`/clients - Step 2`)
      
      const userId = req.query.userId;
      const valuesInsertPoints = [userId];
      const gameInsert =
      `INSERT INTO games (player1_id, game_status, turn_id)
      VALUES ($1, 0, 1)`
      await pool.query(gameInsert, valuesInsertPoints);
    } else {
      console.log(`/clients - Step 3`)
      // Get the first row from the result where player1_id or player2_id is null
      const gameRow = result.rows.find(row => row.player1_id === null || row.player2_id === null);
      // Update the game row with the userId
      const userId = req.query.userId;
      if (!userId) throw new Error('User ID is missing');
      const playerIdToUpdate = gameRow.player1_id === null ? 'player1_id' : 'player2_id';
      const gameUpdate =
      `UPDATE games SET ${playerIdToUpdate} = $1,
      turn_id = $2
      WHERE id = $3`;
      await pool.query(gameUpdate, [userId, 1, gameRow.id]);
      }
  } catch (err) {
    console.log(err)
    console.log("Error while trying to find empty game")
  }
});

app.get('/games/id', async (req, res) => {
  const { player1, player2 } = req.query;
  try {
    // execute the query and get the result
    const result = await pool.query(
      'SELECT id FROM games WHERE (player1_id = $1 OR player2_id = $1) AND (player1_id = $2 OR player2_id = $2)',
      [player1, player2]
    );
    console.log(`player1: ${player1} player2: ${player2}`)

    if (result.rows.length > 0) {
      // Return the id to the front-end
      console.log(`id: ${result.rows[0].id}`)

      res.status(200).json({ player1_id: result.rows[0].player1_id, id: result.rows[0].id, game_status: result.rows[0].game_status, game_genre: result.rows[0].game_genre });
    } else {
      try {
        const gameInsert =
        `INSERT INTO games (player1_id, player2_id, game_status, turn_id)
        VALUES ($1, $2, 0, $1)`
        const valuesInsertPoints = [player1, player2]
        const result = await pool.query(gameInsert, valuesInsertPoints);
        console.log(`player1: ${player1} player2: ${player2}`)
    
        if (result.rows.length > 0) {    
          // Return the id to the front-end
          console.log(`id: ${result.rows[0].id}`)
    
          res.status(200).json({ player1_id: result.rows[0].player1_id, player2_id: result.rows[0].player2_id, id: result.rows[0].id, game_status: result.rows[0].game_status });
        } else {
          // Return an error response
          res.status(500).json({ error: 'Error inserting game' });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

app.post('/games', async (req, res) => {
  const { player1, player2 } = req.query;
  try {
    const gameInsert =
    `INSERT INTO games (player1_id, player2_id, game_status, turn_id)
    VALUES ($1, $2, 0, $1)`
    const valuesInsertPoints = [player1, player2]
    const result = await pool.query(gameInsert, valuesInsertPoints);
    console.log(`player1: ${player1} player2: ${player2}`)

    if (result.rows.length > 0) {
      // Return the id to the front-end
      console.log(`id: ${result.rows[0].id}`)

      res.status(200).json({ player1_id: result.rows[0].player1_id, player2_id: result.rows[0].player2_id, id: result.rows[0].id, game_status: result.rows[0].game_status });
    } else {
      // Return an error response
      res.status(500).json({ error: 'Error inserting game' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

app.get('/games/status', async (req, res) => {
  const { player1, player2 } = req.query;
  try {
    // execute the query and get the result
    const result = await pool.query(
      'SELECT game_status FROM games WHERE (player1_id = $1 OR player2_id = $1) AND (player1_id = $2 OR player2_id = $2)',
      [player1, player2]
    );
    console.log(`player1: ${player1} player2: ${player2}`)

    if (result.rows.length > 0) {
      // Return the id to the front-end
      console.log(`game_status: ${result.rows[0].game_status}`)

      res.status(200).json({ game_status: result.rows[0].game_status });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

app.put('/games/status', async (req, res) => {
  const { player1, player2 } = req.body;
  try {
    const client = await pool.connect();
    const queryUpdateStatus = `
    UPDATE games
    SET game_status = CASE
    WHEN game_status < 3 THEN game_status + 1
    WHEN game_status = 3 THEN 0
    END
    WHERE (player1_id = $1 OR player2_id = $1) AND (player1_id = $2 OR player2_id = $2);
    `;
    const values = [player1, player2];
    await client.query(queryUpdateStatus, values);
    client.release();
    console.log(`Player1: ${player1} Player2: ${player2}`)

    res.json({ success: true }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while updating the game status');
  }
});


app.put('/games/status/reset', async (req, res) => {
  const { player1, player2 } = req.body;
  try {
    const client = await pool.connect();
    const queryUpdateStatus = `
    UPDATE games
    SET game_status = 0
    WHERE (player1_id = $1 OR player2_id = $1) AND (player1_id = $2 OR player2_id = $2);
    `;
    const values = [player1, player2];
    await client.query(queryUpdateStatus, values);
    client.release();
    console.log(`Player1: ${player1} Player2: ${player2}`)

    res.json({ success: true }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while updating the game status');
  }
});

app.get('/games/player_turn', async (req, res) => {
  const { player, game_id } = req.query;
  try {
    // Execute the query and get the result
    const result = await pool.query(
      `SELECT 
        CASE 
          WHEN $1 = player1_id THEN player1_turn
          WHEN $1 = player2_id THEN player2_turn
        END AS turn
      FROM games
      WHERE id = $2`,
      [player, game_id]
    );
    console.log(`player: ${player}, game_id: ${game_id}`);

    if (result.rows.length > 0) {
      const playerTurn = result.rows[0].turn;
      console.log(`player turn: ${playerTurn}`)
      res.status(200).json({ playerTurn: playerTurn });
    } else {
      res.status(404).json({ error: 'Game not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.put('/games/player_turn', async (req, res) => {
  const { player, game_id } = req.body;
  console.log(`PLAYER: ${player} GAMEs: ${game_id}`)
  try {
    const client = await pool.connect();
    const queryUpdateStatus = `
    UPDATE games
    SET player1_turn = CASE
      WHEN $1 = player1_id THEN 
        CASE WHEN player1_turn = 2 THEN 0 ELSE player1_turn + 1 END
      ELSE player1_turn
    END,
    player2_turn = CASE
      WHEN $1 = player2_id THEN 
        CASE WHEN player2_turn = 2 THEN 0 ELSE player2_turn + 1 END
      ELSE player2_turn
    END
    WHERE id = $2`;

    const values = [player, game_id];
    await client.query(queryUpdateStatus, values);
    client.release();
    console.log(`Player: ${player} GameID: ${game_id}`);

    res.json({ success: true }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while updating the player turn');
  }
});


app.get('/games/turn', async (req, res) => {
  const { gameId } = req.query;
  console.log(`GameId: ${gameId}`)
  try {
    const result = await pool.query(
      'SELECT turn_id FROM games WHERE id = $1',
      [gameId]
    );
    if (result.rows && result.rows.length > 0) {
      const turnId = result.rows[0].turn_id;
      res.status(200).json({ turn_id: turnId });
    } else {
      res.status(404).json({ error: 'Turn ID not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/games/player1', async (req, res) => {
  const { game_id } = req.query;
  console.log(`GameId: ${game_id}`)
  try {
    const result = await pool.query(
      'SELECT player1_id FROM games WHERE id = $1',
      [game_id]
    );
    if (result.rows && result.rows.length > 0) {
      res.status(200).json({player1_id: result.rows[0].player1_id });
    } else {
      res.status(404).json({ error: 'Player 1 not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/games/turn', async (req, res) => {
  const { player1, player2 } = req.body
  try {
    const client = await pool.connect();
    const queryUpdateTurn = `
    UPDATE games
    SET turn_id = 
      CASE 
          WHEN turn_id = player1_id THEN player2_id 
          WHEN turn_id = player2_id THEN player1_id 
          ELSE turn_id 
      END
    WHERE (player1_id = $1 OR player2_id = $1) AND (player1_id = $2 OR player2_id = $2);
    `;
    const values = [player1, player2]
  await client.query(queryUpdateTurn, values);
    client.release();
    res.json({ success: true }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the answer');
  }
});

app.get('/games/genre', async (req, res) => {
  console.log(`GAME GENRE HERE`)
  const { player1, player2 } = req.query;
  try {
    const getGameGenre = `
      SELECT game_genre 
      FROM games
      WHERE (player1_id = $1 OR player2_id = $1) AND (player1_id = $2 OR player2_id = $2);
    `;
    const values = [player1, player2];
    const result = await pool.query(getGameGenre, values);
    res.json(result.rows[0]?.game_genre);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/games/genre', async (req, res) => {
  const { player1, player2, selectedGenre } = req.body
  try {
    const client = await pool.connect();
    const queryUpdateGenre = `
    UPDATE games
    SET game_genre = $3
    WHERE (player1_id = $1 OR player2_id = $1) AND (player1_id = $2 OR player2_id = $2);
    `;
    const values = [player1, player2, selectedGenre]
    console.log(`putting genre with ${player1} ${player2} ${selectedGenre}`)
  await client.query(queryUpdateGenre, values);
    client.release();
    res.json({ success: true }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the genre');
  }
});

app.get('/lobby', async (req, res) => {
  const { uuid } = req.query;
  console.log(`UUID: ${uuid}`)
  try {
    const client = await pool.connect();
    const queryGetUsers = `
      SELECT user_id, username, status FROM lobby WHERE lobby_id = $1;
    `;
    const values = [uuid]
    const resultGetUsers = await client.query(queryGetUsers, values);
    client.release();
    const users = resultGetUsers.rows;
    const allUsersReady = users.every(user => user.status === 'Ready' || user.status === 'In Progress');
    
    console.log(`USERS::::${users[0]}`)
    res.json({ users, allUsersReady }); // Return users and flag indicating if all users are ready
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the lobby users');
  }
});

app.post('/lobby', async (req, res) => {
  const { userId } = req.body;
  try {
    const username = await getUsernameByID(userId)
    const client = await pool.connect();
    const queryUpdatePoints = `
    INSERT INTO lobby (user_id, username, status)
    VALUES ($1, $2, 'Idle');
    ON CONFLICT (user_id) DO UPDATE SET username = $2;
    `;
    const valuesUpdatePoints = [userId, username];
    const resultUpdatePoints = await client.query(queryUpdatePoints, valuesUpdatePoints);
    client.release();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while adding the user to lobby');
  }
});

app.put('/lobby', async (req, res) => {
  const { userId } = req.query;
  const secretKey = process.env.JWT_SECRET;

  // Obtain the token from the request (e.g., from headers)
  const token = req.headers.authorization;

  // Verify and decode the token
  jwt.verify(token, secretKey, async (err, decodedToken) => {
    if (err) {
      // Token verification failed
      console.log(`INVALID TOKEN`)
      console.log(token)
      console.log(secretKey)
      console.log(decodedToken)
      res.status(401).json({ error: 'Invalid token' });
    } else {
      console.log(`VALID TOKEN`)
      try {
        const client = await pool.connect();
        const updatedUser = `
          UPDATE lobby 
          SET status = CASE 
            WHEN status = 'Idle' THEN 'Ready' 
            ELSE 'Idle' 
          END 
          WHERE user_id = $1 
          RETURNING *;
        `;
        const valueUpdateUser = [userId];
        const result = await client.query(updatedUser, valueUpdateUser);
        client.release();
        res.status(200).json(result.rows[0]);
      } catch (error) {
        console.error(error);
        res.sendStatus(500);
      }
    }
  });
});

app.put('/lobby/inprogress', async (req, res) => {
  const { userId } = req.query;
  try {
    const client = await pool.connect();
    const updatedUser = `
    UPDATE lobby 
    SET status = 'In Progress'
    WHERE user_id = $1;
    `;
    const valueUpdateUser = [userId];
    const result = await client.query(updatedUser, valueUpdateUser);
    client.release();
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.put('/lobby/idle', async (req, res) => {
  const { userId } = req.query;
  try {
    const client = await pool.connect();
    const updatedUser = `
    UPDATE lobby 
    SET status = 'Idle'
    WHERE user_id = $1;
    `;
    const valueUpdateUser = [userId];
    const result = await client.query(updatedUser, valueUpdateUser);
    client.release();
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.put('/lobby/leave', async (req, res) => {
  const { userId, uuid } = req.body;
  console.log('TRIGGERED');
  try {
    const client = await pool.connect();
    const updatedUser = `
      UPDATE lobby SET lobby_id = $3 WHERE user_id = $1 and lobby_id = $2;
    `;
    const valueUpdateUser = [userId, uuid, null];
    const result = await client.query(updatedUser, valueUpdateUser);
    client.release();
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.put('/lobby/uuid', async (req, res) => {
  const { id, uuid } = req.body;
  console.log(`uuid: ${uuid}`)
  try {
    const client = await pool.connect();
    const updatedUser = `
    UPDATE lobby SET lobby_id = $2 WHERE user_id = $1;
    `;
    const valueUpdateUser = [id, uuid];
    const result = await client.query(updatedUser, valueUpdateUser);
    client.release();
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.put('/lobby/:lobbyId', async (req, res) => {
  const { lobbyId } = req.params;
  const { userId } = req.body;
  try {
    const client = await pool.connect();
    const updatedUser = `
      UPDATE lobby SET lobby_id = $1 WHERE user_id = $2;
    `;
    const valueUpdateUser = [lobbyId, userId];
    const result = await client.query(updatedUser, valueUpdateUser);
    client.release();
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.delete('/lobby', async (req, res) => {
  const { userId } = req.query;
  try {
    const client = await pool.connect();
    const queryDeleteUser = `
      DELETE FROM lobby WHERE user_id = $1;
    `;
    const valuesDeleteUser = [userId];
    await client.query(queryDeleteUser, valuesDeleteUser);
    client.release();
    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get('/questions', async (req, res) => {
  const { genre } = req.query
  try {
    const result = await pool.query(`SELECT * FROM ${genre}`);
    const questions = result.rows;
    data = questions;
    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).send(`An error occurred while retrieving the questions from ${genre}`);
  }
});

app.get('/questions/genres', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM questions`);
    const questions = result.rows;
    data = questions;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred while retrieving the questions');
  }
});

app.get('/answers', async (req, res) => {
  const { game_id, user_id } = req.query;
  try {
    const result = await pool.query('SELECT * FROM answers WHERE game_id = $1 AND user_id = $2', [game_id, user_id]);
    const answers = result;
    console.log(`GAMEID: ${game_id}`)
    console.log(`USERID: ${user_id}`)
    console.log(`ANSWERS: ${answers}`)
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred while retrieving the answers');
  }
});

app.put('/reset', async (req, res) => {
  const { userId, userId2 } = req.body;
  console.log("CALLED RESET")
  try {
    const queryUpdatePoints = `
      UPDATE points
      SET
        correct_round = 0,
        incorrect_round = 0,
        total_round = 0
      WHERE user_id = $1 OR user_id = $2;
    `;
    const valuesUpdatePoints = [userId, userId2];
    await pool.query(queryUpdatePoints, valuesUpdatePoints);
    console.log('Reset the rounds');
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while resetting the rounds');
  }
});

app.post('/guesses', async (req, res) => {
  const { userId, questionId, userGuess, gameId } = req.body;

  try {
    const client = await pool.connect();
    const queryInsertGuess = `
    INSERT INTO guesses (user_id, question_id, guess, game_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, question_id)
    DO UPDATE SET guess = $3, game_id = $4;
    `;
    const valuesInsertGuess = [userId, questionId, userGuess, gameId];
    await client.query(queryInsertGuess, valuesInsertGuess);
    client.release();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the guess');
  }
});

app.post('/answers', async (req, res) => {
  const { userId, questionId, answer, answered, count, gameId } = req.body;

  try {
    const client = await pool.connect();
    const queryInsertAnswer = `
    INSERT INTO answers (user_id, question_id, answer, game_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, question_id)
    DO UPDATE SET answer = $3, game_id = $4;
    `;
    const valuesInsertAnswer = [userId, questionId, answer, gameId];
    await client.query(queryInsertAnswer, valuesInsertAnswer);
    client.release();
    res.json({ success: true }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the answer');
  }
});

app.get('/points', async (req, res) => {
  const { userId, gameId } = req.query;
  try {
    const { rows } = await pool.query('SELECT * FROM points WHERE user_id = $1 AND game_id = $2', [userId, gameId]);
    
    res.json(rows)
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the points');
  }
});

app.get('/points/game', async (req, res) => {
  const { user_id, game_id } = req.query;
  try {
    const { rows } = await pool.query('SELECT * FROM points WHERE user_id = $1 AND game_id = $2', [user_id, game_id]);
    console.log(`server-side gameid: ${game_id}`)
    
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'User ID and game ID not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the points');
  }
});

app.post('/points', async (req, res) => {
  const { userId } = req.body;
  if (userId) {
    try {
      const savedUser = await pool.query('INSERT INTO points (user_id, points, total_guess, total_correct, total_incorrect, correct_round, incorrect_round, total_round) VALUES ($1, 0, 0, 0, 0, 0, 0, 0)', [userId]);
      
      // console.log("CREATED")
      // res.json(savedUser.rows[0]);
    }
    catch (error) {
      console.error(error);
      res.status(500).send('An error occurred while creating new user in points');
    }
  } else {
    res.status(500).send('UserId required to create new user in points');
  }
});

app.post('/points/game', async (req, res) => {
  const { user_id, game_id } = req.body;
  if (user_id) {
    try {
      const savedUser = await pool.query('INSERT INTO points (user_id, points, total_guess, total_correct, total_incorrect, correct_round, incorrect_round, total_round, game_id) VALUES ($1, 0, 0, 0, 0, 0, 0, 0, $2)', [user_id, game_id]);
      
      // console.log("CREATED")
      // res.json(savedUser.rows[0]);
    }
    catch (error) {
      console.error(error);
      res.status(500).send('An error occurred while creating new user in points');
    }
  } else {
    res.status(500).send('UserId required to create new user in points');
  }
});

app.get('/username', async (req, res) => {
  const { userId } = req.query;
  try {
    const username = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    res.json(username)
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the points');
  }
});

app.get('/guesses', async (req, res) => {
  const { gameId, userId } = req.query;
  try {
    const result = await pool.query('SELECT * FROM guesses WHERE game_id = $1 AND user_id = $2', [gameId, userId]);
    const guesses = result.rows;
    guesses.forEach(element => {
      console.log(element)
    });
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred while retrieving the guesses');
  }
});

app.put('/points', async (req, res) => {      
  const { user_id, points, total } = req.body;
  console.log(`USERIDEE: ${user_id}`)
  console.log(`ADDED POINTS: ${points}`)
  console.log(`TOTAL: ${total}`)
  // if (!user_id || !points || !total) {
  //   return res.status(400).json({ error: 'userId, points, and total required' });
  // }
  try {
    const queryUpdatePoints = `
        UPDATE points
        SET
          points = points + $2,
          total_guess = total_guess + $3,
          total_correct = total_correct + $2,
          total_incorrect = total_incorrect + ($3 - $2),
          correct_round = $2,
          incorrect_round = $3 - $2,
          total_round = $3
        WHERE user_id = $1;
      `;
    const valuesUpdatePoints = [user_id, points, total];
    const result = await pool.query(queryUpdatePoints, valuesUpdatePoints);
    const savedPoints = result.rows[0];
    res.json(savedPoints);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the points');
  }
});


app.put('/points/game', async (req, res) => {      
  const { user_id, points, total, game_id } = req.body;
  console.log(`USERID: ${user_id}`)
  console.log(`ADDED POINTS: ${points}`)
  console.log(`TOTAL: ${total}`)
  // if (!user_id || !points || !total) {
  //   return res.status(400).json({ error: 'userId, points, and total required' });
  // }
  try {
    const queryUpdatePoints = `
        UPDATE points
        SET
          points = points + $2,
          total_guess = total_guess + $3,
          total_correct = total_correct + $2,
          total_incorrect = total_incorrect + ($3 - $2),
          correct_round = $2,
          incorrect_round = $3 - $2,
          total_round = $3
        WHERE user_id = $1 AND game_id = $4;
      `;
    const valuesUpdatePoints = [user_id, points, total, game_id];
    const result = await pool.query(queryUpdatePoints, valuesUpdatePoints);
    const savedPoints = result.rows[0];
    res.json(savedPoints);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the points');
  }
});
  
app.get('/stats', async (req, res) => {
  try {
    let count = 0;
    let total = 0;
    const result = await pool.query('SELECT userGuess FROM guesses WHERE userName = $1', ['Danwell']);
    result.rows.forEach(row => {
      total += row.userGuess;
      count++;
    });
    console.log(`Count: ${count}`)
    console.log(`Total: ${total}`)
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred while retrieving the questions');
  }
});

app.post('/users', async (req, res) => {
  const { userName, email, password } = req.body;
  if (userName && email && password) {
    try {
      const savedUser = await pool.query('INSERT INTO users (userName, email, password) VALUES ($1, $2, $3) RETURNING *', [userName, email, password]);
      
      // console.log("CREATED")
      res.json(savedUser.rows[0]);
    }
    catch (error) {
      console.error(error);
      res.status(500).send('An error occurred while saving the user');
    }
  } else {
    res.status(500).send('All forms must be completed');
  }
});

app.get('/user', async (req, res) => {
  try {
    const { uId } = req.query;
    const result = await pool.query('SELECT * FROM users WHERE "id" = $1', [uId]);
    const user = result.rows[0];
    // console.log(`USER: ${user}`);
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred while retrieving the user');
  }
});

app.get('/users/invite', async (req, res) => {
  try {
    const { username } = req.query;
    const result = await pool.query('SELECT * FROM users WHERE "username" ILIKE $1', [username]);
    const user = result.rows[0];
    res.json(user.id);
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred while retrieving the user');
  }
});

app.get('/users/email', async (req, res) => {
  try {
    const { email } = req.query;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length > 0) {
      // Email exists in the database
      console.log('Email exists');
      res.status(200).json({ exists: true });
    } else {
      // Email doesn't exist in the database
      console.log('Email does not exist');
      res.status(200).json({ exists: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error checking email');
  }
});


// define an endpoint to submit guesses from the second player
app.post('/correct', (req, res) => {
  // code to process guesses from request body
  const guesses = req.body.guesses;
  // code to validate guesses and calculate results
  const results = { score: 7, total: 10 };
  // res.json(results);
});

///-----------------------LOGIN-------------------------\\\

// Define the login route
app.post('/login', [
  // Validate the request body
  body('username').notEmpty(),
  body('password').notEmpty(),
], async (req, res) => {
  // Check if the request body is valid
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Check if the user exists and the password is correct
  const { username, password } = req.body;
  const user = await getUserByUsername(username);
  if (!user) {
    console.log("NULL USER")
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    console.log("PASSWORDS DONT MATCH")
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  console.log("GENERATING A TOKEN")
  console.log(process.env.JWT_SECRET)
  // Generate a JWT token
  const JWT_SECRET = process.env.JWT_SECRET;
  const token = jwt.sign({ id: user.id, username }, JWT_SECRET);

  try {
    const client = await pool.connect();
    const queryUpdatePoints = `
      INSERT INTO lobby (user_id, username, status)
      VALUES ($1, $2, 'Idle')
      ON CONFLICT (user_id) DO UPDATE SET username = $2;
    `;
  
    const valuesUpdatePoints = [user.id, user.username];
    const resultUpdatePoints = await client.query(queryUpdatePoints, valuesUpdatePoints);
    client.release()
  }
  catch (error) {
    console.error(error);
  }  

  // Return the token and user ID to the frontend
  res.json({ token, userId: user.id });
});

// Define the login route for google oauth
app.post('/login/google', [
  // Validate the request body
  body('email').notEmpty()
], async (req, res) => {
  // Check if the request body is valid
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Check if the user exists and the password is correct
  const { email } = req.body;
  const user = await getUserByEmail(email);
  if (!user) {
    console.log("NULL USER")
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (!bcrypt.compare(email, user.email)) {
    console.log(`EMAIL:${email} USER EMAIL:${user.email}`)
    console.log("EMAILS DONT MATCH")
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  console.log("GENERATING A TOKEN")
  console.log(process.env.JWT_SECRET)
  // Generate a JWT token
  const JWT_SECRET = process.env.JWT_SECRET;
  const token = jwt.sign({ id: user.id, email }, JWT_SECRET);

  try {
    const client = await pool.connect();
    const queryUpdatePoints = `
      INSERT INTO lobby (user_id, username, status)
      VALUES ($1, $2, 'Idle')
      ON CONFLICT (user_id) DO UPDATE SET username = $2;
    `;
  
    const valuesUpdatePoints = [user.id, user.username];
    const resultUpdatePoints = await client.query(queryUpdatePoints, valuesUpdatePoints);
    client.release()
  }
  catch (error) {
    console.error(error);
  }  

  // Return the token and user ID to the frontend
  res.json({ token, userId: user.id, username: user.username });
});

app.post('/verify', (req, res) => {
  const { token } = req.body;

  console.log(`TOKEN: ${token}`)

  // Call the verify function with the token
  verify(clientId, token)
    .then((payload) => {
      console.log(`verify token: ${payload}`)
      // Send the user information as the response
      res.json(payload);
    })
    .catch((error) => {
      // Handle the verification error
      res.status(400).json({ error: 'Verification failed' });
    });
});

async function getUserByUsername(username) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return null;
    }
    console.log(`======================================================USER BY USERNAME ` + result.rows[0].id)
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getUserByEmail(email) {
  const client = await pool.connect();
  console.log(`EMAIL: ${email}`)
  try {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return null;
    }
    console.log(`======================================================USER BY email ` + result.rows[0].id)
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getUsernameByID(id) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  } finally {
    client.release();
  }
}