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

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет доступа' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Токен истек' });
    req.user = user; next();
  });
}

// === АВТОРИЗАЦИЯ ===
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, await bcrypt.genSalt(10));
    const newOwner = await pool.query('INSERT INTO owners (email, password_hash) VALUES ($1, $2) RETURNING id', [email, hash]);
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
      return res.json({ token: jwt.sign({ owner_id: empRes.rows[0].owner_id, store_id: empRes.rows[0].store_id, role: 'employee', username: empRes.rows[0].username }, process.env.JWT_SECRET, { expiresIn: '7d' }), role: 'employee' });
    }
    res.status(401).json({ error: 'Не найден' });
  } catch (err) { res.status(500).json({ error: 'Ошибка входа' }); }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'owner') {
      const ownerRes = await pool.query('SELECT name FROM owners WHERE id = $1', [req.user.owner_id]);
      res.json({ role: 'owner', name: ownerRes.rows[0]?.name });
    } else {
      const empRes = await pool.query('SELECT e.name, s.name as store_name FROM employees e JOIN stores s ON e.store_id = s.id WHERE e.username = $1', [req.user.username]);
      res.json({ role: 'employee', name: empRes.rows[0]?.name, store_name: empRes.rows[0]?.store_name });
    }
  } catch (err) { res.status(500).json({ error: 'Ошибка профиля' }); }
});

// === СЕТЬ И МАГАЗИНЫ ===
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const period = req.query.period || 'today';
    let dateFilter = "s.created_at >= CURRENT_DATE"; 
    if (period === 'week') dateFilter = "s.created_at >= CURRENT_DATE - INTERVAL '7 days'";
    if (period === 'month') dateFilter = "s.created_at >= CURRENT_DATE - INTERVAL '30 days'";
    const result = await pool.query(`SELECT COALESCE(SUM(s.total_price), 0) as total_revenue, COUNT(s.id) as total_checks FROM sales s JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 AND ${dateFilter};`, [req.user.owner_id]);
    res.json({ revenue: Number(result.rows[0].total_revenue), checks: Number(result.rows[0].total_checks) });
  } catch (err) { res.status(500).json({ error: 'Ошибка дашборда' }); }
});

app.get('/api/stores', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const dateParam = req.query.date;
    let dateCondition = "created_at >= CURRENT_DATE";
    let queryParams = [req.user.owner_id];
    if (dateParam) { dateCondition = "DATE(created_at) = $2"; queryParams.push(dateParam); }
    const result = await pool.query(`SELECT s.id, s.name, s.location, (SELECT COUNT(*) FROM employees WHERE store_id = s.id) as emp_count, COALESCE((SELECT SUM(total_price) FROM sales WHERE store_id = s.id AND ${dateCondition}), 0) as total_revenue, (SELECT COUNT(id) FROM sales WHERE store_id = s.id AND ${dateCondition}) as total_checks FROM stores s WHERE s.owner_id = $1 ORDER BY s.id ASC;`, queryParams);
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
    const result = await pool.query(`SELECT e.id, e.name, e.username, s.name as store_name, s.id as store_id FROM employees e JOIN stores s ON e.store_id = s.id WHERE s.owner_id = $1 ORDER BY e.id DESC;`, [req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.post('/api/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Запрещено' });
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(req.body.password, salt);
    await pool.query('INSERT INTO employees (store_id, username, password_hash, name) VALUES ($1, $2, $3, $4)', [req.body.store_id, req.body.username, hash, req.body.name]);
    res.json({ message: 'Создано' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

app.get('/api/logs/:store_id', authenticateToken, async (req, res) => {
  try {
    const dateParam = req.query.date;
    let dateCondition = "s.created_at >= CURRENT_DATE";
    let queryParams = [req.params.store_id];
    if (dateParam) { dateCondition = "DATE(s.created_at) = $2"; queryParams.push(dateParam); }
    const logs = await pool.query(`SELECT s.total_price, s.created_at, p.name as product_name, s.quantity FROM sales s JOIN products p ON s.product_id = p.id WHERE s.store_id = $1 AND ${dateCondition} ORDER BY s.created_at DESC LIMIT 50;`, queryParams);
    res.json(logs.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка логов' }); }
});

app.get('/api/logs_all', authenticateToken, async (req, res) => {
  try {
    const logs = await pool.query(`SELECT s.total_price, s.created_at, p.name as product_name, s.quantity, st.name as store_name FROM sales s JOIN products p ON s.product_id = p.id JOIN stores st ON s.store_id = st.id WHERE st.owner_id = $1 ORDER BY s.created_at DESC LIMIT 150;`, [req.user.owner_id]);
    res.json(logs.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка логов' }); }
});

// === ИНВЕНТАРИЗАЦИЯ И ТОВАРЫ ===
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      const store_id = req.user.store_id || (await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username])).rows[0].store_id;
      const result = await pool.query(`SELECT p.id, p.icon, p.name, p.category, p.barcode, p.price, i.stock FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.store_id = $1 ORDER BY p.id DESC;`, [store_id]);
      res.json(result.rows);
    } else {
      const result = await pool.query(`SELECT p.id, p.icon, p.name, p.category, p.barcode, p.price, SUM(i.stock) as stock FROM products p JOIN inventory i ON p.id = i.product_id JOIN stores st ON i.store_id = st.id WHERE st.owner_id = $1 GROUP BY p.id, p.icon, p.name, p.category, p.barcode, p.price ORDER BY p.id DESC;`, [req.user.owner_id]);
      res.json(result.rows);
    }
  } catch (err) { res.status(500).json({ error: 'Ошибка БД' }); }
});

// АЛГОРИТМ АНТИ-ДУБЛИРОВАНИЯ ТОВАРОВ
app.post('/api/products', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  const { name, category, price, icon, target_store_id, stock } = req.body; 
  const initialStock = parseInt(stock) || 0;
  
  try {
    // Ищем, есть ли такой товар
    const existRes = await pool.query('SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND owner_id = $2', [name.trim(), req.user.owner_id]);
    let productId;

    if (existRes.rows.length > 0) {
        // Товар найден! Не создаем дубликат, просто берем его ID
        productId = existRes.rows[0].id;
        // Обновляем ему цену и категорию (вдруг владелец решил поменять)
        await pool.query('UPDATE products SET price = $1, category = $2, icon = $3 WHERE id = $4', [price, category, icon || '📦', productId]);
    } else {
        // Товара нет - создаем
        const newP = await pool.query('INSERT INTO products (name, category, price, icon, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING id', [name.trim(), category, price, icon || '📦', req.user.owner_id]);
        productId = newP.rows[0].id;

        // Создаем записи с 0 остатком для ВСЕХ магазинов
        const storesRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1', [req.user.owner_id]);
        for (let store of storesRes.rows) {
            await pool.query('INSERT INTO inventory (store_id, product_id, stock) VALUES ($1, $2, 0)', [store.id, productId]);
        }
    }

    // Начисляем остаток
    if (target_store_id) {
        // Добавлено из "Инвентаризации" -> кладем только в этот магазин
        await pool.query('UPDATE inventory SET stock = stock + $1 WHERE store_id = $2 AND product_id = $3', [initialStock, target_store_id, productId]);
    } else {
        // Добавлено из "Базы товаров" -> кладем в первый магазин по умолчанию
        if (initialStock > 0) {
             const firstStore = await pool.query('SELECT id FROM stores WHERE owner_id = $1 ORDER BY id ASC LIMIT 1', [req.user.owner_id]);
             if (firstStore.rows.length > 0) {
                 await pool.query('UPDATE inventory SET stock = stock + $1 WHERE store_id = $2 AND product_id = $3', [initialStock, firstStore.rows[0].id, productId]);
             }
        }
    }
    
    res.json({ message: 'Success' });
  } catch (err) { res.status(500).json({ error: 'Ошибка создания' }); }
});

app.get('/api/inventory/:store_id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const result = await pool.query(`SELECT p.id as product_id, p.name, p.category, p.icon, p.price, i.stock FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.store_id = $1 AND p.owner_id = $2 ORDER BY p.id DESC;`, [req.params.store_id, req.user.owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка получения инвентаря' }); }
});

app.post('/api/inventory/update', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  const { store_id, inventory } = req.body; 
  try {
    for (let item of inventory) {
        await pool.query(`UPDATE inventory SET stock = $1 WHERE store_id = $2 AND product_id = $3`, [item.stock, store_id, item.product_id]);
    }
    res.json({ message: 'Остатки успешно обновлены' });
  } catch (err) { res.status(500).json({ error: 'Ошибка обновления инвентаря' }); }
});

app.post('/api/sell', authenticateToken, async (req, res) => {
  const { product_id, quantity, payment_method } = req.body;
  try {
    let store_id;
    if (req.user.role === 'employee') { store_id = req.user.store_id || (await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username])).rows[0].store_id; } 
    else { store_id = (await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id])).rows[0].id; }
    
    const prodRes = await pool.query('SELECT price FROM products WHERE id = $1 AND owner_id = $2', [product_id, req.user.owner_id]);
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    const total_price = prodRes.rows[0].price * quantity;
    
    const updateRes = await pool.query('UPDATE inventory SET stock = stock - $1 WHERE store_id = $2 AND product_id = $3 AND stock >= $1 RETURNING stock;', [quantity, store_id, product_id]);
    if (updateRes.rows.length === 0) return res.status(400).json({ error: 'Мало товара' });
    
    await pool.query('INSERT INTO sales (store_id, product_id, quantity, total_price, payment_method) VALUES ($1, $2, $3, $4, $5)', [store_id, product_id, quantity, total_price, payment_method || 'cash']);
    res.json({ message: 'Продано!' });
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

// === ФИНАНСЫ ===
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

app.post('/api/finance/expense', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
    await pool.query('INSERT INTO expenses (store_id, amount, category, description) VALUES ($1, $2, $3, $4)', [storeRes.rows[0].id, req.body.amount, req.body.category, req.body.description]);
    res.json({ message: 'Расход записан' });
  } catch (err) { res.status(500).json({ error: 'Ошибка расхода' }); }
});

app.listen(port, () => { console.log(`Сервер запущен на ${port}`); });
