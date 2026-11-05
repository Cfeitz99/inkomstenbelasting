const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;
const template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const pages = {
  approved: {
    nl: ['Bedankt voor je goedkeuring', 'We gaan de inkomstenbelastingaangifte voor je indienen'],
    en: ['Thanks for your approval.', "We'll submit the income tax return for you."],
  },
  incomplete: {
    nl: ['Deze link is niet compleet', 'Mail naar contact@taxmate.nl als je vragen hebt.'],
    en: ['This link is incomplete.', 'Email contact@taxmate.nl if you have questions.'],
  },
  failed: {
    nl: ['Je akkoord is niet verwerkt', 'Probeer het later nog een keer, of mail naar contact@taxmate.nl.'],
    en: ['Your approval did not go through.', 'Please try again later or email contact@taxmate.nl.'],
  },
};

const confirm = {
  nl: ['Ga je akkoord met de aangifte inkomstenbelasting?', 'Na je akkoord dienen wij de aangifte in.'],
  en: ['Do you approve the income tax return?', 'We submit it once you approve.'],
};

const BUTTON = { nl: 'Akkoord geven', en: 'Approve', '': 'Akkoord geven / Approve' };

// `lang=nl` or `lang=en` in the link shows that language only. A link without it, such as a mail
// a Zap still sends, shows both. Only these two values reach the page.
const cleanLang = (value) => (value === 'nl' || value === 'en' ? value : '');

const lines = ([title, text]) => `
    <h1>${title}</h1>${text ? `
    <p>${text}</p>` : ''}`;

const HELP = {
  nl: 'Klopt er iets niet? Mail <a href="mailto:contact@taxmate.nl">contact@taxmate.nl</a> voordat je akkoord geeft.',
  en: 'Something wrong? Email <a href="mailto:contact@taxmate.nl">contact@taxmate.nl</a> before you approve.',
};
HELP[''] = `${HELP.nl} ${HELP.en}`;

const message = ({ nl, en }, lang, form = '') => {
  if (lang === 'en') return lines(en) + form;
  if (lang === 'nl') return lines(nl) + form;
  return `${lines(nl)}${form}
    <p class="accent">${en.join(' ')}</p>`;
};

const SIDE = {
  nl: {
    label: 'Inkomstenbelasting',
    safe: 'We gebruiken je gegevens alleen voor je administratie.',
    questions: 'Vragen? Mail <a href="mailto:contact@taxmate.nl">contact@taxmate.nl</a>',
  },
  en: {
    label: 'Income tax return',
    safe: 'We only use your details for your administration.',
    questions: 'Questions? Email <a href="mailto:contact@taxmate.nl">contact@taxmate.nl</a>',
  },
};

const STEPS = {
  nl: ['Bekijk de aangifte in de bijlage van de mail.', 'Klopt alles? Geef dan je akkoord.', 'Wij dienen de aangifte in.'],
  en: ['Check the return attached to the email.', 'Is everything correct? Then give your approval.', 'We file the return.'],
};

const steps = (lang) => `
    <ol class="steps">${STEPS[lang === 'en' ? 'en' : 'nl'].map((item) => `<li><span>${item}</span></li>`).join('')}</ol>`;

const render = (content, lang, period = '') => {
  const side = SIDE[lang === 'en' ? 'en' : 'nl'];
  const { label } = side;
  const html = template
    .replace('{{label}}', label)
    .replace('{{period}}', period ? `\n        <p class="period">${period}</p>` : '')
    .replaceAll('{{safe}}', side.safe)
    .replaceAll('{{questions}}', side.questions)
    .replace('{{content}}', content);
  if (lang !== 'en') return html;
  return html.replace('<html lang="nl">', '<html lang="en">').replace(/<title>.*<\/title>/, '<title>Approve the income tax return</title>');
};

const show = (copy, lang) => render(message(copy, lang), lang);

const confirmation = (dealId, lang) => message(confirm, lang, `${steps(lang)}
    <form method="post" action="/">
      <input type="hidden" name="deal_id" value="${dealId}">
      <input type="hidden" name="lang" value="${lang}">
      <button type="submit">${BUTTON[lang]}</button>
    </form>
    <p class="help">${HELP[lang]}</p>`);

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
  const lang = cleanLang(req.query.lang);
  res.send(dealId ? render(confirmation(dealId, lang), lang) : show(pages.incomplete, lang));
});

app.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const dealId = cleanDealId(req.body.deal_id);
  const lang = cleanLang(req.body.lang);
  if (!dealId) {
    return res.status(400).send(show(pages.incomplete, lang));
  }

  try {
    await axios.post(process.env.ZAPIER_HOOK_URL, { deal_id: dealId }, { timeout: 10000 });
    res.send(show(pages.approved, lang));
  } catch (error) {
    console.error(`Hook call failed: ${error.response?.status ?? error.code}`);
    res.status(502).send(show(pages.failed, lang));
  }
});

// The page's own font and images; Google Fonts does not carry Axiforma.
app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '30d' }));

app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
