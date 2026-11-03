// DEVELOPER BY :- KALYAN KING Telegram : KGF CYBER TEAM LINK : https://t.me/+e5Rr0q5ixnxlNTNl

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const qs = require('querystring');

const app = express();
const PORT = process.env.PORT || 3000;

// Cookie jar রাখার জন্য simple store
const cookieStore = {};

/**
 * Cookie string থেকে cookie object এ রূপান্তর
 */
function parseCookies(setCookieHeaders) {
  const cookies = {};
  if (!setCookieHeaders) return cookies;
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  arr.forEach((line) => {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      cookies[key] = val;
    }
  });
  return cookies;
}

/**
 * Cookie object কে header string এ রূপান্তর
 */
function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Portal থেকে CSRF token বের করা
 */
function extractCsrfToken(html) {
  let token = '';

  // 1. <meta name="csrf-token" content="...">
  let m = html.match(
    /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/
  );
  if (m) token = m[1];

  // 2. <input name="__RequestVerificationToken" value="...">
  if (!token) {
    m = html.match(
      /<input[^>]+name=["']__RequestVerificationToken["'][^>]+value=["']([^"']+)["']/
    );
    if (m) token = m[1];
  }

  // 3. CSRF-TOKEN=... (set-cookie style)
  if (!token) {
    m = html.match(/CSRF-TOKEN=([^;\s]+)/);
    if (m) token = m[1];
  }

  // 4. "csrf": "..." বা 'csrf': '...'
  if (!token) {
    m = html.match(/["']csrf["'\s]*:[\s]*["']([^"']+)["']/);
    if (m) token = m[1];
  }

  return token;
}

/**
 * Image URL normalize করা
 */
function normalizeImage(img) {
  if (!img || img === '-') return null;

  const match = img.match(/href='([^']+)'/);
  if (!match) return null;

  const p = match[1];
  if (p.startsWith('http')) return p;
  return 'https://emis.gov.bd' + p;
}

// ============ MAIN ROUTE ============
app.get('/CobraExpireSchoolInfo.php', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // === Input validation ===
    const eiin = (req.query.eiin || '').toString().trim();
    if (!eiin) {
      return res
        .status(400)
        .json({ error: 'eiin parameter is required' });
    }

    // page, size (যদিও ব্যবহৃত হয় না, তবুও রাখা হয়েছে)
    const page = parseInt(req.query.page || '0', 10);
    const size = parseInt(req.query.size || '1000', 10);

    const portalUrl = 'https://emis.gov.bd/EMIS/portalone';
    const cookieKey = crypto.createHash('md5').update(eiin).digest('hex');

    // === Step 1: Portal থেকে cookies + CSRF token সংগ্রহ ===
    const portalRes = await axios.get(portalUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
      },
      timeout: 30000,
      maxRedirects: 5,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
      validateStatus: () => true,
      responseType: 'text',
    });

    const portalHtml = portalRes.data || '';

    // Cookies সংরক্ষণ
    const setCookies = portalRes.headers['set-cookie'];
    cookieStore[cookieKey] = parseCookies(setCookies);

    // === Step 2: CSRF token extract ===
    const csrfToken = extractCsrfToken(portalHtml);

    if (!csrfToken) {
      return res.status(502).json({
        error: 'Could not extract CSRF token from portal',
        hint: 'Portal page structure may have changed',
      });
    }

    // === Step 3: API call ===
    const apiUrl = 'https://emis.gov.bd/emis/Portal/GetTeacherDetails';
    const postData = qs.stringify({
      instituteId: '',
      EIIN: eiin,
      isTeacher: '',
    });

    const apiRes = await axios.post(apiUrl, postData, {
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9,bn;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        Origin: 'https://emis.gov.bd',
        Referer: 'https://emis.gov.bd/EMIS/portalone',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrfToken,
        'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        Cookie: cookieHeader(cookieStore[cookieKey] || {}),
      },
      timeout: 30000,
      maxRedirects: 5,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
      validateStatus: () => true,
      responseType: 'text',
    });

    // Cookie cleanup
    delete cookieStore[cookieKey];

    const httpCode = apiRes.status;
    const apiResponse = apiRes.data;

    // === Step 4: JSON parse ===
    let data;
    try {
      data = typeof apiResponse === 'string' ? JSON.parse(apiResponse) : apiResponse;
    } catch (parseErr) {
      return res.status(502).json({
        error: 'Non-JSON response',
        httpCode: httpCode,
        rawResponse: String(apiResponse).substring(0, 300),
      });
    }

    // === Step 5: Image field normalize ===
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const emp = data[i];
        if (emp && typeof emp === 'object') {
          emp.Image = normalizeImage(emp.Image);
        }
      }
    }

    // === Final Response ===
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({
      error: 'Portal fetch failed: ' + (err.message || String(err)),
    });
  }
});

// ============ SERVER START ============
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test: http://localhost:${PORT}/CobraExpireSchoolInfo.php?eiin=123456`);
});

module.exports = app;
