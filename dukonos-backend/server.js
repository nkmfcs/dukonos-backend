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
  user: 'postgres',
  host: 'localhost',
  database: 'dukonos_db',
  password: process.env.DB_PASSWORD, 
  port: 5432,
});

// === ФЕЙСКОНТРОЛЬ ===
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Доступ запрещен.' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Токен истек.' });
    req.user = user; 
    next();
  });
}

// === АВТОРИЗАЦИЯ И ПРОФИЛЬ ===
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const newOwner = await pool.query('INSERT INTO owners (email, password_hash) VALUES ($1, $2) RETURNING id, email', [email, password_hash]);
    const ownerId = newOwner.rows[0].id;
    await pool.query('INSERT INTO stores (name, location, owner_id) VALUES ($1, $2, $3)', ['Мой первый магазин', 'Главная точка', ownerId]);
    res.json({ message: 'Регистрация успешна!', owner: newOwner.rows[0] });
  } catch (err) { res.status(500).json({ error: 'Ошибка регистрации' }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body; 
  try {
    let userRes = await pool.query('SELECT * FROM owners WHERE email = $1', [email]);
    if (userRes.rows.length > 0) {
      const owner = userRes.rows[0];
      const validPassword = await bcrypt.compare(password, owner.password_hash);
      if (!validPassword) return res.status(401).json({ error: 'Неверный пароль' });
      const token = jwt.sign({ owner_id: owner.id, role: 'owner', email: owner.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token: token, role: 'owner', message: 'Вход CEO!' });
    }
    let empRes = await pool.query(`SELECT e.*, s.owner_id FROM employees e JOIN stores s ON e.store_id = s.id WHERE e.username = $1`, [email]);
    if (empRes.rows.length > 0) {
      const emp = empRes.rows[0];
      const validPassword = await bcrypt.compare(password, emp.password_hash);
      if (!validPassword) return res.status(401).json({ error: 'Неверный пароль' });
      const token = jwt.sign({ owner_id: emp.owner_id, store_id: emp.store_id, role: 'employee', username: emp.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token: token, role: 'employee', message: 'Вход Кассира!' });
    }
    return res.status(401).json({ error: 'Пользователь не найден' });
  } catch (err) { res.status(500).json({ error: 'Ошибка при входе' }); }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'owner') {
      const ownerRes = await pool.query('SELECT name, email, phone FROM owners WHERE id = $1', [req.user.owner_id]);
      const storeRes = await pool.query('SELECT name as store_name FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
      res.json({ role: 'owner', ...ownerRes.rows[0], store_name: storeRes.rows[0]?.store_name || 'Мой магазин' });
    } else {
      const empRes = await pool.query('SELECT name, username FROM employees WHERE username = $1', [req.user.username]);
      const storeRes = await pool.query('SELECT name as store_name FROM stores WHERE id = $1', [req.user.store_id]);
      res.json({ role: 'employee', ...empRes.rows[0], store_name: storeRes.rows[0]?.store_name || 'Магазин' });
    }
  } catch (err) { res.status(500).json({ error: 'Ошибка загрузки профиля' }); }
});

app.put('/api/me', authenticateToken, async (req, res) => {
  const { name, phone, store_name } = req.body;
  try {
    if (req.user.role === 'owner') {
      await pool.query('UPDATE owners SET name = $1, phone = $2 WHERE id = $3', [name, phone, req.user.owner_id]);
      if (store_name) await pool.query('UPDATE stores SET name = $1 WHERE owner_id = $2', [store_name, req.user.owner_id]);
      res.json({ message: 'Профиль успешно обновлен!' });
    } else { res.status(403).json({ error: 'Кассир не может менять настройки' }); }
  } catch (err) { res.status(500).json({ error: 'Ошибка обновления' }); }
});

// === СОТРУДНИКИ И СЕТЬ ===
app.get('/api/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const result = await pool.query(`SELECT e.id, e.name, e.username, s.name as store_name FROM employees e JOIN stores s ON e.store_id = s.id WHERE s.owner_id = $1 ORDER BY e.id DESC;`, [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  const { name, username, password, store_id } = req.body;
  try {
    let final_store_id = store_id;
    if (!final_store_id) {
      const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
      final_store_id = storeRes.rows[0].id;
    }
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    await pool.query('INSERT INTO employees (store_id, username, password_hash, name) VALUES ($1, $2, $3, $4)', [final_store_id, username, hash, name]);
    res.json({ message: 'Создано' });
  } catch (err) { res.status(500).json({ error: 'Логин занят' }); }
});

app.get('/api/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const result = await pool.query(`SELECT s.id, s.name, s.location, (SELECT COUNT(*) FROM employees WHERE store_id = s.id) as emp_count, COALESCE((SELECT SUM(total_price) FROM sales WHERE store_id = s.id), 0) as total_revenue FROM stores s WHERE s.owner_id = $1 ORDER BY s.id ASC;`, [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    await pool.query('INSERT INTO stores (name, location, owner_id) VALUES ($1, $2, $3)', [req.body.name, req.body.location, req.user.owner_id]);
    res.json({ message: 'Добавлено!' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

// === ТОВАРЫ И ПРОДАЖИ ===
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`SELECT COALESCE(SUM(total_price), 0) as total_revenue, COUNT(id) as total_checks FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1;`, [req.user.owner_id]);
    res.json({ revenue: Number(result.rows[0].total_revenue), checks: Number(result.rows[0].total_checks) });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`SELECT p.id, p.icon, p.name, p.category, p.barcode, p.price, i.stock FROM products p JOIN inventory i ON p.id = i.product_id JOIN stores st ON i.store_id = st.id WHERE st.owner_id = $1;`, [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка БД' }); }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  const { barcode, name, category, price, icon, stock } = req.body;
  try {
    const newP = await pool.query('INSERT INTO products (barcode, name, category, price, icon, owner_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [barcode, name, category, price, icon, req.user.owner_id]);
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
    await pool.query('INSERT INTO inventory (store_id, product_id, stock) VALUES ($1, $2, $3)', [storeRes.rows[0].id, newP.rows[0].id, stock ? Number(stock) : 0]);
    res.json(newP.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/sell', authenticateToken, async (req, res) => {
  const { product_id, quantity, payment_method } = req.body;
  const p_method = payment_method || 'cash';
  try {
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
    const store_id = storeRes.rows[0].id;
    const prodRes = await pool.query('SELECT price FROM products WHERE id = $1 AND owner_id = $2', [product_id, req.user.owner_id]);
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    const total_price = prodRes.rows[0].price * quantity;
    const updateRes = await pool.query('UPDATE inventory SET stock = stock - $1 WHERE store_id = $2 AND product_id = $3 AND stock >= $1 RETURNING stock;', [quantity, store_id, product_id]);
    if (updateRes.rows.length === 0) return res.status(400).json({ error: 'Мало товара' });
    await pool.query('INSERT INTO sales (store_id, product_id, quantity, total_price, payment_method) VALUES ($1, $2, $3, $4, $5)', [store_id, product_id, quantity, total_price, p_method]);
    res.json({ message: 'Продано!', leftInStock: updateRes.rows[0].stock });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  try {
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.owner_id]);
    res.json({ message: 'Удалено!' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

// === НОВЫЙ БЛОК: ФИНАНСЫ И ПОСТАВЩИКИ ===
app.get('/api/finance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    // 1. Считаем всю выручку (Наличные и Карты)
    const salesRes = await pool.query(`SELECT payment_method, SUM(total_price) as total FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 GROUP BY payment_method`, [req.user.owner_id]);
    let cash = 0, card = 0;
    salesRes.rows.forEach(r => {
      if (r.payment_method === 'card') card += Number(r.total);
      else cash += Number(r.total);
    });

    // 2. Считаем все расходы (зарплаты, инкассация и тд)
    const expRes = await pool.query(`SELECT SUM(amount) as total FROM expenses e JOIN stores st ON e.store_id = st.id WHERE st.owner_id = $1`, [req.user.owner_id]);
    const totalExp = Number(expRes.rows[0].total) || 0;

    // Чистая наличка = Все пробитые наличные МИНУС все расходы/изъятия
    const actualCash = cash - totalExp;

    // 3. Долги поставщикам
    const supRes = await pool.query(`SELECT id, name, debt FROM suppliers WHERE owner_id = $1 ORDER BY id ASC`, [req.user.owner_id]);

    res.json({ total_balance: actualCash + card, cash: actualCash, card: card, suppliers: supRes.rows });
  } catch (err) { res.status(500).json({ error: 'Ошибка финансов' }); }
});

app.post('/api/finance/expense', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { amount, category, description } = req.body;
  try {
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
    if (storeRes.rows.length === 0) return res.status(400).json({ error: 'Нет магазина' });
    await pool.query('INSERT INTO expenses (store_id, amount, category, description) VALUES ($1, $2, $3, $4)', [storeRes.rows[0].id, amount, category, description]);
    res.json({ message: 'Расход записан' });
  } catch (err) { res.status(500).json({ error: 'Ошибка расхода' }); }
});

app.post('/api/suppliers/pay', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { supplier_id, amount } = req.body;
  try {
    // Уменьшаем долг поставщику
    await pool.query('UPDATE suppliers SET debt = GREATEST(debt - $1, 0) WHERE id = $2 AND owner_id = $3', [amount, supplier_id, req.user.owner_id]);
    // Записываем как расход, чтобы деньги физически ушли из кассы
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
    await pool.query('INSERT INTO expenses (store_id, amount, category, description) VALUES ($1, $2, $3, $4)', [storeRes.rows[0].id, amount, 'Оплата поставщику', 'Погашение долга']);
    res.json({ message: 'Оплата прошла' });
  } catch (err) { res.status(500).json({ error: 'Ошибка оплаты' }); }
});

app.listen(port, () => { console.log(`Сервер запущен на ${port}`); });
