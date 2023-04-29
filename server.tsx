require('dotenv').config();
const express = require('express');
const cors = require('cors'); // import the cors middleware
const app = express();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const dbpass = process.env.DB_PASSWORD
const io = require('socket.io')();

app.use(cors()); // Allow cross-origin requests

const server = require('http').createServer();


io.on('connection', (socket) => {
  console.log('a user connected');
  // handle events from this client socket here
});

io.attach(server);
const port = 3002;
server.listen(port, () => {
  console.log(`Socket.IO server listening on port ${port}`);
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
  const { userId, questionId, userGuess } = req.body;

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

app.listen(3001, () => console.log('Server started on port 3001'));

