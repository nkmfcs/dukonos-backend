require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'dukonos_db',
  password: process.env.DB_PASSWORD, port: 5432,
});

// === АВТОРИЗАЦИЯ ===
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет доступа.' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Токен истек.' });
    req.user = user; next();
  });
}

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const newOwner = await pool.query('INSERT INTO owners (email, password_hash) VALUES ($1, $2) RETURNING id, email', [email, hash]);
    await pool.query('INSERT INTO stores (name, location, owner_id) VALUES ($1, $2, $3)', ['Мой первый магазин', 'Главная точка', newOwner.rows[0].id]);
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
      return res.json({ token: jwt.sign({ owner_id: empRes.rows[0].owner_id, store_id: empRes.rows[0].store_id, role: 'employee' }, process.env.JWT_SECRET, { expiresIn: '7d' }), role: 'employee' });
    }
    res.status(401).json({ error: 'Не найден' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'owner') {
      const ownerRes = await pool.query('SELECT name FROM owners WHERE id = $1', [req.user.owner_id]);
      res.json({ role: 'owner', name: ownerRes.rows[0]?.name });
    } else {
      const empRes = await pool.query('SELECT name FROM employees WHERE username = $1', [req.user.username]);
      res.json({ role: 'employee', name: empRes.rows[0]?.name });
    }
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

// === ДАШБОРД (ГЛАВНАЯ) ===
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const period = req.query.period || 'today';
    let dateFilter = "created_at::date = CURRENT_DATE"; // По умолчанию СЕГОДНЯ
    if (period === 'week') dateFilter = "created_at >= CURRENT_DATE - INTERVAL '7 days'";
    if (period === 'month') dateFilter = "created_at >= CURRENT_DATE - INTERVAL '30 days'";

    const result = await pool.query(`
      SELECT COALESCE(SUM(total_price), 0) as total_revenue, COUNT(id) as total_checks 
      FROM sales s JOIN stores st ON s.store_id = st.id 
      WHERE st.owner_id = $1 AND ${dateFilter};
    `, [req.user.owner_id]);
    
    res.json({ revenue: Number(result.rows[0].total_revenue), checks: Number(result.rows[0].total_checks) });
  } catch (err) { res.status(500).json({ error: 'Ошибка дашборда' }); }
});

// === СЕТЬ И МАГАЗИНЫ ===
app.get('/api/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    // ВАЖНО: Считаем выручку и чеки только за СЕГОДНЯ (CURRENT_DATE)
    const result = await pool.query(`
      SELECT s.id, s.name, s.location,
        (SELECT COUNT(*) FROM employees WHERE store_id = s.id) as emp_count,
        COALESCE((SELECT SUM(total_price) FROM sales WHERE store_id = s.id AND created_at::date = CURRENT_DATE), 0) as total_revenue,
        (SELECT COUNT(id) FROM sales WHERE store_id = s.id AND created_at::date = CURRENT_DATE) as total_checks
      FROM stores s WHERE s.owner_id = $1 ORDER BY s.id ASC;
    `, [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка сети' }); }
});

app.post('/api/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    await pool.query('INSERT INTO stores (name, location, owner_id) VALUES ($1, $2, $3)', [req.body.name, req.body.location, req.user.owner_id]);
    res.json({ message: 'Добавлено!' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const result = await pool.query(`SELECT e.id, e.name, e.username, s.name as store_name FROM employees e JOIN stores s ON e.store_id = s.id WHERE s.owner_id = $1 ORDER BY e.id DESC;`, [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

// === ТОВАРЫ И ПРОДАЖИ ===
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`SELECT p.id, p.icon, p.name, p.category, p.barcode, p.price, i.stock FROM products p JOIN inventory i ON p.id = i.product_id JOIN stores st ON i.store_id = st.id WHERE st.owner_id = $1;`, [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка БД' }); }
});

app.post('/api/sell', authenticateToken, async (req, res) => {
  const { product_id, quantity, payment_method } = req.body;
  try {
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
    const store_id = storeRes.rows[0].id;
    const prodRes = await pool.query('SELECT price FROM products WHERE id = $1 AND owner_id = $2', [product_id, req.user.owner_id]);
    const total_price = prodRes.rows[0].price * quantity;
    const updateRes = await pool.query('UPDATE inventory SET stock = stock - $1 WHERE store_id = $2 AND product_id = $3 AND stock >= $1 RETURNING stock;', [quantity, store_id, product_id]);
    if (updateRes.rows.length === 0) return res.status(400).json({ error: 'Мало товара' });
    await pool.query('INSERT INTO sales (store_id, product_id, quantity, total_price, payment_method) VALUES ($1, $2, $3, $4, $5)', [store_id, product_id, quantity, total_price, payment_method || 'cash']);
    res.json({ message: 'Продано!' });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// === ФИНАНСЫ (Именно здесь была ошибка 404) ===
app.get('/api/finance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const salesRes = await pool.query(`SELECT payment_method, SUM(total_price) as total FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 GROUP BY payment_method`, [req.user.owner_id]);
    let cash = 0, card = 0;
    salesRes.rows.forEach(r => { if (r.payment_method === 'card') card += Number(r.total); else cash += Number(r.total); });
    const expRes = await pool.query(`SELECT SUM(amount) as total FROM expenses e JOIN stores st ON e.store_id = st.id WHERE st.owner_id = $1`, [req.user.owner_id]);
    const actualCash = cash - (Number(expRes.rows[0].total) || 0);
    const supRes = await pool.query(`SELECT id, name, debt FROM suppliers WHERE owner_id = $1 ORDER BY id ASC`, [req.user.owner_id]);
    res.json({ total_balance: actualCash + card, cash: actualCash, card: card, suppliers: supRes.rows });
  } catch (err) { res.status(500).json({ error: 'Ошибка финансов' }); }
});

app.listen(port, () => { console.log(`Сервер запущен на ${port}`); });
