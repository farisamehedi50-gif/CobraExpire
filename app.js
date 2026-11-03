// ============================================================
// EMIS School Info API - Node.js Version
// Original: PHP → Converted to Node.js
// Api_Owner: @Al_Nayeem756 | Telegram: @Cyber_Force756
// ============================================================

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// SSL verification disable করার জন্য custom HTTPS agent
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ============================================================
// Helper: Image URL তৈরি করা
// ============================================================
function buildImageUrl(oldPath, empId) {
  if (!oldPath || !empId) return oldPath;
  const parts = oldPath.split('/');
  const fileName = parts[parts.length - 1];
  return `https://apps.emis.gov.bd:9701/api/public/hrm/file/view/${empId}/${fileName}/10`;
}

// ============================================================
// Common headers
// ============================================================
const commonHeaders = {
  Host: 'apps.emis.gov.bd:9701',
  Connection: 'keep-alive',
  'sec-ch-ua-platform': '"Android"',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'sec-ch-ua': '"Chromium";v="154", "Android WebView";v="154", "Not A(Brand";v="99"',
  'sec-ch-ua-mobile': '?1',
  Origin: 'https://apps.emis.gov.bd',
  'X-Requested-With': 'com.xbrowser.play',
  'Sec-Fetch-Site': 'same-site',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  Referer: 'https://apps.emis.gov.bd/',
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ============================================================
// Common API request function
// ============================================================
async function apiRequest(url, method, headers, body = null) {
  try {
    const config = {
      url,
      method: method.toUpperCase(),
      headers,
      timeout: 30000,
      maxRedirects: 5,
      httpsAgent,
      validateStatus: () => true,
      responseType: 'text',
      decompress: true,
    };

    if (body !== null) {
      config.data = body;
    }

    const response = await axios(config);

    return {
      response: response.data,
      httpCode: response.status,
      error: null,
    };
  } catch (err) {
    return {
      response: false,
      httpCode: 0,
      error: err.message || String(err),
    };
  }
}

// ============================================================
// MAIN ROUTE
// ============================================================
app.get('/CobraExpireSchoolInfo.php', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    // ========== Step 1: eiin validation ==========
    const rawEiin = req.query.eiin;
    if (!rawEiin || rawEiin.toString().trim() === '') {
      return res.status(400).json({
        status: false,
        message: 'eiin প্যারামিটার প্রয়োজন। উদাহরণ: ?eiin=104532',
      });
    }

    const eiin = rawEiin.toString().trim();

    if (!/^\d+$/.test(eiin)) {
      return res.status(400).json({
        status: false,
        message: 'eiin প্যারামিটার অবশ্যই একটি সংখ্যা হতে হবে।',
      });
    }

    // ============================================================
    // ১) Head / Principal-Vice Principal list (GET)
    // ============================================================
    const urlHead = `https://apps.emis.gov.bd:9701/api/public/hrm/emp-info/get-head-by-institute-id/0/${eiin}/0`;
    const headResult = await apiRequest(urlHead, 'GET', { ...commonHeaders });

    if (headResult.response === false) {
      return res.status(500).json({
        status: false,
        message: 'Head API request error: ' + headResult.error,
      });
    }

    let headData;
    try {
      headData = JSON.parse(headResult.response);
    } catch (e) {
      return res.status(500).json({
        status: false,
        message: 'Head API returned invalid JSON',
        raw: String(headResult.response).substring(0, 500),
      });
    }

    if (headData && Array.isArray(headData.data)) {
      for (const item of headData.data) {
        if (item.image) {
          const empId = item.id ?? item.empRefId ?? null;
          item.image = buildImageUrl(item.image, empId);
        }
      }
    }

    // ============================================================
    // ২) সম্পূর্ণ Employee list (PUT)
    // ============================================================
    const urlList = 'https://apps.emis.gov.bd:9701/api/public/hrm/emp-info/get-pageable-emp-list-by-institute';
    const listHeaders = {
      ...commonHeaders,
      'Content-Type': 'application/json',
    };

    const listBody = JSON.stringify({
      listIntParam1: [],
      page: 0,
      size: 1000,
      searchValue: '',
      intParam1: null,
      intParam2: 1,
      stringParam1: eiin,
    });

    const listResult = await apiRequest(urlList, 'PUT', listHeaders, listBody);

    if (listResult.response === false) {
      return res.status(500).json({
        status: false,
        message: 'List API request error: ' + listResult.error,
      });
    }

    let listData;
    try {
      listData = JSON.parse(listResult.response);
    } catch (e) {
      return res.status(500).json({
        status: false,
        message: 'List API returned invalid JSON',
        raw: String(listResult.response).substring(0, 500),
      });
    }

    if (listData && listData.data && Array.isArray(listData.data.content)) {
      for (const item of listData.data.content) {
        if (item.image) {
          const empId = item.id ?? item.empRefId ?? null;
          item.image = buildImageUrl(item.image, empId);
        }
      }
    }

    // ============================================================
    // ৩) দুটো response একত্রে output + credit
    // ============================================================
    return res.status(200).json({
      status: true,
      eiin: eiin,
      headInfo: headData,
      employeeList: listData,
      Api_Owner: '@MehedaSanix',
      Telegram: '@Cobra_Expire',
      Developer: '@MehediSanix2',
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: 'Unexpected error: ' + (err.message || String(err)),
    });
  }
});

// ============================================================
// SERVER START
// ============================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
