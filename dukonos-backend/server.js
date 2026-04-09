// Импортируем нужные библиотеки
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = 3000;

// Разрешаем запросы с твоего сайта на Vercel (чтобы не было ошибок CORS)
app.use(cors());
app.use(express.json());

// Настройка подключения к базе данных (пароль мы впишем позже, когда сервер выдаст его)
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dukonos_db',
  password: 'ТВОЙ_ПАРОЛЬ_ОТ_БД', 
  port: 5432,
});

// === НАШИ API МАРШРУТЫ ===

// 1. Проверка, что сервер жив
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Бэкенд DukonOS работает стабильно!' });
});

// 2. Получить список всех товаров с их остатками
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.icon, p.name, p.category, p.barcode, p.price, i.stock 
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE i.store_id = 1; -- Пока берем для 1 магазина
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка базы данных' });
  }
});

// 3. Добавить новый товар (POST-запрос)
app.post('/api/products', async (req, res) => {
  const { barcode, name, category, price, icon } = req.body;
  try {
    const newProduct = await pool.query(
      'INSERT INTO products (barcode, name, category, price, icon) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [barcode, name, category, price, icon]
    );
    res.json(newProduct.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось добавить товар' });
  }
});

// 4. Продажа товара (Списание со склада)
app.post('/api/sell', async (req, res) => {
  const { store_id, product_id, quantity } = req.body;
  
  try {
    // Безопасное списание: проверяем, что товара хватает, и отнимаем количество
    const result = await pool.query(`
      UPDATE inventory 
      SET stock = stock - $1 
      WHERE store_id = $2 AND product_id = $3 AND stock >= $1
      RETURNING stock;
    `, [quantity, store_id, product_id]);

    // Если товар не найден или его меньше, чем хотят купить
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Недостаточно товара на складе!' });
    }

    res.json({ 
      message: 'Товар успешно продан!', 
      leftInStock: result.rows[0].stock 
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера при продаже' });
  }
});

// Запускаем сервер
app.listen(port, () => {
  console.log(`Сервер DukonOS запущен на порту ${port}`);
});
