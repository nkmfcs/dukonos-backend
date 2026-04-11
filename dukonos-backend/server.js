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

// === ФЕЙСКОНТРОЛЬ (ОХРАННИК) ===
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Достаем токен из заголовка

  if (!token) return res.status(401).json({ error: 'Доступ запрещен. Нет пропуска.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Токен истек или подделан.' });
    req.user = user; // Пропускаем! В req.user теперь лежит { owner_id: 2, email: 'ceo@...' }
    next();
  });
}

// === ОТКРЫТЫЕ МАРШРУТЫ (Вход и Регистрация) ===
app.get('/api/ping', (req, res) => res.json({ message: 'Бэкенд работает!' }));

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 1. Создаем владельца
    const newOwner = await pool.query(
      'INSERT INTO owners (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, password_hash]
    );
    const ownerId = newOwner.rows[0].id;

    // 2. АВТОМАТИКА: Сразу создаем ему его первый личный магазин!
    await pool.query(
      'INSERT INTO stores (name, location, owner_id) VALUES ($1, $2, $3)',
      ['Мой первый магазин', 'Главная точка', ownerId]
    );

    res.json({ message: 'Регистрация успешна!', owner: newOwner.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM owners WHERE email = $1', [email]);
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'Пользователь не найден' });

    const owner = userRes.rows[0];
    const validPassword = await bcrypt.compare(password, owner.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Неверный пароль' });

    const token = jwt.sign({ owner_id: owner.id, email: owner.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: token, message: 'Успешный вход!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при входе' });
  }
});

// === ЗАКРЫТЫЕ МАРШРУТЫ (Только с токеном) ===

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const owner_id = req.user.owner_id;
    // Считаем выручку только по тем магазинам, которые принадлежат этому owner_id
    const result = await pool.query(`
      SELECT COALESCE(SUM(s.total_price), 0) as total_revenue, COUNT(s.id) as total_checks 
      FROM sales s 
      JOIN stores st ON s.store_id = st.id 
      WHERE st.owner_id = $1;
    `, [owner_id]);
    res.json({ revenue: Number(result.rows[0].total_revenue), checks: Number(result.rows[0].total_checks) });
  } catch (err) { res.status(500).json({ error: 'Ошибка дашборда' }); }
});

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const owner_id = req.user.owner_id;
    // Отдаем товары только этого владельца
    const result = await pool.query(`
      SELECT p.id, p.icon, p.name, p.category, p.barcode, p.price, i.stock 
      FROM products p 
      JOIN inventory i ON p.id = i.product_id 
      JOIN stores st ON i.store_id = st.id 
      WHERE st.owner_id = $1;
    `, [owner_id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка БД' }); }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  const { barcode, name, category, price, icon } = req.body;
  const owner_id = req.user.owner_id;
  try {
    // Сохраняем товар с привязкой к владельцу
    const newP = await pool.query(
      'INSERT INTO products (barcode, name, category, price, icon, owner_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [barcode, name, category, price, icon, owner_id]
    );
    const productId = newP.rows[0].id;
    
    // Узнаем ID магазина этого владельца
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [owner_id]);
    const store_id = storeRes.rows[0].id;

    // Кладем на склад
    await pool.query('INSERT INTO inventory (store_id, product_id, stock) VALUES ($1, $2, 0)', [store_id, productId]);
    res.json(newP.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка создания' }); }
});

app.post('/api/sell', authenticateToken, async (req, res) => {
  const { product_id, quantity } = req.body;
  const owner_id = req.user.owner_id;
  try {
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [owner_id]);
    if (storeRes.rows.length === 0) return res.status(400).json({ error: 'Магазин не найден' });
    const store_id = storeRes.rows[0].id;

    const prodRes = await pool.query('SELECT price FROM products WHERE id = $1 AND owner_id = $2', [product_id, owner_id]);
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    
    const total_price = prodRes.rows[0].price * quantity;
    const updateRes = await pool.query('UPDATE inventory SET stock = stock - $1 WHERE store_id = $2 AND product_id = $3 AND stock >= $1 RETURNING stock;', [quantity, store_id, product_id]);
    if (updateRes.rows.length === 0) return res.status(400).json({ error: 'Мало товара' });
    
    await pool.query('INSERT INTO sales (store_id, product_id, quantity, total_price) VALUES ($1, $2, $3, $4)', [store_id, product_id, quantity, total_price]);
    res.json({ message: 'Продано!', leftInStock: updateRes.rows[0].stock });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.listen(port, () => { console.log(`Сервер запущен на ${port}`); });
