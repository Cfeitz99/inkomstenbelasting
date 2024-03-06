const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Request logging middleware
app.use((req, res, next) => {
    console.log(`Received ${req.method} request for ${req.url} from ${req.ip}`);
    next();
});

app.get('/', async (req, res) => {
  const { contact_id } = req.query;

  // Trigger the webhook for every request with a contact_id
  if (contact_id) {
    try {
      await axios.post('https://hooks.zapier.com/hooks/catch/16510018/3c7ywzr/', { contact_id });
      console.log(`Webhook triggered for contact_id ${contact_id}`);
    } catch (error) {
      console.error(`Failed to trigger webhook for contact_id ${contact_id}: ${error}`);
    }
  }

  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
