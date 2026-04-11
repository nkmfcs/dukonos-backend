const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dukonos_db',
  password: 'ТВОЙ_ПАРОЛЬ_ОТ_БД', 
  port: 5432,
});

app.get('/api/ping', (req, res) => res.json({ message: 'Бэкенд работает!' }));

app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.icon, p.name, p.category, p.barcode, p.price, i.stock 
      FROM products p JOIN inventory i ON p.id = i.product_id WHERE i.store_id = 1;
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Ошибка БД' }); }
});

// НОВОЕ: ДОБАВЛЕНИЕ ТОВАРА НА СКЛАД
app.post('/api/products', async (req, res) => {
  const { barcode, name, category, price, icon, store_id } = req.body;
  try {
    // 1. Создаем товар в справочнике
    const newP = await pool.query(
      'INSERT INTO products (barcode, name, category, price, icon) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [barcode, name, category, price, icon]
    );
    const productId = newP.rows[0].id;

    // 2. Сразу привязываем его к складу (остаток 0)
    await pool.query(
      'INSERT INTO inventory (store_id, product_id, stock) VALUES ($1, $2, 0)',
      [store_id || 1, productId]
    );

    res.json(newP.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка создания' }); }
});

app.post('/api/sell', async (req, res) => {
  const { store_id, product_id, quantity } = req.body;
  try {
    const prodRes = await pool.query('SELECT price FROM products WHERE id = $1', [product_id]);
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Товар не найден' });
    
    const total_price = prodRes.rows[0].price * quantity;

    const updateRes = await pool.query(`
      UPDATE inventory SET stock = stock - $1 
      WHERE store_id = $2 AND product_id = $3 AND stock >= $1 RETURNING stock;
    `, [quantity, store_id, product_id]);

    if (updateRes.rows.length === 0) return res.status(400).json({ error: 'Мало товара' });

    await pool.query(`
      INSERT INTO sales (store_id, product_id, quantity, total_price) 
      VALUES ($1, $2, $3, $4)
    `, [store_id, product_id, quantity, total_price]);

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
