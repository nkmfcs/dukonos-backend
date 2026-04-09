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

// Запускаем сервер
app.listen(port, () => {
  console.log(`Сервер DukonOS запущен на порту ${port}`);
});
