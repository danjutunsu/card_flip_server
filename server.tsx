require('dotenv').config();
const express = require('express');
const cors = require('cors'); // import the cors middleware
const app = express();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const dbpass = process.env.DB_PASSWORD
const { WebSocketServer } = require('ws')

app.use(cors()); // Allow cross-origin requests

const server = require('http').createServer(app);

const clients = new Array

const readyClients = new Array

const wsServer = new WebSocketServer({ server });

wsServer.on('connection', function connection(ws, req) {
  console.log(`Client list before connection:`)
    clients.forEach(element => {
      console.log(element.userId)
    });
  const userId = req.url.split('=')[1];
  ws.userId = userId;
  console.log(`User ${userId} connected to the WebSocket server.`);
  // Store the new client's socket object in the clients array
  if (!clients.includes(ws)) {
    console.log("adding websocket " + ws)
    clients.push(ws);
  }
  
  if (!readyClients.includes(ws.userId)) {
    readyClients.push(ws.userId)
  }

  console.log(`Client list after connection:`)
    clients.forEach(element => {
      console.log(element.userId)
    });
  console.log(`Ready Clients: ${readyClients}`)
  readyClients.forEach(element => {
    console.log(element);
  })
  // Handle messages from the client
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  // Handle messages from the client
  ws.on('message', function incoming(message) {
    console.log('User', ws.userId, 'logged in');
  });

  // Handle the WebSocket connection being closed
  ws.on('close', function close() {
    console.log('WebSocket connection closed');
    console.log(`Client list after close:`)
    clients.forEach(element => {
      console.log(element.userId)
    });
    // Remove the client's socket object from the clients array
    clients.splice(clients.indexOf(ws));
  });
});

const port = 3002;
server.listen(port, () => {
  console.log(`WebSocket server listening on port ${port}`);
});

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
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

app.get('/api/games', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM games WHERE player1_id IS NULL or player2_id IS NULL');
    if (result.rows.length > 0) {
      console.log(`/api/clients - Step 1`)
      res.json(result);
      console.log(`result for game rows: ${result}`)
    } else if (result.rows.length === 0) {
      console.log(`/api/clients - Step 2`)
      
      const userId = req.query.userId;
      const valuesInsertPoints = [userId];
      const gameInsert =
      `INSERT INTO games (player1_id, game_status, turn_id)
      VALUES ($1, 0, 1)`
      await pool.query(gameInsert, valuesInsertPoints);
    } else {
      console.log(`/api/clients - Step 3`)
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

app.put('/api/games', async (req, res) => {
  const { userId, questionId, answer, answered, count } = req.body;
  try {
    const client = await pool.connect();
    const queryUpdateGames = `
    UPDATE games SET turn_id = $4 WHERE player1_id = $1 OR player2_id = $1
    ${answered === count ? `AND (player1_id IS NOT NULL AND player2_id IS NOT NULL)` : ''}
  `;
  const valuesInsertAnswer = [userId, questionId, answer, userId, '7'];
  await client.query(queryUpdateGames, valuesInsertAnswer);
    client.release();
    res.json({ success: true }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the answer');
  }
});

app.get('/api/lobby', async (req, res) => {
  try {
    const client = await pool.connect();
    const queryGetUsers = `
      SELECT user_id, username, status FROM lobby;
    `;
    const resultGetUsers = await client.query(queryGetUsers);
    client.release();
    const users = resultGetUsers.rows;
    const allUsersReady = users.every(user => user.status === 'Ready');
    res.json({ users, allUsersReady }); // Return users and flag indicating if all users are ready
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the lobby users');
  }
});



app.post('/api/lobby', async (req, res) => {
  const { userId } = req.body;
  try {
    const username = await getUsernameByID(userId)
    const client = await pool.connect();
    const queryUpdatePoints = `
    INSERT INTO lobby (user_id, username, status)
    VALUES ($1, $2, 'Idle');
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

app.put('/api/lobby', async (req, res) => {
  const { userId } = req.query;
  try {
    const client = await pool.connect();
    const updatedUser = `
    UPDATE lobby SET status = CASE WHEN status = 'Idle' THEN 'Ready' ELSE 'Idle' END WHERE user_id = $1 RETURNING *;
    `;
    const valueUpdateUser = [userId];
    const result = await client.query(updatedUser, valueUpdateUser);
    client.release();
    res.status(200).json(result.rows[0]); // Return updated user object with new status
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});



app.delete('/api/lobby', async (req, res) => {
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

app.get('/api/questions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM questions');
    const questions = result.rows;
    data = questions;
    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).send('An error occurred while retrieving the questions');
  }
});

app.post('/api/reset', async (req, res) => {
  const { userId } = req.body;

  try {
    const client = await pool.connect();
    const queryUpdatePoints = `
      UPDATE points
      SET
        correct_round = 0,
        incorrect_round = 0,
        total_round = 0
      WHERE user_id = $1;
    `;
    const valuesUpdatePoints = [userId];
    const resultUpdatePoints = await client.query(queryUpdatePoints, valuesUpdatePoints);
    client.release();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the guess');
  }
});

app.post('/api/guesses', async (req, res) => {
  const { userId, questionId, userGuess } = req.body;

  try {
    const client = await pool.connect();
    const { rows } = await client.query(
            'SELECT answer FROM questions WHERE id = $1',
            [questionId]
          );
    const answer = rows[0].answer;
    const queryUserPoints = `
      SELECT * FROM points
      WHERE user_id = $1;
    `;
    const valuesUserPoints = [userId];
    const resultUserPoints = await client.query(queryUserPoints, valuesUserPoints);

    if (resultUserPoints.rows.length === 0) {
      const queryInsertPoints = `
        INSERT INTO points (user_id, points, total_guess, total_correct, total_incorrect, correct_round, incorrect_round)
        VALUES ($1, 1, 1, 1, 0, 1, 0);
      `;
      const valuesInsertPoints = [userId];
      await client.query(queryInsertPoints, valuesInsertPoints);
    } else {
      const queryUpdatePoints = `
        UPDATE points
        SET
          points = points + 1,
          total_guess = total_guess + 1,
          total_correct = total_correct + 1,
          correct_round = correct_round + 1,
          total_round = total_round + 1
        WHERE user_id = $1
          AND $2 = $3;
      `;
      const valuesUpdatePoints = [userId, Number(userGuess), answer];
      const resultUpdatePoints = await client.query(queryUpdatePoints, valuesUpdatePoints);

      if (resultUpdatePoints.rowCount === 0) {
        const queryUpdateIncorrect = `
          UPDATE points
          SET
            total_guess = total_guess + 1,
            total_incorrect = total_incorrect + 1,
            incorrect_round = incorrect_round + 1,
            total_round = total_round + 1
          WHERE user_id = $1;
        `;
        const valuesUpdateIncorrect = [userId];
        await client.query(queryUpdateIncorrect, valuesUpdateIncorrect);
      }
    }

    client.release();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the guess');
  }
});

app.post('/api/answers', async (req, res) => {
  const { userId, questionId, answer, answered, count } = req.body;

  try {
    const client = await pool.connect();
    const queryInsertAnswer = `
    INSERT INTO answers (user_id, question_id, answer)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, question_id)
    DO UPDATE SET answer = $3;
    `;
    const valuesInsertAnswer = [userId, questionId, answer];
    await client.query(queryInsertAnswer, valuesInsertAnswer);
    client.release();
    res.json({ success: true }); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the answer');
  }
});

app.get('/api/points', async (req, res) => {
  const { userId } = req.query;
  try {
    const { rows } = await pool.query('SELECT * FROM points WHERE user_id = $1', [userId]);
    
    // console.log("USER " + userId)
    // console.log(rows)
    res.json(rows)
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the points');
  }
});

app.get('/api/username', async (req, res) => {
  const { userId } = req.query;
  try {
    const username = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    res.json(username)
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the points');
  }
});

app.get('/api/guesses', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM guesses WHERE username = 'Danwell'`);
    if (rows.length) {
      console.log('True');
      return true;
    } else {
      console.log('False');
      return false;
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while retrieving the guesses');
  }
});

app.put('/api/points', async (req, res) => {
  const { userName } = req.body;
  if (!userName) {
    return res.status(400).json({ error: 'userName required' });
  }
  try {
    const query = 'INSERT INTO points (username, correct, total) VALUES ($1, $2, $3) RETURNING *';
    const values = [userName, 0, 0];
    const result = await pool.query(query, values);
    const savedPoints = result.rows[0];
    res.json(savedPoints);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the points');
  }
});
  
app.get('/api/stats', async (req, res) => {
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

app.post('/api/users', async (req, res) => {
  const { userId, userName, password } = req.body;
  try {
    // Check if the user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length > 0) {
      // Update the existing user
      const updatedUser = await pool.query('UPDATE users SET userName = $1 WHERE id = $2 RETURNING *', [userName, userId]);
      res.json(updatedUser.rows[0]);
    } else {
      // Create a new user
      console.log("CREATING")
      const savedUser = await pool.query('INSERT INTO users (id, userName, email, password) VALUES ($1, $2, $3, $4) RETURNING *', [userId, userName, "sample@sample.com", password]);
      console.log("CREATED")
      res.json(savedUser.rows[0]);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while saving the user');
  }
});

app.get('/api/user', async (req, res) => {
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

// define an endpoint to submit guesses from the second player
app.post('/api/correct', (req, res) => {
  // code to process guesses from request body
  const guesses = req.body.guesses;
  // code to validate guesses and calculate results
  const results = { score: 7, total: 10 };
  // res.json(results);
});

// define a route for the root path
app.get('/', (req, res) => {
  res.send('Hello, world!');
});

///-----------------------LOGIN-------------------------\\\

// Define the login route
app.post('/api/login', [
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
  const token = jwt.sign({ id: user.id, username }, process.env.JWT_SECRET);

  try {
    const client = await pool.connect();
    const queryUpdatePoints = `
    INSERT INTO lobby (user_id, username, status)
    VALUES ($1, $2, 'Idle');
    `;

    const valuesUpdatePoints = [user.id, username];
    const resultUpdatePoints = await client.query(queryUpdatePoints, valuesUpdatePoints);
    client.release()
  }
  catch (error) {
    console.error(error);
  }

  // Return the token and user ID to the frontend
  res.json({ token, userId: user.id });
});


async function getUserByUsername(username) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return null;
    }
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

app.listen(3001, () => console.log('Server started on port 3001'));

