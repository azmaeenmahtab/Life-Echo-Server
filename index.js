
// Force Node to use a public DNS resolver. Some ISPs / corporate networks
// can't resolve the SRV record behind `mongodb+srv://` URIs, which causes
// `queryTxt ETIMEOUT` before the driver ever opens a TCP connection.
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const cors = require('cors')
const { db_connect } = require('./db/db')
const planRoutes = require('./routes/plan.route');
const imageRoutes = require('./routes/image.route');
const lessonRoutes = require('./routes/lesson.route');
const profileRoutes = require('./routes/profile.route');


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse incoming JSON payloads
app.use(express.json());

const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Base GET route
app.get('/', (req, res) => {
  res.send('Hello World! Your Express app is running.');
});


app.use('/api', planRoutes)
app.use('/api/images', imageRoutes)
app.use('/api/lessons', lessonRoutes)
app.use('/api/profile', profileRoutes)

// Start the server
app.listen(PORT, () => {
  console.log(`Server is successfully running on http://localhost:${PORT}`);
});

db_connect().catch(console.dir);
 