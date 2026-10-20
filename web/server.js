const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = __dirname;
const DB_FILE = path.join(PUBLIC_DIR, 'data.json');
const BACKUP_FILE = path.join(PUBLIC_DIR, 'data.backup.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// Safe atomic read & write helpers
function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    const content = fs.readFileSync(DB_FILE, 'utf8');
    const data = JSON.parse(content);
    if (data && (!data.accounts || data.accounts.length === 0)) {
      const defFile = path.join(PUBLIC_DIR, 'default_accounts.json');
      if (fs.existsSync(defFile)) {
        data.accounts = JSON.parse(fs.readFileSync(defFile, 'utf8'));
      }
    }
    return data;
  } catch (err) {
    console.error('Error reading DB_FILE:', err);
    if (fs.existsSync(BACKUP_FILE)) {
      try {
        const backupContent = fs.readFileSync(BACKUP_FILE, 'utf8');
        return JSON.parse(backupContent);
      } catch (backupErr) {
        console.error('Error reading BACKUP_FILE:', backupErr);
      }
    }
    return null;
  }
}

function writeDatabase(data) {
  const jsonStr = JSON.stringify(data, null, 2);
  const tempFile = path.join(PUBLIC_DIR, `data.tmp.${Date.now()}`);
  fs.writeFileSync(tempFile, jsonStr, 'utf8');
  if (fs.existsSync(DB_FILE)) {
    try {
      fs.copyFileSync(DB_FILE, BACKUP_FILE);
    } catch (e) {
      // backup failed non-critically
    }
  }
  fs.renameSync(tempFile, DB_FILE);
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const reqPath = parsedUrl.pathname;

  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  // Helper to read JSON request body
  const getRequestBody = () => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 25 * 1024 * 1024) { // 25MB safety limit
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON format'));
        }
      });
      req.on('error', reject);
    });
  };

  // ================= API ENDPOINTS =================

  // 1. Full State API
  if (reqPath === '/api/state') {
    if (req.method === 'GET') {
      const data = readDatabase();
      return sendJson(200, data || {});
    } else if (req.method === 'POST') {
      getRequestBody().then(body => {
        try {
          const current = readDatabase() || {};
          const merged = Object.assign({}, current, body);
          if (!body.accounts && current.accounts) {
            merged.accounts = current.accounts;
          }
          writeDatabase(merged);
          return sendJson(200, { success: true, message: 'تم حفظ بيانات النظام بنجاح' });
        } catch (err) {
          return sendJson(500, { success: false, error: err.message });
        }
      }).catch(err => {
        return sendJson(400, { success: false, error: err.message });
      });
      return;
    }
  }

  // 2. Chart of Accounts Specific APIs
  if (reqPath === '/api/accounts' || reqPath.startsWith('/api/accounts/')) {
    const db = readDatabase() || {};
    db.accounts = db.accounts || [];

    // GET /api/accounts
    if (req.method === 'GET' && reqPath === '/api/accounts') {
      return sendJson(200, { success: true, accounts: db.accounts });
    }

    // POST /api/accounts (إضافة حساب جديد)
    if (req.method === 'POST' && reqPath === '/api/accounts') {
      getRequestBody().then(newAcc => {
        if (!newAcc.name || !newAcc.name.trim()) {
          return sendJson(400, { success: false, error: 'اسم الحساب مطلوب إجبارياً' });
        }
        if (!newAcc.code || !newAcc.code.trim()) {
          return sendJson(400, { success: false, error: 'كود الحساب مطلوب إجبارياً' });
        }

        const code = String(newAcc.code).trim();
        if (db.accounts.some(a => String(a.code).trim() === code)) {
          return sendJson(400, { success: false, error: `كود الحساب (${code}) مسجل بالفعل لحساب آخر` });
        }

        let parent = null;
        if (newAcc.parentId) {
          parent = db.accounts.find(a => a.id === newAcc.parentId || a.code === newAcc.parentId);
          if (!parent) {
            return sendJson(400, { success: false, error: 'الحساب الرئيسي المحدد غير موجود' });
          }
        }

        const accType = parent ? parent.type : (newAcc.type || 'asset');
        const level = parent ? (parent.level + 1) : 1;
        const nature = newAcc.nature || (parent ? parent.nature : (['asset', 'expense'].includes(accType) ? 'debit' : 'credit'));

        const accountId = 'acc_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const account = {
          id: accountId,
          code: code,
          name: newAcc.name.trim(),
          nameEn: (newAcc.nameEn || '').trim(),
          type: accType,
          subType: newAcc.subType || (parent ? parent.subType : 'general'),
          parentId: parent ? parent.id : null,
          level: level,
          nature: nature,
          isGroup: !!newAcc.isGroup,
          entity: newAcc.entity || 'all',
          status: newAcc.status === 'inactive' ? 'inactive' : 'active',
          description: (newAcc.description || '').trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // If parent was leaf, mark parent as group
        if (parent && !parent.isGroup) {
          parent.isGroup = true;
          parent.updatedAt = new Date().toISOString();
        }

        db.accounts.push(account);
        writeDatabase(db);
        return sendJson(201, { success: true, account, message: 'تم إنشاء الحساب بنجاح' });
      }).catch(err => {
        return sendJson(400, { success: false, error: err.message });
      });
      return;
    }

    // PUT /api/accounts/:id (تعديل حساب)
    if (req.method === 'PUT') {
      const parts = reqPath.split('/');
      const accId = parts[3];
      getRequestBody().then(updateData => {
        const account = db.accounts.find(a => a.id === accId || a.code === accId);
        if (!account) {
          return sendJson(404, { success: false, error: 'الحساب المطلوب تعديله غير موجود' });
        }

        // Validate code uniqueness if code changed
        if (updateData.code && String(updateData.code).trim() !== String(account.code).trim()) {
          const newCode = String(updateData.code).trim();
          if (db.accounts.some(a => a.id !== account.id && String(a.code).trim() === newCode)) {
            return sendJson(400, { success: false, error: `كود الحساب (${newCode}) مسجل بالفعل لحساب آخر` });
          }
          account.code = newCode;
        }

        // Circular parent check if parentId changed
        if (updateData.parentId !== undefined && updateData.parentId !== account.parentId) {
          if (updateData.parentId === account.id) {
            return sendJson(400, { success: false, error: 'لا يمكن تعيين الحساب كأب لنفسه' });
          }
          // Check descendant loop
          const isDescendant = (candParentId, targetId) => {
            let curr = db.accounts.find(a => a.id === candParentId);
            while (curr && curr.parentId) {
              if (curr.parentId === targetId) return true;
              curr = db.accounts.find(a => a.id === curr.parentId);
            }
            return false;
          };
          if (updateData.parentId && isDescendant(updateData.parentId, account.id)) {
            return sendJson(400, { success: false, error: 'لا يمكن جعل الحساب تابعاً لأحد فروعه (علاقة دائرية)' });
          }
          account.parentId = updateData.parentId;
          const newParent = db.accounts.find(a => a.id === updateData.parentId);
          account.level = newParent ? newParent.level + 1 : 1;
        }

        if (updateData.name) account.name = updateData.name.trim();
        if (updateData.nameEn !== undefined) account.nameEn = updateData.nameEn.trim();
        if (updateData.description !== undefined) account.description = updateData.description.trim();
        if (updateData.entity !== undefined) account.entity = updateData.entity;
        if (updateData.status !== undefined) account.status = updateData.status;
        if (updateData.nature !== undefined) account.nature = updateData.nature;
        if (updateData.isGroup !== undefined) account.isGroup = !!updateData.isGroup;
        account.updatedAt = new Date().toISOString();

        writeDatabase(db);
        return sendJson(200, { success: true, account, message: 'تم تحديث بيانات الحساب بنجاح' });
      }).catch(err => {
        return sendJson(400, { success: false, error: err.message });
      });
      return;
    }

    // DELETE /api/accounts/:id (حذف أو تعطيل حساب)
    if (req.method === 'DELETE') {
      const parts = reqPath.split('/');
      const accId = parts[3];
      const account = db.accounts.find(a => a.id === accId || a.code === accId);
      if (!account) {
        return sendJson(404, { success: false, error: 'الحساب غير موجود' });
      }

      // Root accounts cannot be deleted
      if (['1', '2', '3', '4', '5'].includes(String(account.code))) {
        return sendJson(400, { success: false, error: 'لا يمكن حذف التصنيفات الرئيسية الخمسة للنظام' });
      }

      // Check if account has child accounts
      const hasChildren = db.accounts.some(a => a.parentId === account.id);
      if (hasChildren) {
        return sendJson(400, { success: false, error: 'لا يمكن حذف حساب يحتوي على حسابات فرعية تابعة له. قم بحذف أو نقل الفروع أولاً.' });
      }

      // Check if account has journal entries or invoices
      const hasJournals = (db.journals || []).some(j => {
        const d = String(j.debit || '');
        const c = String(j.credit || '');
        return d.includes(account.code) || c.includes(account.code) || d.includes(account.name) || c.includes(account.name);
      });

      if (hasJournals) {
        return sendJson(400, { 
          success: false, 
          error: 'لا يمكن حذف الحساب نظراً لوجود قيود وحركات مالية مسجلة عليه وفقاً للمعايير المحاسبية. يمكنك تعطيله بدلاً من حذفه.',
          canDeactivate: true 
        });
      }

      // Safe to delete
      db.accounts = db.accounts.filter(a => a.id !== account.id);
      writeDatabase(db);
      return sendJson(200, { success: true, message: `تم حذف الحساب (${account.name}) بنجاح` });
    }
  }

  // ================= STATIC FILE SERVING =================
  let normalizedPath = reqPath;
  if (normalizedPath === '/' || normalizedPath === '') normalizedPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, normalizedPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for single page routing
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 نظام قيد المحاسبي شغال بنجاح على: http://localhost:${PORT}`);
});
