const formidable = require('formidable');
const nodemailer = require('nodemailer');
const fs = require('fs');

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    uploadDir: '/tmp',
    keepExtensions: true,
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 10,
    filter: ({ mimetype }) => mimetype && mimetype.startsWith('image/'),
  });

  let fields, files;
  try {
    [fields, files] = await form.parse(req);
  } catch {
    return res.status(400).json({ error: 'Failed to parse form data.' });
  }

  const get = (key) => (fields[key]?.[0] || '').trim();
  const workerName  = get('workerName');
  const jobSite     = get('jobSite');
  const reportDate  = get('reportDate');
  const startTime   = get('startTime');
  const endTime     = get('endTime');
  const description = get('description');
  const notes       = get('notes');

  if (!workerName || !jobSite || !reportDate || !startTime || !endTime || !description) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const totalHours = calcHours(startTime, endTime);
  const photoFiles = [].concat(files.photos || []);
  const attachments = photoFiles.map((f) => ({
    filename: f.originalFilename || 'photo.jpg',
    content: fs.readFileSync(f.filepath),
  }));

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Daily Report" <${process.env.GMAIL_USER}>`,
      to: process.env.MANAGER_EMAIL,
      subject: `Daily Report – ${jobSite} – ${workerName} – ${formatDate(reportDate)}`,
      html: buildEmailHtml({ workerName, jobSite, reportDate, startTime, endTime, totalHours, description, notes, photoCount: attachments.length }),
      attachments,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Failed to send report. Please try again.' });
  } finally {
    photoFiles.forEach((f) => { try { fs.unlinkSync(f.filepath); } catch {} });
  }
};

function calcHours(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return 'N/A';
  const h = Math.floor(diff / 60), m = diff % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDate(dateStr) {
  const [y, mo, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(mo) - 1]} ${parseInt(d)}, ${y}`;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildEmailHtml({ workerName, jobSite, reportDate, startTime, endTime, totalHours, description, notes, photoCount }) {
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:#f59e0b;padding:24px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Daily Work Report</h1>
            <p style="margin:4px 0 0;color:#fff7e6;font-size:14px;">${formatDate(reportDate)}</p>
          </td>
        </tr>
        <tr><td style="padding:28px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" style="padding-bottom:20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px;">Worker</p>
                <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">${esc(workerName)}</p>
              </td>
              <td width="50%" style="padding-bottom:20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px;">Job Site</p>
                <p style="margin:0;font-size:16px;color:#111827;font-weight:600;">${esc(jobSite)}</p>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding-bottom:20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px;">Start Time</p>
                <p style="margin:0;font-size:16px;color:#111827;">${esc(startTime)}</p>
              </td>
              <td width="50%" style="padding-bottom:20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px;">End Time</p>
                <p style="margin:0;font-size:16px;color:#111827;">${esc(endTime)}</p>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding-bottom:20px;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px;">Total Hours</p>
                <p style="margin:0;font-size:20px;color:#f59e0b;font-weight:700;">${totalHours}</p>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 20px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px;">Work Performed</p>
          <div style="background:#f9fafb;border-left:3px solid #f59e0b;padding:14px 16px;border-radius:0 6px 6px 0;">
            <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">${esc(description).replace(/\n/g,'<br>')}</p>
          </div>
        </td></tr>
        ${notes ? `
        <tr><td style="padding:0 32px 20px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px;">Notes / Issues</p>
          <div style="background:#fff7f7;border-left:3px solid #ef4444;padding:14px 16px;border-radius:0 6px 6px 0;">
            <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">${esc(notes).replace(/\n/g,'<br>')}</p>
          </div>
        </td></tr>` : ''}
        ${photoCount > 0 ? `
        <tr><td style="padding:0 32px 20px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px;">Photos</p>
          <p style="margin:0;font-size:15px;color:#374151;">${photoCount} photo${photoCount > 1 ? 's' : ''} attached.</p>
        </td></tr>` : ''}
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Submitted via Daily Report</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
