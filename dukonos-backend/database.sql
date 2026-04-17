-- Таблица магазинов (точек)
CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active'
);

-- Таблица сотрудников
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id),
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50),
    pin_code VARCHAR(4) NOT NULL
);

-- Таблица всех товаров (справочник)
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    price DECIMAL(10, 2) NOT NULL,
    icon VARCHAR(10)
);

-- Таблица остатков (сколько какого товара в каком магазине)
CREATE TABLE inventory (
    store_id INTEGER REFERENCES stores(id),
    product_id INTEGER REFERENCES products(id),
    stock INTEGER DEFAULT 0,
    PRIMARY KEY (store_id, product_id)
);

-- Вставляем тестовый магазин и товар (чтобы было с чем работать)
INSERT INTO stores (name, address) VALUES ('Market Юнусабад', 'ул. Амира Темура, 114');
INSERT INTO products (barcode, name, category, price, icon) VALUES ('4820000000001', 'Coca-Cola 0.5л', 'Напитки', 6000, '🥤');
INSERT INTO inventory (store_id, product_id, stock) VALUES (1, 1, 142);

-- Таблица магазинов
CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255)
);

-- Добавим твой магазин по умолчанию
INSERT INTO stores (name, address) VALUES ('Baraka', 'Основной магазин');

-- Таблица товаров (Главный склад)
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cat VARCHAR(100),
    price NUMERIC NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 10,
    image_url TEXT
);

-- Таблица инвентаризации (Распределение по магазинам)
CREATE TABLE inventory (
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (store_id, product_id)
);
