const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Athleti camp is ongoing this season');
});

app.listen(port, () => {
    console.log(`Athleti camp is ongoing this season on ${port}`);
});