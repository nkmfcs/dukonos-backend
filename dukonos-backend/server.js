require('dotenv').config({ path: '/home/uz-user/dukonos-backend/dukonos-backend/.env' });
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID: uuidv4 } = require('crypto');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(cors());
app.use('/uploads', require('express').static('/var/www/dukonos/uploads'));
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

async function uploadImageToS3(base64String) {
  console.log('uploadImageToS3 called, has image:', !!base64String, base64String ? base64String.substring(0,30) : 'null');
  if (!base64String || !base64String.startsWith('data:image')) return null;

  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;

  const type = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const ext = type.split('/')[1];
  const fileName = uuidv4() + '.' + ext;
  const filePath = '/var/www/dukonos/uploads/' + fileName;

  try {
    fs.writeFileSync(filePath, buffer);
    console.log('Image saved to:', filePath);
  } catch(err) {
    console.log('ERROR saving image:', err.message);
    return null;
  }

  return 'http://89.126.221.198/uploads/' + fileName;
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет доступа' });
  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Токен истек' });
    if (user.role === 'owner') {
      const r = await pool.query('SELECT is_blocked FROM owners WHERE id = $1', [user.owner_id]);
      if (r.rows[0]?.is_blocked) return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }
    req.user = user;
    next();
  });
}

// === АВТОРИЗАЦИЯ ===
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    res.json({ message: 'Регистрация успешна!' });
  } catch (err) { res.status(500).json({ error: 'Ошибка регистрации' }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    let userRes = await pool.query('SELECT * FROM owners WHERE email = $1', [email]);
    if (userRes.rows.length > 0) {
      if (!await bcrypt.compare(password, userRes.rows[0].password_hash)) return res.status(401).json({ error: 'Неверный пароль' });
      return res.json({ token: jwt.sign({ owner_id: userRes.rows[0].id, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '7d' }), role: 'owner' });
    }
    let empRes = await pool.query('SELECT e.*, s.owner_id FROM employees e JOIN stores s ON e.store_id = s.id WHERE e.username = $1', [email]);
    if (empRes.rows.length > 0) {
      if (!await bcrypt.compare(password, empRes.rows[0].password_hash)) return res.status(401).json({ error: 'Неверный пароль' });
      return res.json({ token: jwt.sign({ owner_id: empRes.rows[0].owner_id, store_id: empRes.rows[0].store_id, role: 'employee', username: empRes.rows[0].username }, process.env.JWT_SECRET, { expiresIn: '7d' }), role: 'employee' });
    }

    const devRes = await pool.query('SELECT * FROM developers WHERE email = $1', [email]);
    if (devRes.rows.length > 0) {
      if (!await bcrypt.compare(password, devRes.rows[0].password_hash))
        return res.status(401).json({ error: 'Неверный пароль' });
      return res.json({
        token: jwt.sign(
          { dev_id: devRes.rows[0].id, role: 'developer', name: devRes.rows[0].name },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
        ),
        role: 'developer'
      });
    }
    res.status(401).json({ error: 'Не найден' });
  } catch (err) { console.error('LOGIN ERROR:', err.message); res.status(500).json({ error: err.message }); }
});

// === ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ===
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'owner') {
      const ownerRes = await pool.query('SELECT name, phone FROM owners WHERE id = $1', [req.user.owner_id]);
      const storeRes = await pool.query('SELECT name FROM stores WHERE owner_id = $1 ORDER BY id ASC LIMIT 1', [req.user.owner_id]);
      res.json({ role: 'owner', name: ownerRes.rows[0]?.name, phone: ownerRes.rows[0]?.phone, store_name: storeRes.rows[0]?.name });
    } else {
      const empRes = await pool.query('SELECT e.name, e.phone, s.name as store_name FROM employees e JOIN stores s ON e.store_id = s.id WHERE e.username = $1', [req.user.username]);
      res.json({ role: 'employee', name: empRes.rows[0]?.name, phone: empRes.rows[0]?.phone, store_name: empRes.rows[0]?.store_name });
    }
  } catch (err) { res.status(500).json({ error: 'Ошибка профиля' }); }
});

app.put('/api/me', authenticateToken, async (req, res) => {
  try {
    const { name, phone, store_name } = req.body;
    if (req.user.role === 'owner') {
      await pool.query('UPDATE owners SET name = $1, phone = $2 WHERE id = $3', [name, phone, req.user.owner_id]);
      if (store_name) {
        const firstStore = await pool.query('SELECT id FROM stores WHERE owner_id = $1 ORDER BY id ASC LIMIT 1', [req.user.owner_id]);
        if (firstStore.rows.length > 0) {
          await pool.query('UPDATE stores SET name = $1 WHERE id = $2', [store_name, firstStore.rows[0].id]);
        }
      }
      res.json({ message: 'Профиль успешно обновлен' });
    } else {
      await pool.query('UPDATE employees SET name = $1, phone = $2 WHERE username = $3', [name, phone, req.user.username]);
      res.json({ message: 'Профиль успешно обновлен' });
    }
  } catch (err) {
    console.error('Ошибка обновления профиля:', err);
    res.status(500).json({ error: 'Ошибка обновления профиля' });
  }
});

// === ДАШБОРД ===
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const ownerId = req.user.owner_id;

    let dateFilter = "s.created_at >= CURRENT_DATE";
    let prevDateFilter = "s.created_at >= CURRENT_DATE - INTERVAL '1 day' AND s.created_at < CURRENT_DATE";

    if (period === 'week') {
      dateFilter = "s.created_at >= CURRENT_DATE - INTERVAL '7 days'";
      prevDateFilter = "s.created_at >= CURRENT_DATE - INTERVAL '14 days' AND s.created_at < CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === 'month') {
      dateFilter = "s.created_at >= CURRENT_DATE - INTERVAL '30 days'";
      prevDateFilter = "s.created_at >= CURRENT_DATE - INTERVAL '60 days' AND s.created_at < CURRENT_DATE - INTERVAL '30 days'";
    }

    const currentStats = await pool.query(`SELECT COALESCE(SUM(s.total_price), 0) as total_revenue, COUNT(DISTINCT s.receipt_id) as total_checks FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 AND ${dateFilter}`, [ownerId]);
    const revenue = Number(currentStats.rows[0].total_revenue);
    const checks = Number(currentStats.rows[0].total_checks);

    const prevStats = await pool.query(`SELECT COALESCE(SUM(s.total_price), 0) as total_revenue, COUNT(DISTINCT s.receipt_id) as total_checks FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 AND ${prevDateFilter}`, [ownerId]);
    const prevRevenue = Number(prevStats.rows[0].total_revenue);
    const prevChecks = Number(prevStats.rows[0].total_checks);

    const revenueTrend = prevRevenue === 0 ? (revenue > 0 ? 100 : 0) : Math.round(((revenue - prevRevenue) / prevRevenue) * 100);
    const checksTrend = prevChecks === 0 ? (checks > 0 ? 100 : 0) : Math.round(((checks - prevChecks) / prevChecks) * 100);

    const lowStockRes = await pool.query(`
      SELECT p.name, SUM(i.stock) as stock
      FROM products p JOIN inventory i ON p.id = i.product_id JOIN stores st ON i.store_id = st.id
      WHERE st.owner_id = $1 GROUP BY p.name HAVING SUM(i.stock) <= MIN(p.min_stock) ORDER BY stock ASC LIMIT 3
    `, [ownerId]);

    const topSalesRes = await pool.query(`
      SELECT p.name, p.icon, SUM(s.total_price) as total_sum
      FROM sales s JOIN products p ON s.product_id = p.id JOIN stores st ON s.store_id = st.id
      WHERE st.owner_id = $1 AND ${dateFilter}
      GROUP BY p.name, p.icon ORDER BY total_sum DESC LIMIT 3
    `, [ownerId]);

    const recentLogsRes = await pool.query(`
      SELECT s.receipt_id, SUM(s.total_price) as total_price, TO_CHAR(MIN(s.created_at), 'HH24:MI') as time
      FROM sales s JOIN stores st ON s.store_id = st.id
      WHERE st.owner_id = $1
      GROUP BY s.receipt_id ORDER BY MIN(s.created_at) DESC LIMIT 4
    `, [ownerId]);

    const rawSales = await pool.query(`
      SELECT s.total_price, s.created_at
      FROM sales s JOIN stores st ON s.store_id = st.id
      WHERE st.owner_id = $1 AND ${dateFilter}
    `, [ownerId]);

    let chartData = { labels: [], values: [] };

    if (period === 'today') {
      chartData.labels = ['Утро', 'День', 'Вечер', 'Ночь'];
      chartData.values = [0, 0, 0, 0];
      rawSales.rows.forEach(row => {
        const hour = new Date(row.created_at).getHours();
        if (hour >= 6 && hour < 12) chartData.values[0] += Number(row.total_price);
        else if (hour >= 12 && hour < 18) chartData.values[1] += Number(row.total_price);
        else if (hour >= 18 && hour < 23) chartData.values[2] += Number(row.total_price);
        else chartData.values[3] += Number(row.total_price);
      });
    } else if (period === 'week') {
      chartData.labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      chartData.values = [0, 0, 0, 0, 0, 0, 0];
      rawSales.rows.forEach(row => {
        let day = new Date(row.created_at).getDay();
        let index = day === 0 ? 6 : day - 1;
        chartData.values[index] += Number(row.total_price);
      });
    } else if (period === 'month') {
      chartData.labels = ['5', '10', '15', '20', '25', '30'];
      chartData.values = [0, 0, 0, 0, 0, 0];
      rawSales.rows.forEach(row => {
        const d = new Date(row.created_at).getDate();
        if(d <= 5) chartData.values[0] += Number(row.total_price);
        else if(d <= 10) chartData.values[1] += Number(row.total_price);
        else if(d <= 15) chartData.values[2] += Number(row.total_price);
        else if(d <= 20) chartData.values[3] += Number(row.total_price);
        else if(d <= 25) chartData.values[4] += Number(row.total_price);
        else chartData.values[5] += Number(row.total_price);
      });
    }

    res.json({
      revenue, checks,
      revenueTrend, checksTrend,
      lowStock: lowStockRes.rows,
      topSales: topSalesRes.rows,
      recentLogs: recentLogsRes.rows,
      chartData
    });
  } catch (err) {
    console.error('Ошибка дашборда:', err);
    res.status(500).json({ error: 'Ошибка дашборда' });
  }
});

// === СЕТЬ И МАГАЗИНЫ ===
app.get('/api/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const dateParam = req.query.date;
    let dateCondition = "created_at >= CURRENT_DATE";
    let queryParams = [req.user.owner_id];
    if (dateParam) { dateCondition = "DATE(created_at) = $2"; queryParams.push(dateParam); }
    const result = await pool.query(`SELECT s.id, s.name, s.location, (SELECT COUNT(*) FROM employees WHERE store_id = s.id) as emp_count, COALESCE((SELECT SUM(total_price) FROM sales WHERE store_id = s.id AND ${dateCondition}), 0) as total_revenue, (SELECT COUNT(DISTINCT receipt_id) FROM sales WHERE store_id = s.id AND ${dateCondition}) as total_checks FROM stores s WHERE s.owner_id = $1 ORDER BY s.id ASC;`, queryParams);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка сети' }); }
});

app.post('/api/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    res.json({ message: 'Добавлено!' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/stores/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { name } = req.body;
  if (!name || name.trim() === '') return res.status(400).json({ error: 'Название не может быть пустым' });
  try {
    await pool.query('UPDATE stores SET name = $1 WHERE id = $2 AND owner_id = $3', [name.trim(), req.params.id, req.user.owner_id]);
    res.json({ message: 'Название успешно изменено!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера при обновлении названия' });
  }
});

// === СОТРУДНИКИ ===
app.get('/api/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const result = await pool.query(`SELECT e.id, e.name, e.username, s.name as store_name, s.id as store_id FROM employees e JOIN stores s ON e.store_id = s.id WHERE s.owner_id = $1 ORDER BY e.id DESC;`, [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Запрещено' });
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(req.body.password, salt);
    res.json({ message: 'Создано' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.put('/api/employees/:id/pin', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { pin } = req.body;
  if (!pin || pin.length < 4) return res.status(400).json({ error: 'ПИН-код должен быть не короче 4 цифр' });
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(pin, salt);
    const updateRes = await pool.query(`
      UPDATE employees SET password_hash = $1
      WHERE id = $2 AND store_id IN (SELECT id FROM stores WHERE owner_id = $3)
      RETURNING id
    `, [hash, req.params.id, req.user.owner_id]);
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Сотрудник не найден' });
    res.json({ message: 'ПИН-код успешно изменен!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера при смене ПИН-кода' });
  }
});

// === ЛОГИ ===
app.get('/api/logs/:store_id', authenticateToken, async (req, res) => {
  try {
    const dateParam = req.query.date;
    let dateCondition = "s.created_at >= CURRENT_DATE";
    let queryParams = [req.params.store_id];
    if (dateParam) { dateCondition = "DATE(s.created_at) = $2"; queryParams.push(dateParam); }
    const logs = await pool.query(`SELECT s.receipt_id, s.total_price, s.created_at, p.name as product_name, s.quantity FROM sales s JOIN products p ON s.product_id = p.id WHERE s.store_id = $1 AND ${dateCondition} ORDER BY s.created_at DESC LIMIT 50;`, queryParams);
    res.json(logs.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка логов' }); }
});

app.get('/api/logs_all', authenticateToken, async (req, res) => {
  try {
    const logs = await pool.query(`SELECT s.receipt_id, s.total_price, s.created_at, p.name as product_name, s.quantity, st.name as store_name FROM sales s JOIN products p ON s.product_id = p.id JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 ORDER BY s.created_at DESC LIMIT 150;`, [req.user.owner_id]);
    res.json(logs.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка логов' }); }
});

// ==============================================
// 📦 ИНВЕНТАРИЗАЦИЯ И ТОВАРЫ
// ==============================================

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      const store_id = req.user.store_id || (await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username])).rows[0].store_id;
      const result = await pool.query(`
        SELECT p.id, p.icon, p.name, p.category as cat, p.price, i.stock, p.image_url as image, p.is_weight, p.unit
        FROM products p JOIN inventory i ON p.id = i.product_id
        WHERE i.store_id = $1 ORDER BY p.id DESC;
      `, [store_id]);
      res.json(result.rows);
    } else {
      const result = await pool.query(`
        SELECT id, icon, name, category as cat, price, stock, min_stock as "minStock", image_url as image, is_weight, unit
        FROM products WHERE owner_id = $1 ORDER BY id DESC;
      `, [req.user.owner_id]);
      res.json(result.rows);
    }
  } catch (err) { res.status(500).json({ error: 'Ошибка БД' }); }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  const { name, cat, price, icon, stock, minStock, image, is_weight, unit } = req.body;
  try {
    let imageUrl = image;
    if (image && image.startsWith('data:image')) {
      imageUrl = await uploadImageToS3(image);
    }
    const newP = await pool.query(`
      INSERT INTO products (name, category, price, icon, owner_id, stock, min_stock, image_url, is_weight, unit)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
    `, [name.trim(), cat, price, icon || '📦', req.user.owner_id, stock || 0, minStock || 10, imageUrl, is_weight || false, unit || 'pcs']);
    const saved = newP.rows[0];
    const stores = await pool.query(`SELECT id FROM stores WHERE owner_id = $1`, [req.user.owner_id]);
    for (const store of stores.rows) {
      await pool.query(`INSERT INTO inventory (store_id, product_id, stock) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [store.id, saved.id, stock || 0]);
    }
    res.json({ id: saved.id, name: saved.name, cat: saved.category, price: saved.price, stock: saved.stock, minStock: saved.min_stock, image: saved.image_url, icon: saved.icon, is_weight: saved.is_weight, unit: saved.unit });
  } catch (err) { res.status(500).json({ error: 'Ошибка создания' }); }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  const { id } = req.params;
  const { name, cat, price, stock, minStock, icon, image, is_weight, unit } = req.body;
  try {
    let imageUrl = image;
    if (image && image.startsWith('data:image')) {
      imageUrl = await uploadImageToS3(image);
    }
    const result = await pool.query(`
      UPDATE products
      SET name = $1, category = $2, price = $3, stock = $4, min_stock = $5, icon = $6, image_url = $7, is_weight = $10, unit = $11
      WHERE id = $8 AND owner_id = $9 RETURNING *
    `, [name.trim(), cat, price, stock, minStock, icon, imageUrl, id, req.user.owner_id, is_weight || false, unit || 'pcs']);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
    const updated = result.rows[0];
    res.json({ id: updated.id, name: updated.name, cat: updated.category, price: updated.price, stock: updated.stock, minStock: updated.min_stock, image: updated.image_url, icon: updated.icon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  try {
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.owner_id]);
    res.json({ message: 'Удалено!' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/inventory/update', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { store_id, inventory } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM inventory WHERE store_id = $1', [store_id]);
    for (const [productId, qty] of Object.entries(inventory)) {
      if (qty > 0) {
        await client.query(
          'INSERT INTO inventory (store_id, product_id, stock) VALUES ($1, $2, $3)',
          [store_id, productId, qty]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ message: 'Остатки успешно обновлены' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Ошибка обновления инвентаря' });
  } finally {
    client.release();
  }
});

// === ПРОДАЖИ ===
app.post('/api/sell', authenticateToken, async (req, res) => {
  const { cart, payment_method } = req.body;
  try {
    let store_id;
    if (req.user.role === 'employee') {
      store_id = req.user.store_id || (await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username])).rows[0].store_id;
    } else {
      store_id = (await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id])).rows[0].id;
    }

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${yy}${mm}`;

    const countRes = await pool.query(
      `SELECT COUNT(DISTINCT receipt_id) as current_count FROM sales WHERE store_id = $1 AND receipt_id LIKE $2`,
      [store_id, `${monthPrefix}-%`]
    );

    const nextNum = parseInt(countRes.rows[0].current_count) + 1;
    const receipt_id = `${monthPrefix}-${String(nextNum).padStart(4, '0')}`;

    await pool.query('BEGIN');

    for (let item of cart) {
      const product_id = parseInt(item.product_id) || item.product_id;
      const prodRes = await pool.query('SELECT price FROM products WHERE id = $1', [product_id]);
      if (prodRes.rows.length === 0) throw new Error('Товар не найден');
      const quantity = item.is_weight ? (item.grams / 1000) : item.quantity;
      const total_price = prodRes.rows[0].price * quantity;
      const updateRes = await pool.query('UPDATE inventory SET stock = stock - $1 WHERE store_id = $2 AND product_id = $3 AND stock >= $1 RETURNING stock;', [quantity, store_id, product_id]);
      if (updateRes.rows.length === 0) throw new Error('Недостаточно товара на складе');

      await pool.query(
        'INSERT INTO sales (store_id, product_id, quantity, total_price, receipt_id, payment_method) VALUES ($1, $2, $3, $4, $5, $6)',
        [store_id, product_id, quantity, total_price, receipt_id, payment_method]
      );
    }

    await pool.query('COMMIT');
    res.json({ message: 'Чек успешно пробит!', receipt_id });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Ошибка при пробитии чека' });
  }
});

// === ПОСТАВЩИКИ ===
app.get('/api/suppliers', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Доступ запрещен' });
  try {
    const result = await pool.query('SELECT * FROM suppliers WHERE owner_id = $1 ORDER BY id DESC', [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка загрузки поставщиков' }); }
});

app.post('/api/suppliers', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Доступ запрещен' });
  const { name, phone, visit_days } = req.body;
  try {
    await pool.query(
      'INSERT INTO suppliers (name, phone, visit_days, owner_id) VALUES ($1, $2, $3, $4)',
      [name, phone, visit_days, req.user.owner_id]
    );
    res.json({ message: 'Поставщик добавлен' });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/suppliers/pay', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { amount, supplier_id } = req.body;
  try {
    await pool.query('UPDATE suppliers SET debt = debt - $1 WHERE id = $2 AND owner_id = $3', [amount, supplier_id, req.user.owner_id]);
    res.json({ message: 'Долг погашен' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка оплаты поставщику' });
  }
});

app.delete('/api/suppliers/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Доступ запрещен' });
  try {
    await pool.query('DELETE FROM suppliers WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.owner_id]);
    res.json({ message: 'Поставщик удален' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// === ФИНАНСЫ ===
app.get('/api/finance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const salesRes = await pool.query(`SELECT payment_method, SUM(total_price) as total FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 GROUP BY payment_method`, [req.user.owner_id]);
    let cash = 0, card = 0;
    salesRes.rows.forEach(r => { if (r.payment_method === 'card') card += Number(r.total); else cash += Number(r.total); });
    const expRes = await pool.query(`SELECT SUM(amount) as total FROM expenses e JOIN stores st ON e.store_id = st.id WHERE st.owner_id = $1`, [req.user.owner_id]);
    const actualCash = cash - (Number(expRes.rows[0].total) || 0);
    const supRes = await pool.query(`SELECT id, name, debt, phone, visit_days FROM suppliers WHERE owner_id = $1 ORDER BY id ASC`, [req.user.owner_id]);
    res.json({ total_balance: actualCash + card, cash: actualCash, card: card, suppliers: supRes.rows });
  } catch (err) { res.status(500).json({ error: 'Ошибка финансов' }); }
});

app.post('/api/finance/incass', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { amount, method, store_id, password } = req.body;
  try {
    const ownerRes = await pool.query('SELECT password_hash FROM owners WHERE id = $1', [req.user.owner_id]);
    const valid = await bcrypt.compare(password, ownerRes.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Неверный пароль!' });

    const storeRes = await pool.query('SELECT id FROM stores WHERE id = $1 AND owner_id = $2', [store_id, req.user.owner_id]);
    if (!storeRes.rows.length) return res.status(404).json({ error: 'Магазин не найден' });

    const salesRes = await pool.query(
      `SELECT payment_method, COALESCE(SUM(total_price),0) as total FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 GROUP BY payment_method`,
      [req.user.owner_id]
    );
    let cash = 0, card = 0;
    salesRes.rows.forEach(r => { if (r.payment_method === 'card') card += Number(r.total); else cash += Number(r.total); });
    const expRes = await pool.query(`SELECT COALESCE(SUM(e.amount),0) as total FROM expenses e JOIN stores st ON e.store_id = st.id WHERE st.owner_id = $1`, [req.user.owner_id]);
    const actualCash = cash - Number(expRes.rows[0].total);

    if (method === 'cash' && amount > actualCash) {
      return res.status(400).json({ error: `Недостаточно наличных! Доступно: ${Math.round(actualCash).toLocaleString('ru')} UZS` });
    }
    if (method === 'card' && amount > card) {
      return res.status(400).json({ error: `Недостаточно средств на карте! Доступно: ${Math.round(card).toLocaleString('ru')} UZS` });
    }

    await pool.query(
      'INSERT INTO expenses (store_id, amount, category, description) VALUES ($1, $2, $3, $4)',
      [store_id, amount, 'Инкассация', `Инкассация ${method === 'cash' ? 'наличными' : 'картой'}`]
    );
    res.json({ message: 'Инкассация проведена' });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/finance/expense', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { amount, category, description, store_id, method } = req.body;
  try {
    const salesRes = await pool.query(
      `SELECT payment_method, COALESCE(SUM(total_price),0) as total FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 GROUP BY payment_method`,
      [req.user.owner_id]
    );
    let cash = 0, card = 0;
    salesRes.rows.forEach(r => { if (r.payment_method === 'card') card += Number(r.total); else cash += Number(r.total); });

    const expRes = await pool.query(
      `SELECT COALESCE(SUM(e.amount),0) as total FROM expenses e JOIN stores st ON e.store_id = st.id WHERE st.owner_id = $1`,
      [req.user.owner_id]
    );
    const totalExp = Number(expRes.rows[0].total);
    const actualCash = cash - totalExp;

    if (method === 'cash' && amount > actualCash) {
      return res.status(400).json({ error: `Недостаточно наличных! Доступно: ${Math.round(actualCash).toLocaleString('ru')} UZS` });
    }
    if (method === 'card' && amount > card) {
      return res.status(400).json({ error: `Недостаточно средств на карте! Доступно: ${Math.round(card).toLocaleString('ru')} UZS` });
    }

    const targetStore = store_id || (await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id])).rows[0].id;
    await pool.query(
      'INSERT INTO expenses (store_id, amount, category, description) VALUES ($1, $2, $3, $4)',
      [targetStore, amount, category, description]
    );
    res.json({ message: 'Расход записан' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка расхода' });
  }
});

app.get('/api/inventory/:storeId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT product_id, stock FROM inventory WHERE store_id = $1',
      [req.params.storeId]
    );
    res.json(result.rows);
  } catch(err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

app.post('/api/inventory/:storeId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const storeId = req.params.storeId;
  const { inventory } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const oldInv = await client.query('SELECT product_id, stock FROM inventory WHERE store_id = $1', [storeId]);
    const oldMap = {};
    oldInv.rows.forEach(r => oldMap[r.product_id] = Number(r.stock));

    await client.query('DELETE FROM inventory WHERE store_id = $1', [storeId]);

    for (const [productId, qty] of Object.entries(inventory)) {
      const newQty = Number(qty);
      if (newQty > 0) {
        await client.query(
          'INSERT INTO inventory (store_id, product_id, stock) VALUES ($1, $2, $3)',
          [storeId, productId, newQty]
        );
      }
      const oldQty = oldMap[productId] || 0;
      const diff = newQty - oldQty;
      if (diff !== 0) {
        await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [diff, productId]);
      }
    }

    for (const [productId, oldQty] of Object.entries(oldMap)) {
      if (inventory[productId] === undefined) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [oldQty, productId]);
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Остатки сохранены' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка инвентаря:', err);
    res.status(500).json({ error: 'Ошибка сохранения' });
  } finally {
    client.release();
  }
});

// === ЖУРНАЛ ===
app.get('/api/journal', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { from, to } = req.query;
  try {
    let salesDateFilter = '';
    let expDateFilter = '';
    const salesParams = [req.user.owner_id];
    const expParams = [req.user.owner_id];

    if (from && to) {
      salesDateFilter = `AND DATE(s.created_at) BETWEEN $2 AND $3`;
      salesParams.push(from, to);
      expDateFilter = `AND DATE(e.created_at) BETWEEN $2 AND $3`;
      expParams.push(from, to);
    } else if (from) {
      salesDateFilter = `AND DATE(s.created_at) >= $2`;
      salesParams.push(from);
      expDateFilter = `AND DATE(e.created_at) >= $2`;
      expParams.push(from);
    }

    const salesRes = await pool.query(`
      SELECT s.receipt_id as name, SUM(s.total_price) as amount,
             TO_CHAR(MIN(s.created_at), 'DD.MM HH24:MI') as time,
             st.name as store_name, 'income' as type
      FROM sales s JOIN stores st ON s.store_id = st.id
      WHERE st.owner_id = $1 ${salesDateFilter}
      GROUP BY s.receipt_id, st.name ORDER BY MIN(s.created_at) DESC LIMIT 100
    `, salesParams);

    const expRes = await pool.query(`
      SELECT e.category as name, e.amount,
             TO_CHAR(e.created_at, 'DD.MM HH24:MI') as time,
             st.name as store_name,
             CASE WHEN e.category = 'Инкассация' THEN 'incass' ELSE 'expense' END as type
      FROM expenses e JOIN stores st ON e.store_id = st.id
      WHERE st.owner_id = $1 ${expDateFilter}
      ORDER BY e.created_at DESC LIMIT 100
    `, expParams);

    const all = [...salesRes.rows, ...expRes.rows].sort((a, b) => b.time.localeCompare(a.time));
    res.json(all);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка журнала' });
  }
});

// === ОФЛАЙН-СИНХРОНИЗАЦИЯ ДЛЯ КАССЫ ===
app.get('/v1/sync/products', authenticateToken, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'employee') {
      const store_id = req.user.store_id || (await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username])).rows[0].store_id;
      const result = await pool.query(`
        SELECT p.id, p.barcode, p.name, p.price, i.stock, p.is_weight, p.unit
        FROM products p JOIN inventory i ON p.id = i.product_id
        WHERE i.store_id = $1
      `, [store_id]);
      rows = result.rows;
    } else {
      const result = await pool.query(`
        SELECT id, name, price, stock, is_weight, unit
        FROM products
        WHERE owner_id = $1
      `, [req.user.owner_id]);
      rows = result.rows;
    }
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('Sync error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(port, () => { console.log(`Сервер запущен на ${port}`); });

// ============================================================
// 🔐 DEVELOPER PANEL ROUTES
// ============================================================

function requireDev(req, res, next) {
  if (req.user.role !== 'developer') return res.status(403).json({ error: 'Только для разработчика' });
  next();
}

const errorLog = [];
const originalConsoleError = console.error;
console.error = (...args) => {
  errorLog.unshift({ time: new Date().toISOString(), message: args.join(' ') });
  if (errorLog.length > 100) errorLog.pop();
  originalConsoleError.apply(console, args);
};

app.get('/api/dev/me', authenticateToken, requireDev, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, created_at FROM developers WHERE id = $1', [req.user.dev_id]);
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/stats', authenticateToken, requireDev, async (req, res) => {
  try {
    const stores = await pool.query('SELECT COUNT(*) as total FROM stores');
    const owners = await pool.query('SELECT COUNT(*) as total FROM owners');
    const employees = await pool.query('SELECT COUNT(*) as total FROM employees');
    const salesToday = await pool.query(`SELECT COALESCE(SUM(total_price),0) as total, COUNT(DISTINCT receipt_id) as checks FROM sales WHERE created_at >= CURRENT_DATE`);
    const salesWeek = await pool.query(`SELECT DATE(created_at) as day, SUM(total_price) as total FROM sales WHERE created_at >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY day ASC`);
    res.json({
      stores: Number(stores.rows[0].total),
      owners: Number(owners.rows[0].total),
      employees: Number(employees.rows[0].total),
      sales_today: Number(salesToday.rows[0].total),
      checks_today: Number(salesToday.rows[0].checks),
      weekly_chart: salesWeek.rows
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/stores', authenticateToken, requireDev, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.name, s.location, s.latitude, s.longitude,
             s.is_blocked, s.plan, s.plan_expires_at,
             o.email as owner_email, o.name as owner_name, o.id as owner_id,
             (SELECT COUNT(*) FROM employees WHERE store_id = s.id) as emp_count,
             COALESCE((SELECT SUM(total_price) FROM sales WHERE store_id = s.id AND created_at >= CURRENT_DATE), 0) as today_revenue,
             COALESCE((SELECT SUM(total_price) FROM sales WHERE store_id = s.id), 0) as total_revenue,
             (SELECT MAX(created_at) FROM sales WHERE store_id = s.id) as last_sale
      FROM stores s JOIN owners o ON s.owner_id = o.id ORDER BY s.id DESC
    `);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/dev/stores/:id/block', authenticateToken, requireDev, async (req, res) => {
  try {
    const { blocked } = req.body;
    await pool.query('UPDATE stores SET is_blocked = $1 WHERE id = $2', [blocked, req.params.id]);
    res.json({ message: blocked ? 'Магазин заблокирован' : 'Магазин разблокирован' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/dev/stores/:id/plan', authenticateToken, requireDev, async (req, res) => {
  try {
    const { plan, days } = req.body;
    const expires = new Date();
    expires.setDate(expires.getDate() + (days || 30));
    await pool.query('UPDATE stores SET plan = $1, plan_expires_at = $2 WHERE id = $3', [plan, expires, req.params.id]);
    res.json({ message: 'Тариф обновлён' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/dev/stores/:id/location', authenticateToken, requireDev, async (req, res) => {
  try {
    const { latitude, longitude, location } = req.body;
    await pool.query('UPDATE stores SET latitude = $1, longitude = $2, location = $3 WHERE id = $4', [latitude, longitude, location, req.params.id]);
    res.json({ message: 'Координаты обновлены' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/stores/:id/sales', authenticateToken, requireDev, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.receipt_id, SUM(s.total_price) as total,
             TO_CHAR(MIN(s.created_at), 'DD.MM.YYYY HH24:MI') as time, COUNT(*) as items
      FROM sales s WHERE s.store_id = $1
      GROUP BY s.receipt_id ORDER BY MIN(s.created_at) DESC LIMIT 50
    `, [req.params.id]);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/users', authenticateToken, requireDev, async (req, res) => {
  try {
    const owners = await pool.query(`SELECT o.id, o.name, o.email, o.phone, 'owner' as role, o.is_blocked, COUNT(s.id) as store_count FROM owners o LEFT JOIN stores s ON s.owner_id = o.id GROUP BY o.id ORDER BY o.id DESC`);
    const employees = await pool.query(`SELECT e.id, e.name, e.username as email, e.phone, 'employee' as role, false as is_blocked, e.store_id, st.name as store_name, o.email as owner_email FROM employees e JOIN stores st ON e.store_id = st.id JOIN owners o ON st.owner_id = o.id ORDER BY e.id DESC`);
    res.json({ owners: owners.rows, employees: employees.rows });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/dev/users/password', authenticateToken, requireDev, async (req, res) => {
  try {
    const { user_id, role, new_password } = req.body;
    const hash = await bcrypt.hash(new_password, await bcrypt.genSalt(10));
    if (role === 'owner') await pool.query('UPDATE owners SET password_hash = $1 WHERE id = $2', [hash, user_id]);
    else await pool.query('UPDATE employees SET password_hash = $1 WHERE id = $2', [hash, user_id]);
    res.json({ message: 'Пароль изменён' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/dev/users/:id/block', authenticateToken, requireDev, async (req, res) => {
  try {
    const { blocked } = req.body;
    await pool.query('UPDATE owners SET is_blocked = $1 WHERE id = $2', [blocked, req.params.id]);
    res.json({ message: blocked ? 'Пользователь заблокирован' : 'Разблокирован' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dev/users/owner', authenticateToken, requireDev, async (req, res) => {
  try {
    const { name, email, password, store_name } = req.body;
    const hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    res.json({ message: 'Владелец создан' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/analytics', authenticateToken, requireDev, async (req, res) => {
  try {
    const topStores = await pool.query(`SELECT st.name, st.id, COALESCE(SUM(s.total_price),0) as revenue FROM stores st LEFT JOIN sales s ON s.store_id = st.id AND s.created_at >= DATE_TRUNC('month', NOW()) GROUP BY st.id, st.name ORDER BY revenue DESC LIMIT 10`);
    const topProducts = await pool.query(`SELECT p.name, p.icon, SUM(s.quantity) as qty, SUM(s.total_price) as revenue FROM sales s JOIN products p ON s.product_id = p.id WHERE s.created_at >= DATE_TRUNC('month', NOW()) GROUP BY p.id, p.name, p.icon ORDER BY revenue DESC LIMIT 10`);
    const dailyChart = await pool.query(`SELECT DATE(created_at) as day, SUM(total_price) as total, COUNT(DISTINCT receipt_id) as checks FROM sales WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY day ASC`);
    res.json({ top_stores: topStores.rows, top_products: topProducts.rows, daily_chart: dailyChart.rows });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/dev/notify', authenticateToken, requireDev, async (req, res) => {
  try {
    const { message } = req.body;
    res.json({ message: 'Уведомление записано' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/notifications', authenticateToken, requireDev, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dev_notifications ORDER BY sent_at DESC LIMIT 50');
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/promos', authenticateToken, requireDev, async (req, res) => {
  try {
    const code = 'DUKON-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    res.json({ message: 'Промокод создан', code });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/login-history', authenticateToken, requireDev, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM login_history ORDER BY logged_in_at DESC LIMIT 100');
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/map', authenticateToken, requireDev, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.name, s.location, s.latitude, s.longitude, s.is_blocked, s.plan,
             o.name as owner_name, o.email as owner_email,
             COALESCE((SELECT SUM(total_price) FROM sales WHERE store_id = s.id AND created_at >= CURRENT_DATE), 0) as today_revenue,
             (SELECT MAX(created_at) FROM sales WHERE store_id = s.id) as last_sale
      FROM stores s JOIN owners o ON s.owner_id = o.id
    `);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/system', authenticateToken, requireDev, async (req, res) => {
  try {
    const os = require('os');
    const dbSize = await pool.query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
    const tableStats = await pool.query(`SELECT relname as table_name, n_live_tup as rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC`);
    res.json({
      uptime: process.uptime(),
      memory_used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
      memory_total: Math.round(os.totalmem() / 1024 / 1024),
      db_size: dbSize.rows[0].size,
      node_version: process.version,
      tables: tableStats.rows
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dev/errors', authenticateToken, requireDev, async (req, res) => {
  res.json(errorLog.slice(0, 50));
});

// === НАСИЯ ===

// Получить всех клиентов магазина
app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    let store_id;
    if (req.user.role === 'employee') {
      const emp = await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username]);
      store_id = emp.rows[0].store_id;
    } else {
      const st = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
      store_id = st.rows[0].id;
    }
    const result = await pool.query(`
      SELECT c.*, 
        COALESCE(SUM(CASE WHEN n.is_paid = false THEN n.amount ELSE 0 END), 0) as debt,
        COUNT(CASE WHEN n.is_paid = false THEN 1 END) as open_count
      FROM clients c
      LEFT JOIN nasiya n ON n.client_id = c.id
      WHERE c.store_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `, [store_id]);
    res.json(result.rows);
  } catch(err) { console.error('clients error:', err.message); res.status(500).json({ error: err.message }); }
});

// Добавить клиента
app.post('/api/clients', authenticateToken, async (req, res) => {
  const { name, phone, note } = req.body;
  try {
    const store_id = req.user.role === 'employee'
      ? (await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username])).rows[0].store_id
      : (await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id])).rows[0].id;
    const result = await pool.query(
      'INSERT INTO clients (store_id, name, phone, note) VALUES ($1, $2, $3, $4) RETURNING *',
      [store_id, name.trim(), phone || '', note || '']
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

// Удалить клиента
app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM nasiya WHERE client_id = $1', [req.params.id]);
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

// Получить долги клиента
app.get('/api/nasiya/:clientId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM nasiya WHERE client_id = $1 ORDER BY created_at DESC',
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

// Добавить долг
app.post('/api/nasiya', authenticateToken, async (req, res) => {
  const { client_id, amount, description } = req.body;
  try {
    const store_id = req.user.role === 'employee'
      ? (await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username])).rows[0].store_id
      : (await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id])).rows[0].id;
    const result = await pool.query(
      'INSERT INTO nasiya (store_id, client_id, amount, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [store_id, client_id, amount, description || '']
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

// Отметить долг оплаченным
app.patch('/api/nasiya/:id/pay', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE nasiya SET is_paid = true, paid_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

// === НАСИЯ ЧЕКИ (ЗАМОРОЖЕННЫЕ) ===

// Заморозить чек
app.post('/api/nasiya-carts', authenticateToken, async (req, res) => {
  const { client_id, items, total_price } = req.body;
  const client = await pool.connect();
  try {
    let store_id, created_by;
    if (req.user.role === 'employee') {
      const emp = await pool.query('SELECT store_id, name FROM employees WHERE username = $1', [req.user.username]);
      store_id = emp.rows[0].store_id;
      created_by = emp.rows[0].name || req.user.username;
    } else {
      store_id = (await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id])).rows[0].id;
      created_by = 'Владелец';
    }

    // Генерация receipt_id
    const now = new Date();
    const prefix = `N${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}`;
    const count = (await pool.query('SELECT COUNT(*) FROM nasiya_carts WHERE store_id=$1 AND receipt_id LIKE $2', [store_id, `${prefix}-%`])).rows[0].count;
    const receipt_id = `${prefix}-${String(parseInt(count)+1).padStart(4,'0')}`;

    await client.query('BEGIN');

    // Резервируем товары — уменьшаем остаток
    for (const item of items) {
      const upd = await client.query(
        'UPDATE inventory SET stock = stock - $1 WHERE store_id=$2 AND product_id=$3 AND stock >= $1 RETURNING stock',
        [item.qty, store_id, item.id]
      );
      if (upd.rows.length === 0) throw new Error(`Недостаточно товара: ${item.name}`);
    }

    const result = await client.query(
      'INSERT INTO nasiya_carts (store_id, client_id, receipt_id, items, total_price, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [store_id, client_id, receipt_id, JSON.stringify(items), total_price, created_by]
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch(err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally { client.release(); }
});

// Получить замороженные чеки магазина
app.get('/api/nasiya-carts', authenticateToken, async (req, res) => {
  try {
    let store_id;
    if (req.user.role === 'employee') {
      store_id = (await pool.query('SELECT store_id FROM employees WHERE username=$1', [req.user.username])).rows[0].store_id;
    } else {
      store_id = (await pool.query('SELECT id FROM stores WHERE owner_id=$1 LIMIT 1', [req.user.owner_id])).rows[0].id;
    }
    const result = await pool.query(`
      SELECT nc.*, c.name as client_name, c.phone as client_phone
      FROM nasiya_carts nc
      LEFT JOIN clients c ON c.id = nc.client_id
      WHERE nc.store_id=$1 AND nc.status='frozen'
      ORDER BY nc.created_at DESC
    `, [store_id]);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});

// Оплатить замороженный чек
app.patch('/api/nasiya-carts/:id/pay', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const cart = (await pool.query('SELECT * FROM nasiya_carts WHERE id=$1', [req.params.id])).rows[0];
    if (!cart) return res.status(404).json({ error: 'Чек не найден' });
    if (cart.status === 'paid') return res.status(400).json({ error: 'Уже оплачен' });

    await client.query('BEGIN');

    // Записать продажи
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth()+1).padStart(2,'0');
    const monthPrefix = `${yy}${mm}`;
    const countRes = await client.query(
      'SELECT COUNT(DISTINCT receipt_id) as c FROM sales WHERE store_id=$1 AND receipt_id LIKE $2',
      [cart.store_id, `${monthPrefix}-%`]
    );
    const receipt_id = `${monthPrefix}-${String(parseInt(countRes.rows[0].c)+1).padStart(4,'0')}`;

    for (const item of cart.items) {
      const price = await pool.query('SELECT price FROM products WHERE id=$1', [item.id]);
      await client.query(
        'INSERT INTO sales (store_id, product_id, quantity, total_price, receipt_id, payment_method) VALUES ($1,$2,$3,$4,$5,$6)',
        [cart.store_id, item.id, item.qty, price.rows[0].price * item.qty, receipt_id, 'nasiya']
      );
    }

    await client.query('UPDATE nasiya_carts SET status=$1, paid_at=NOW() WHERE id=$2', ['paid', cart.id]);
    await client.query('COMMIT');
    res.json({ ok: true, receipt_id });
  } catch(err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Отменить замороженный чек (вернуть товары)
app.patch('/api/nasiya-carts/:id/cancel', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const cart = (await pool.query('SELECT * FROM nasiya_carts WHERE id=$1', [req.params.id])).rows[0];
    if (!cart || cart.status !== 'frozen') return res.status(400).json({ error: 'Нельзя отменить' });

    await client.query('BEGIN');
    // Вернуть товары в склад
    for (const item of cart.items) {
      await client.query('UPDATE inventory SET stock=stock+$1 WHERE store_id=$2 AND product_id=$3', [item.qty, cart.store_id, item.id]);
    }
    await client.query('UPDATE nasiya_carts SET status=$1 WHERE id=$2', ['cancelled', cart.id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch(err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Обновить поставщика
app.put('/api/suppliers/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  const { name, phone, visit_days, debt, last_delivery, notes } = req.body;
  try {
    const result = await pool.query(
      'UPDATE suppliers SET name=$1, phone=$2, visit_days=$3, debt=$4, last_delivery=$5, notes=$6 WHERE id=$7 AND owner_id=$8 RETURNING *',
      [name, phone, visit_days, debt||0, last_delivery||null, notes||'', req.params.id, req.user.owner_id]
    );
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: 'Ошибка' }); }
});
