require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

app.use(cors());
// Важно: увеличиваем лимит, чтобы картинки (Base64) пролезали в запросах
app.use(express.json({ limit: '10mb' })); 

const pool = new Pool({
  user: 'postgres', host: 'localhost', database: 'dukonos_db',
  password: process.env.DB_PASSWORD, port: 5432,
});

// === НАСТРОЙКА S3 ДЛЯ ФОТОГРАФИЙ ===
const s3 = new AWS.S3({
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  s3ForcePathStyle: true,
});

async function uploadImageToS3(base64String) {
  if (!base64String || !base64String.startsWith('data:image')) return null;

  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;

  const type = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const fileName = `products/${uuidv4()}.${type.split('/')[1]}`;

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: fileName,
    Body: buffer,
    ContentType: type,
    ACL: 'public-read' 
  };

  const uploadResult = await s3.upload(params).promise();
  return uploadResult.Location; 
}
// ====================================

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
    await pool.query('INSERT INTO stores (name, location, owner_id) VALUES ($1, $2, $3)', [req.body.name, req.body.location, req.user.owner_id]);
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
    await pool.query('INSERT INTO employees (store_id, username, password_hash, name) VALUES ($1, $2, $3, $4)', [req.body.store_id, req.body.username, hash, req.body.name]);
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
        UPDATE employees 
        SET password_hash = $1 
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
// 📦 ИНВЕНТАРИЗАЦИЯ И ТОВАРЫ (ОБНОВЛЕННАЯ ЛОГИКА)
// ==============================================

// Получение товаров (Для Базы и для Кассы)
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    if (req.user.role === 'employee') {
      // Работник видит только то, что есть в его магазине
      const store_id = req.user.store_id || (await pool.query('SELECT store_id FROM employees WHERE username = $1', [req.user.username])).rows[0].store_id;
      const result = await pool.query(`
          SELECT p.id, p.icon, p.name, p.category as cat, p.price, i.stock, p.image_url as image 
          FROM products p JOIN inventory i ON p.id = i.product_id 
          WHERE i.store_id = $1 ORDER BY p.id DESC;
      `, [store_id]);
      res.json(result.rows);
    } else {
      // Владелец видит ВСЕ товары (Главный склад)
      const result = await pool.query(`
          SELECT id, icon, name, category as cat, price, stock, min_stock as "minStock", image_url as image 
          FROM products WHERE owner_id = $1 ORDER BY id DESC;
      `, [req.user.owner_id]);
      res.json(result.rows);
    }
  } catch (err) { res.status(500).json({ error: 'Ошибка БД' }); }
});

// Создание нового товара (На Главный склад)
app.post('/api/products', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  const { name, cat, price, icon, stock, minStock, image } = req.body; 
  
  try {
    let imageUrl = image;
    if (image && image.startsWith('data:image')) {
        imageUrl = await uploadImageToS3(image);
    }

    const newP = await pool.query(`
        INSERT INTO products (name, category, price, icon, owner_id, stock, min_stock, image_url) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [name.trim(), cat, price, icon || '📦', req.user.owner_id, stock || 0, minStock || 10, imageUrl]);
    
    const saved = newP.rows[0];
    res.json({ id: saved.id, name: saved.name, cat: saved.category, price: saved.price, stock: saved.stock, minStock: saved.min_stock, image: saved.image_url, icon: saved.icon });
  } catch (err) { res.status(500).json({ error: 'Ошибка создания' }); }
});

// Редактирование товара
app.put('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  const { id } = req.params;
  const { name, cat, price, stock, minStock, icon, image } = req.body;
  try {
    let imageUrl = image;
    if (image && image.startsWith('data:image')) {
        imageUrl = await uploadImageToS3(image);
    }

    const result = await pool.query(`
       UPDATE products 
       SET name = $1, category = $2, price = $3, stock = $4, min_stock = $5, icon = $6, image_url = $7 
       WHERE id = $8 AND owner_id = $9 RETURNING *
    `, [name.trim(), cat, price, stock, minStock, icon, imageUrl, id, req.user.owner_id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
    const updated = result.rows[0];
    res.json({ id: updated.id, name: updated.name, cat: updated.category, price: updated.price, stock: updated.stock, minStock: updated.min_stock, image: updated.image_url, icon: updated.icon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удаление товара (И с базы, и из всех магазинов)
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только владелец' });
  try {
    await pool.query('DELETE FROM inventory WHERE product_id = $1', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.owner_id]);
    res.json({ message: 'Удалено!' });
  } catch (err) { res.status(500).json({ error: 'Ошибка' }); }
});

// Сохранение остатков конкретного магазина (Вкладка "Инвентаризация")
app.post('/api/inventory/update', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  
  // Фронтенд должен присылать JSON вида: { store_id: 1, inventory: { "5": 20, "12": 0 } }
  // Где "5" и "12" это product_id, а 20 и 0 — это stock.
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

// ==============================================


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
        const prodRes = await pool.query('SELECT price FROM products WHERE id = $1 AND owner_id = $2', [item.product_id, req.user.owner_id]);
        if (prodRes.rows.length === 0) throw new Error(`Товар не найден`);
        
        const total_price = prodRes.rows[0].price * item.quantity;
        
        const updateRes = await pool.query('UPDATE inventory SET stock = stock - $1 WHERE store_id = $2 AND product_id = $3 AND stock >= $1 RETURNING stock;', [item.quantity, store_id, item.product_id]);
        if (updateRes.rows.length === 0) throw new Error('Недостаточно товара на складе');
        
        await pool.query('INSERT INTO sales (store_id, product_id, quantity, total_price, payment_method, receipt_id) VALUES ($1, $2, $3, $4, $5, $6)', [store_id, item.product_id, item.quantity, total_price, payment_method || 'cash', receipt_id]);
    }

    await pool.query('COMMIT');
    res.json({ message: 'Чек успешно пробит!', receipt_id });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Ошибка при пробитии чека' });
  }
});


// === ПОСТАВЩИКИ (КОМПАНИИ) ===
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
      'INSERT INTO suppliers (name, phone, visit_days, debt, owner_id) VALUES ($1, $2, $3, 0, $4)',
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
    
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
    const desc = 'Оплата долга поставщику #' + supplier_id;
    await pool.query('INSERT INTO expenses (store_id, amount, category, description) VALUES ($1, $2, $3, $4)', [storeRes.rows[0].id, amount, 'Оплата поставщикам', desc]);
    
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

app.post('/api/finance/expense', authenticateToken, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Только для владельца' });
  try {
    const storeRes = await pool.query('SELECT id FROM stores WHERE owner_id = $1 LIMIT 1', [req.user.owner_id]);
    await pool.query('INSERT INTO expenses (store_id, amount, category, description) VALUES ($1, $2, $3, $4)', [storeRes.rows[0].id, req.body.amount, req.body.category, req.body.description]);
    res.json({ message: 'Расход записан' });
  } catch (err) { res.status(500).json({ error: 'Ошибка расхода' }); }
});

app.listen(port, () => { console.log(`Сервер запущен на ${port}`); });
