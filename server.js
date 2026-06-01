// خادم وسيط (Proxy) بسيط لإخفاء مفتاح Gemini API.
// المتصفح ينادي /api/explain فقط، والمفتاح يبقى هنا على الخادم في متغير بيئة.
//
// التشغيل:
//   1) npm install
//   2) انسخ .env.example إلى .env وضع مفتاحك فيه
//   3) npm start
//
// ملاحظة: ضع مفتاحك في ملف .env (غير مرفوع إلى Git) وليس في الكود.

const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// المفاتيح تُقرأ من البيئة فقط — لا تظهر أبداً في كود المتصفح
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

// إعدادات وكيل ElevenLabs المحادثاتي
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

app.use(express.json({ limit: '16kb' }));

// تقديم ملفات الواجهة (index.html و questions.js)
app.use(express.static(path.join(__dirname)));

// رابط موقّع لبدء محادثة وكيل ElevenLabs — المفتاح يبقى على الخادم
app.get('/api/signed-url', async (req, res) => {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
    return res.status(500).json({ error: 'إعدادات ElevenLabs غير مكتملة على الخادم.' });
  }
  try {
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`;
    const r = await fetch(url, { headers: { 'xi-api-key': ELEVENLABS_API_KEY } });
    if (!r.ok) {
      const errText = await r.text();
      console.error('ElevenLabs signed-url error:', r.status, errText);
      return res.status(r.status === 429 ? 429 : 502).json({ error: 'تعذّر بدء المحادثة.' });
    }
    const data = await r.json();
    return res.json({ signedUrl: data.signed_url });
  } catch (err) {
    console.error('signed-url error:', err);
    return res.status(502).json({ error: 'فشل الاتصال بـ ElevenLabs.' });
  }
});

app.post('/api/explain', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY غير مضبوط على الخادم.' });
  }

  const { question, answer } = req.body || {};
  if (typeof question !== 'string' || typeof answer !== 'string') {
    return res.status(400).json({ error: 'مدخلات غير صالحة.' });
  }

  // تقييد طول المدخلات لتفادي إساءة الاستخدام
  const q = question.slice(0, 2000);
  const a = answer.slice(0, 500);

  const promptText = `أنت معلم خبير في اختبار القدرات العامة (قياس).
السؤال: "${q}"
الإجابة الصحيحة: "${a}"

اكتب شرحاً مبسّطاً وسريعاً وواضحاً لطريقة الحل باستخدام استراتيجيات الحل الذكي (مثل التخمين المنطقي، التجريب، أو القوانين المختصرة). اجعل الشرح مشوّقاً ومختصراً جداً وبلهجة تشجيعية (2-4 أسطر).`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // المفتاح يُرسل في ترويسة من الخادم إلى Google، لا يمرّ بالمتصفح
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      // نمرّر رمز الحالة دون كشف تفاصيل المفتاح
      return res.status(response.status === 429 ? 429 : 502)
                .json({ error: 'تعذّر توليد الشرح.' });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.json({ text });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'فشل الاتصال بخدمة الذكاء الاصطناعي.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على http://localhost:${PORT}`);
});
