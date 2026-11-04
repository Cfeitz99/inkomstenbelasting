const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;
const template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const pages = {
  approved: `
    <div class="checkmark"></div>
    <h1>Bedankt voor je goedkeuring</h1>
    <p>We gaan de inkomstenbelastingaangifte voor je indienen</p>
    <p class="accent">Thanks for your approval. We'll submit the income tax return for you.</p>`,
  incomplete: `
    <h1>Deze link is niet compleet</h1>
    <p>Mail naar contact@taxmate.nl als je vragen hebt.</p>
    <p class="accent">This link is incomplete. Email contact@taxmate.nl if you have questions.</p>`,
  failed: `
    <h1>Je akkoord is niet verwerkt</h1>
    <p>Probeer het later nog een keer, of mail naar contact@taxmate.nl.</p>
    <p class="accent">Your approval did not go through. Please try again later or email contact@taxmate.nl.</p>`,
};

const confirmation = (dealId) => `
    <h1>Ga je akkoord met de aangifte inkomstenbelasting?</h1>
    <p>Na je akkoord dienen wij de aangifte in.</p>
    <form method="post" action="/">
      <input type="hidden" name="deal_id" value="${dealId}">
      <button type="submit">Akkoord geven / Approve</button>
    </form>
    <p class="accent">Do you approve the income tax return? We submit it once you approve.</p>`;

const render = (content) => template.replace('{{content}}', content);

// Mail clients can leave invisible characters in the link. Only digits reach the page.
const cleanDealId = (value) =>
  typeof value === 'string' ? value.normalize('NFKC').replace(/\D/g, '') : '';

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'none'",
  });
  res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode}`));
  next();
});

// Mail scanners open links before the customer does, so opening the page changes nothing.
app.get('/', (req, res) => {
  const dealId = cleanDealId(req.query.deal_id);
  res.send(render(dealId ? confirmation(dealId) : pages.incomplete));
});

app.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const dealId = cleanDealId(req.body.deal_id);
  if (!dealId) {
    return res.status(400).send(render(pages.incomplete));
  }

  try {
    await axios.post(process.env.ZAPIER_HOOK_URL, { deal_id: dealId }, { timeout: 10000 });
    res.send(render(pages.approved));
  } catch (error) {
    console.error(`Hook call failed: ${error.response?.status ?? error.code}`);
    res.status(502).send(render(pages.failed));
  }
});

app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
