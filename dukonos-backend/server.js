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

app.get('/api/ping', (req, res) => res.json({ message: 'Бэкенд работает!' }));

// === АВТОРИЗАЦИЯ ===

// 1. Регистрация нового владельца
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Хешируем пароль (превращаем в абракадабру для безопасности)
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Сохраняем владельца в базу
    const newOwner = await pool.query(
      'INSERT INTO owners (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, password_hash]
    );

    res.json({ message: 'Регистрация успешна!', owner: newOwner.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка регистрации (возможно email уже занят)' });
  }
});

// 2. Вход (Логин)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Ищем пользователя в базе
    const userRes = await pool.query('SELECT * FROM owners WHERE email = $1', [email]);
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'Пользователь не найден' });

    const owner = userRes.rows[0];

    // Проверяем пароль
    const validPassword = await bcrypt.compare(password, owner.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Неверный пароль' });

    // Создаем электронный пропуск (токен), который действует 7 дней
    const token = jwt.sign(
      { owner_id: owner.id, email: owner.email }, 
      process.env.JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.json({ token: token, message: 'Успешный вход!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при входе' });
  }
});

// === СТАРЫЕ МАРШРУТЫ (Пока оставляем как есть, защитим их на следующем этапе) ===

app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(`SELECT p.id, p.icon, p.name, p.category, p.barcode, p.price, i.stock FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.store_id = 1;`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка БД' }); }
});

app.post('/api/products', async (req, res) => {
  const { barcode, name, category, price, icon, store_id } = req.body;
  try {
    const newP = await pool.query('INSERT INTO products (barcode, name, category, price, icon) VALUES ($1, $2, $3, $4, $5) RETURNING *', [barcode, name, category, price, icon]);
    const productId = newP.rows[0].id;
    await pool.query('INSERT INTO inventory (store_id, product_id, stock) VALUES ($1, $2, 0)', [store_id || 1, productId]);
    res.json(newP.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Ошибка создания' }); }
});

app.post('/api/sell', async (req, res) => {
  const { store_id, product_id, quantity } = req.body;
  try {
    const prodRes = await pool.query('SELECT price FROM products WHERE id = $1', [product_id]);
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    const total_price = prodRes.rows[0].price * quantity;
    const updateRes = await pool.query('UPDATE inventory SET stock = stock - $1 WHERE store_id = $2 AND product_id = $3 AND stock >= $1 RETURNING stock;', [quantity, store_id, product_id]);
    if (updateRes.rows.length === 0) return res.status(400).json({ error: 'Мало товара' });
    await pool.query('INSERT INTO sales (store_id, product_id, quantity, total_price) VALUES ($1, $2, $3, $4)', [store_id, product_id, quantity, total_price]);
    res.json({ message: 'Продано!', leftInStock: updateRes.rows[0].stock });
  } catch (err) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COALESCE(SUM(total_price), 0) as total_revenue, COUNT(id) as total_checks FROM sales WHERE store_id = 1;`);
    res.json({ revenue: Number(result.rows[0].total_revenue), checks: Number(result.rows[0].total_checks) });
  } catch (err) { res.status(500).json({ error: 'Ошибка дашборда' }); }
});

app.listen(port, () => { console.log(`Сервер запущен на ${port}`); });
